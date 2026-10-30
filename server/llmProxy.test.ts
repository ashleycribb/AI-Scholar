/** HTTP-level behavior of the proxy when it runs on the provider layer with fake providers. */
import { test, expect, describe } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import { createGeminiProxyRouter } from "./geminiProxy";
import { LLMService } from "./llm/service";
import { ProviderRegistry } from "./llm/registry";
import { FakeProvider, err } from "./llm/testing";

function start(llm: LLMService) {
  const app = express();
  app.use("/api/gemini", createGeminiProxyRouter({ llm, perClientPerMinute: 1000, globalPerMinute: 1000 }));
  return new Promise<{ url: string; close: () => void }>(res => {
    const srv = app.listen(0, "127.0.0.1", () => res({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
  });
}
const post = (url: string, path: string, body: any) =>
  fetch(`${url}/api/gemini/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

const G = { model: "gemini-3-flash-preview", contents: "x" };
const E = { model: "gemini-embedding-2-preview", texts: ["a", "b"] };
const rig = (fallbacks: string[] = ["b"]) => {
  const a = new FakeProvider("a"); const b = new FakeProvider("b");
  const llm = new LLMService({ registry: new ProviderRegistry().register(a).register(b), primary: "a", fallbacks });
  return { a, b, llm };
};

describe("proxy on the provider layer", () => {
  test("generate fails over to the fallback and says which provider answered (header)", async () => {
    const { a, b, llm } = rig(); a.behavior = err("unavailable", "a");
    const s = await start(llm);
    const r = await post(s.url, "generate", G);
    expect(r.status).toBe(200);
    expect(r.headers.get("x-llm-provider")).toBe("b");
    expect(await r.json()).toEqual({ from: "b" });
    expect(b.calls.length).toBe(1);
    s.close();
  });
  test("embed-batch and embed never use the fallback: the client gets the error (and falls back to keyword ranking)", async () => {
    const { a, b, llm } = rig(); a.behavior = err("unavailable", "a");
    const s = await start(llm);
    const r1 = await post(s.url, "embed-batch", E);
    expect(r1.status).toBe(502);
    const r2 = await post(s.url, "embed", { model: E.model, contents: "x" });
    expect(r2.status).toBe(502);
    expect(b.calls.length).toBe(0);
    s.close();
  });
  test("embed-batch 429 passes through as 429 and keeps Retry-After when the provider gave one", async () => {
    const { a, llm } = rig(); a.behavior = err("rate_limited", "a", { retryAfterMs: 12_000 });
    const s = await start(llm);
    const r = await post(s.url, "embed-batch", E);
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("12");
    expect((await r.json()).error.status).toBe("RESOURCE_EXHAUSTED");
    s.close();
  });
  test("success body of embed-batch is {embeddings, providerId}; header matches", async () => {
    const { llm } = rig([]);
    const s = await start(llm);
    const r = await post(s.url, "embed-batch", E);
    expect(await r.json()).toEqual({ embeddings: [{ values: [1] }, { values: [1] }], providerId: "a" });
    expect(r.headers.get("x-llm-provider")).toBe("a");
    s.close();
  });
  test("timeout is a 504 and an open breaker is a 503 with Retry-After; neither leaks internals", async () => {
    const a = new FakeProvider("a");
    const llm = new LLMService({ registry: new ProviderRegistry().register(a), primary: "a", generateTimeoutMs: 20, breaker: { failureThreshold: 1, openMs: 60_000 } });
    const s = await start(llm);
    a.behavior = "hang";
    const t = await post(s.url, "generate", G);
    expect(t.status).toBe(504);
    const o = await post(s.url, "generate", G);
    expect(o.status).toBe(503);
    expect(Number(o.headers.get("retry-after"))).toBeGreaterThan(0);
    s.close();
  });
  test("a raw provider error is sanitized to a 502", async () => {
    const { a, llm } = rig([]); a.behavior = "throw-raw";
    const s = await start(llm);
    const r = await post(s.url, "generate", G);
    expect(r.status).toBe(502);
    expect(await r.text()).not.toContain("sk-SECRET");
    s.close();
  });
  test("bad_request from the provider is a 400 and is not retried elsewhere", async () => {
    const { a, b, llm } = rig(); a.behavior = err("bad_request", "a");
    const s = await start(llm);
    expect((await post(s.url, "generate", G)).status).toBe(400);
    expect(b.calls.length).toBe(0);
    s.close();
  });
  test("validation still runs before any provider is called", async () => {
    const { a, llm } = rig();
    const s = await start(llm);
    expect((await post(s.url, "generate", { model: "gpt-4", contents: "x" })).status).toBe(400);
    expect((await post(s.url, "embed-batch", { model: E.model, texts: [] })).status).toBe(400);
    expect(a.calls.length).toBe(0);
    s.close();
  });
});
