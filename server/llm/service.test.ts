import { test, expect, describe } from "bun:test";
import { LLMService, type LLMEvent } from "./service";
import { ProviderRegistry } from "./registry";
import { LLMError } from "./errors";
import { FakeProvider, err } from "./testing";

const G = { model: "m", contents: "hi" };
const E = { model: "m", texts: ["a", "b"] };

function setup(opts: { fallbacks?: string[]; embedProvider?: string; timeout?: number; breaker?: any } = {}) {
  const a = new FakeProvider("a"); const b = new FakeProvider("b"); const c = new FakeProvider("c");
  const events: LLMEvent[] = [];
  const svc = new LLMService({
    registry: new ProviderRegistry().register(a).register(b).register(c),
    primary: "a", fallbacks: opts.fallbacks ?? [], embedProvider: opts.embedProvider,
    generateTimeoutMs: opts.timeout ?? 1000, embedTimeoutMs: opts.timeout ?? 1000,
    breaker: opts.breaker, onEvent: e => events.push(e),
  });
  return { a, b, c, svc, events };
}

describe("generate failover", () => {
  test("primary success: fallbacks never called", async () => {
    const { a, b, svc } = setup({ fallbacks: ["b"] });
    expect((await svc.generate(G)).providerId).toBe("a");
    expect(b.calls.length).toBe(0); expect(a.calls.length).toBe(1);
  });
  test("fails over in order on rate_limited / unavailable / timeout-ish / auth / misconfigured", async () => {
    for (const kind of ["rate_limited", "unavailable", "auth", "misconfigured"] as const) {
      const { a, svc, events } = setup({ fallbacks: ["b", "c"] });
      a.behavior = err(kind, "a");
      expect((await svc.generate(G)).providerId).toBe("b");
      expect(events.find(e => e.type === "failover")).toEqual({ type: "failover", capability: "generate", from: "a", to: "b", kind });
    }
  });
  test("walks the whole chain and returns the PRIMARY's error when all fail", async () => {
    const { a, b, c, svc } = setup({ fallbacks: ["b", "c"] });
    a.behavior = err("rate_limited", "a", { retryAfterMs: 5000 }); b.behavior = err("unavailable", "b"); c.behavior = err("unavailable", "c");
    const e = await svc.generate(G).catch(x => x) as LLMError;
    expect(e.kind).toBe("rate_limited"); expect(e.retryAfterMs).toBe(5000);
    expect([a.calls.length, b.calls.length, c.calls.length]).toEqual([1, 1, 1]);
  });
  test("bad_request and not_found do NOT fail over (the input is the problem)", async () => {
    for (const kind of ["bad_request", "not_found", "upstream_error"] as const) {
      const { a, b, svc } = setup({ fallbacks: ["b"] });
      a.behavior = err(kind, "a");
      expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe(kind);
      expect(b.calls.length).toBe(0);
    }
  });
  test("a fallback that cannot serve the model is skipped", async () => {
    const a = new FakeProvider("a"); const b = new FakeProvider("b", {}, /^only-b/); const c = new FakeProvider("c");
    const svc = new LLMService({ registry: new ProviderRegistry().register(a).register(b).register(c), primary: "a", fallbacks: ["b", "c"] });
    a.behavior = err("unavailable", "a");
    expect((await svc.generate(G)).providerId).toBe("c");
    expect(b.calls.length).toBe(0);
  });
  test("a provider without generate capability is skipped; with nothing left the error is returned", async () => {
    const a = new FakeProvider("a", { generate: false });
    const svc = new LLMService({ registry: new ProviderRegistry().register(a), primary: "a" });
    expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe("unsupported");
  });
  test("a raw (non-LLMError) throw is normalized and its text never escapes", async () => {
    const { a, svc } = setup();
    a.behavior = "throw-raw";
    const e = await svc.generate(G).catch(x => x) as LLMError;
    expect(e).toBeInstanceOf(LLMError); expect(e.kind).toBe("unavailable");
    expect(e.message).not.toContain("sk-SECRET");
  });
  test("fallback list ignores duplicates and the primary", async () => {
    const { a, svc } = setup({ fallbacks: ["a", "a"] });
    a.behavior = err("unavailable", "a");
    expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe("unavailable");
    expect(a.calls.length).toBe(1);
  });
});

describe("embeddings never fail over", () => {
  test("embedBatch: primary error is returned even with healthy fallbacks configured", async () => {
    for (const kind of ["rate_limited", "unavailable", "auth", "misconfigured"] as const) {
      const { a, b, c, svc } = setup({ fallbacks: ["b", "c"] });
      a.behavior = err(kind, "a");
      expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe(kind);
      expect(b.calls.length + c.calls.length).toBe(0);
    }
  });
  test("embed (single): same", async () => {
    const { a, b, svc } = setup({ fallbacks: ["b"] });
    a.behavior = err("unavailable", "a");
    expect(((await svc.embed({ model: "m", contents: "x" }).catch(x => x)) as LLMError).kind).toBe("unavailable");
    expect(b.calls.length).toBe(0);
  });
  test("timeout and open breaker on embeddings also do not fail over", async () => {
    const { a, b, svc } = setup({ fallbacks: ["b"], timeout: 20, breaker: { failureThreshold: 1, openMs: 60_000 } });
    a.behavior = "hang";
    expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe("timeout");
    expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe("circuit_open");
    expect(b.calls.length).toBe(0);
  });
  test("embeddings use LLM embedProvider (default primary) and the fallback list is irrelevant", async () => {
    const { a, b, svc } = setup({ embedProvider: "b", fallbacks: ["c"] });
    expect((await svc.embedBatch(E)).providerId).toBe("b");
    expect(a.calls.length).toBe(0); expect(b.calls[0].op).toBe("embedBatch");
  });
  test("embed on a provider without embed capability is an unsupported error, not a switch", async () => {
    const a = new FakeProvider("a", { embed: false }); const b = new FakeProvider("b");
    const svc = new LLMService({ registry: new ProviderRegistry().register(a).register(b), primary: "a", fallbacks: ["b"] });
    expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe("unsupported");
    expect(b.calls.length).toBe(0);
  });
  test("a provider returning the wrong number of vectors is an error, never forwarded", async () => {
    const { a, svc } = setup();
    a.embedBatch = async req => ({ providerId: "a", model: req.model, embeddings: [{ values: [1] }] });
    expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe("unavailable");
  });
});

describe("timeouts", () => {
  test("a hanging provider times out, and generate then fails over", async () => {
    const { a, b, svc } = setup({ fallbacks: ["b"], timeout: 25 });
    a.behavior = "hang";
    const t0 = Date.now();
    expect((await svc.generate(G)).providerId).toBe("b");
    expect(Date.now() - t0).toBeLessThan(500);
    expect(b.calls.length).toBe(1);
  });
  test("with no fallback the caller gets a timeout error", async () => {
    const { a, svc } = setup({ timeout: 25 });
    a.behavior = "hang";
    expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe("timeout");
  });
});

describe("circuit breaker in the service", () => {
  test("opens after consecutive health failures, skips the provider (generate goes straight to fallback), half-open probe closes it", async () => {
    let t = 0;
    const a = new FakeProvider("a"); const b = new FakeProvider("b");
    const svc = new LLMService({
      registry: new ProviderRegistry().register(a).register(b), primary: "a", fallbacks: ["b"],
      breaker: { failureThreshold: 2, openMs: 1000, now: () => t },
    });
    a.behavior = err("unavailable", "a");
    await svc.generate(G); await svc.generate(G);               // 2 failures -> open
    expect(svc.health().find(h => h.providerId === "a")!.state).toBe("open");
    a.calls.length = 0;
    expect((await svc.generate(G)).providerId).toBe("b");
    expect(a.calls.length).toBe(0);                              // not even attempted while open
    t = 1000; a.behavior = "ok";                                 // half-open: probe goes to a and succeeds
    expect((await svc.generate(G)).providerId).toBe("a");
    expect(svc.health().find(h => h.providerId === "a")!.state).toBe("closed");
  });
  test("failed half-open probe re-opens; with no fallback the caller sees circuit_open with a retryAfterMs", async () => {
    let t = 0;
    const a = new FakeProvider("a");
    const svc = new LLMService({ registry: new ProviderRegistry().register(a), primary: "a", breaker: { failureThreshold: 1, openMs: 1000, now: () => t } });
    a.behavior = err("unavailable", "a");
    await svc.generate(G).catch(() => {});
    const open = await svc.generate(G).catch(x => x) as LLMError;
    expect(open.kind).toBe("circuit_open"); expect(open.retryAfterMs).toBe(1000);
    t = 1000;
    expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe("unavailable"); // probe attempted and failed
    expect(((await svc.generate(G).catch(x => x)) as LLMError).kind).toBe("circuit_open");
  });
  test("429s and bad requests never open the breaker (the provider is healthy)", async () => {
    const a = new FakeProvider("a");
    const svc = new LLMService({ registry: new ProviderRegistry().register(a), primary: "a", breaker: { failureThreshold: 2 } });
    a.behavior = err("rate_limited", "a");
    for (let i = 0; i < 5; i++) await svc.generate(G).catch(() => {});
    a.behavior = err("bad_request", "a");
    for (let i = 0; i < 5; i++) await svc.generate(G).catch(() => {});
    expect(svc.health().every(h => h.state === "closed")).toBe(true);
    expect(a.calls.length).toBe(10);
  });
  test("generate and embed have separate breakers for the same provider", async () => {
    const a = new FakeProvider("a");
    const svc = new LLMService({ registry: new ProviderRegistry().register(a), primary: "a", breaker: { failureThreshold: 1, openMs: 60_000 } });
    a.behavior = err("unavailable", "a");
    await svc.embedBatch(E).catch(() => {});
    a.behavior = "ok";
    expect((await svc.generate(G)).providerId).toBe("a"); // embed breaker is open, generate is untouched
    expect(((await svc.embedBatch(E).catch(x => x)) as LLMError).kind).toBe("circuit_open");
  });
  test("breaker state changes are reported", async () => {
    const { a, svc, events } = setup({ breaker: { failureThreshold: 1, openMs: 60_000 } });
    a.behavior = err("unavailable", "a");
    await svc.generate(G).catch(() => {});
    expect(events).toContainEqual({ type: "breaker", providerId: "a", capability: "generate", state: "open" });
  });
});
