import { test, expect, describe } from "bun:test";
import { createEmbedder, hashText, EMBED_TEXT_MAX_CHARS, type PersistentEmbeddingStore } from "./embeddings";

const vecOf = (t: string) => [t.length, t.charCodeAt(0) || 0, 1];

function harness(opts: Partial<Parameters<typeof createEmbedder>[0]> = {}, script: ((n: number, texts: string[]) => any)[] = []) {
  const calls: string[][] = [];
  const sleeps: number[] = [];
  const warns: string[] = [];
  let clock = 1_000_000;
  let inFlight = 0, maxInFlight = 0;
  const client = {
    async embedBatch({ texts }: { model: string; texts: string[] }) {
      calls.push(texts);
      inFlight++; maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(r => setTimeout(r, 1));
      inFlight--;
      const step = script[calls.length - 1];
      if (step) { const out = step(calls.length, texts); if (out instanceof Error) throw out; if (out) return out; }
      return { embeddings: texts.map(t => ({ values: vecOf(t) })) };
    },
  };
  const e = createEmbedder({
    client, sleep: async ms => { sleeps.push(ms); clock += ms; }, now: () => clock, random: () => 0.5,
    warn: m => warns.push(m), store: null, ...opts,
  });
  return { e, calls, sleeps, warns, maxInFlight: () => maxInFlight, advance: (ms: number) => { clock += ms; } };
}
const http = (code: number, retryAfterMs?: number) =>
  Object.assign(new Error(`http ${code}`), { status: code, error: { code, status: code === 429 ? "RESOURCE_EXHAUSTED" : "X", message: "m" }, retryAfterMs });
const texts = (n: number, p = "t") => Array.from({ length: n }, (_, i) => `${p}${i} some passage text`);

describe("batching", () => {
  test("250 texts => 3 proxy calls of <=100, vectors in input order", async () => {
    const { e, calls } = harness();
    const input = texts(250);
    const out = await e.batchEmbedText(input);
    expect(calls.map(c => c.length)).toEqual([100, 100, 50]);
    expect(out.length).toBe(250);
    out.forEach((v, i) => expect(v).toEqual(vecOf(input[i])));
  });
  test("concurrency is limited (default 1, configurable)", async () => {
    const a = harness();
    await a.e.batchEmbedText(texts(350));
    expect(a.maxInFlight()).toBe(1);
    const b = harness({ concurrency: 2 });
    await b.e.batchEmbedText(texts(350));
    expect(b.maxInFlight()).toBe(2);
  });
  test("duplicate texts inside one call are sent once; blanks never are", async () => {
    const { e, calls } = harness();
    const out = await e.batchEmbedText(["a b c", "a b c", "  a b c  ", "", "   ", "d e f"]);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual(["a b c", "d e f"]);
    expect(out[0]).toEqual(out[1]);
    expect(out[0]).toEqual(out[2]);
    expect(out[3]).toEqual([]);
    expect(out[4]).toEqual([]);
    expect(out[5]).toEqual(vecOf("d e f"));
  });
  test("concurrent callers in the same tick share one call and in-flight work is de-duplicated", async () => {
    const { e, calls } = harness();
    const [a, b, c] = await Promise.all([e.embedText("same text"), e.embedText("same text"), e.batchEmbedText(["same text", "other"])]);
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual(["same text", "other"]);
    expect(a).toEqual(b);
    expect(c[0]).toEqual(a);
  });
  test("over-long texts are truncated to the proxy cap", async () => {
    const { e, calls } = harness();
    await e.embedText("x".repeat(EMBED_TEXT_MAX_CHARS + 500));
    expect(calls[0][0].length).toBe(EMBED_TEXT_MAX_CHARS);
  });
  test("a response with the wrong number of vectors is rejected, never paired positionally", async () => {
    const { e, warns } = harness({}, [() => ({ embeddings: [{ values: [1, 2, 3] }] })]);
    const out = await e.batchEmbedText(["one two", "three four"]);
    expect(out).toEqual([[], []]);
    expect(warns.length).toBe(1);
  });
});

describe("cache", () => {
  test("second request for the same texts makes 0 calls", async () => {
    const { e, calls } = harness();
    const input = texts(30);
    await e.batchEmbedText(input);
    expect(calls.length).toBe(1);
    const again = await e.batchEmbedText(input);
    expect(calls.length).toBe(1);
    expect(again.every(v => v.length === 3)).toBe(true);
  });
  test("only the misses are requested", async () => {
    const { e, calls } = harness();
    await e.batchEmbedText(["a a", "b b"]);
    await e.batchEmbedText(["a a", "c c", "b b"]);
    expect(calls[1]).toEqual(["c c"]);
  });
  test("keyed by the FULL text, not a prefix (old code collided on the first 500 chars)", async () => {
    const { e, calls } = harness();
    const base = "p".repeat(600);
    const [x, y] = await e.batchEmbedText([base + "A", base + "B"]);
    expect(calls[0].length).toBe(2);
    expect(hashText(base + "A")).not.toBe(hashText(base + "B"));
    expect(x.length).toBe(3); expect(y.length).toBe(3);
  });
  test("memory cache is bounded (LRU)", async () => {
    const { e, calls } = harness({ memoryEntries: 2 });
    await e.batchEmbedText(["a a"]); await e.batchEmbedText(["b b"]); await e.batchEmbedText(["c c"]);
    await e.batchEmbedText(["a a"]); // evicted
    expect(calls.length).toBe(4);
    await e.batchEmbedText(["c c"]); // still cached
    expect(calls.length).toBe(4);
  });
  test("failures are not cached", async () => {
    const { e, calls, advance } = harness({ maxRetries: 0 }, [() => http(500)]);
    expect(await e.embedText("zzz yyy")).toEqual([]);
    advance(60_000);
    expect(await e.embedText("zzz yyy")).toEqual(vecOf("zzz yyy"));
    expect(calls.length).toBe(2);
  });
  test("persistent store: hit => 0 calls; new vectors are written back", async () => {
    const rows = new Map<string, number[]>();
    const store: PersistentEmbeddingStore = {
      async getMany(keys) { const m = new Map<string, number[]>(); for (const k of keys) if (rows.has(k)) m.set(k, rows.get(k)!); return m; },
      async putMany(entries) { for (const [k, v] of entries) rows.set(k, v); },
    };
    const first = harness({ store });
    await first.e.batchEmbedText(["persist me", "and me"]);
    expect(first.calls.length).toBe(1);
    expect(rows.size).toBe(2);
    const second = harness({ store }); // fresh memory, same store (a page reload)
    const out = await second.e.batchEmbedText(["persist me", "and me"]);
    expect(second.calls.length).toBe(0);
    expect(out[0]).toEqual(vecOf("persist me"));
  });
  test("a broken persistent store never breaks embedding", async () => {
    const store: PersistentEmbeddingStore = { getMany: async () => { throw new Error("idb"); }, putMany: async () => { throw new Error("idb"); } };
    const { e, calls } = harness({ store });
    expect(await e.embedText("fine text")).toEqual(vecOf("fine text"));
    expect(calls.length).toBe(1);
  });
});

describe("rate limits", () => {
  test("429 with Retry-After: waits at least that long (+jitter), then succeeds; no log spam", async () => {
    const { e, calls, sleeps, warns } = harness({}, [() => http(429, 3000)]);
    const out = await e.batchEmbedText(texts(5));
    expect(calls.length).toBe(2);
    expect(sleeps.length).toBe(1);
    expect(sleeps[0]).toBeGreaterThanOrEqual(3000);
    expect(sleeps[0]).toBeLessThanOrEqual(3500);
    expect(out.every(v => v.length === 3)).toBe(true);
    expect(warns.length).toBe(0);
  });
  test("without Retry-After: exponential backoff, bounded retries, then degrade with ONE warning", async () => {
    const { e, calls, sleeps, warns } = harness({}, [() => http(429), () => http(429), () => http(429), () => http(429)]);
    const out = await e.batchEmbedText(texts(5));
    expect(calls.length).toBe(3); // 1 + maxRetries(2)
    expect(sleeps.length).toBe(2);
    expect(sleeps[1]).toBeGreaterThan(sleeps[0]);
    expect(out).toEqual(texts(5).map(() => []));
    expect(warns.length).toBe(1);
  });
  test("a Retry-After longer than the cap gives up immediately instead of hanging the UI", async () => {
    const { e, calls, sleeps, warns } = harness({}, [() => http(429, 45_000)]);
    const out = await e.batchEmbedText(texts(3));
    expect(calls.length).toBe(1);
    expect(sleeps.length).toBe(0);
    expect(out).toEqual([[], [], []]);
    expect(warns.length).toBe(1);
  });
  test("after giving up, later chunks and later searches fail fast (0 calls) until the cooldown ends", async () => {
    const { e, calls, warns, advance } = harness({ chunkSize: 2 }, [() => http(429, 45_000)]);
    const out = await e.batchEmbedText(texts(6));
    expect(calls.length).toBe(1); // chunks 2 and 3 never hit the network
    expect(out.every(v => v.length === 0)).toBe(true);
    await e.batchEmbedText(texts(4, "later"));
    expect(calls.length).toBe(1);
    expect(warns.length).toBe(1); // still one warning for the whole outage
    advance(46_000);
    const ok = await e.batchEmbedText(texts(2, "recovered"));
    expect(calls.length).toBe(2);
    expect(ok.every(v => v.length === 3)).toBe(true);
  });
  test("many texts + 429 never fans out: calls stay bounded by chunks x attempts", async () => {
    const always = Array.from({ length: 50 }, () => () => http(429));
    const { e, calls } = harness({}, always);
    await e.batchEmbedText(texts(300));
    expect(calls.length).toBeLessThanOrEqual(3); // first chunk exhausts its retries, the rest fail fast
  });
  test("non-retryable errors are not retried", async () => {
    const { e, calls, sleeps } = harness({}, [() => http(400)]);
    expect(await e.embedText("bad request")).toEqual([]);
    expect(calls.length).toBe(1);
    expect(sleeps.length).toBe(0);
  });
  test("network errors are retried", async () => {
    const net = Object.assign(new Error("net"), { status: 0, error: { code: 0, status: "NETWORK", message: "x" } });
    const { e, calls } = harness({}, [() => net]);
    expect((await e.embedText("net test")).length).toBe(3);
    expect(calls.length).toBe(2);
  });
});
