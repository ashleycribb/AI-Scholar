import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import { createGeminiProxyRouter, validateGenerate, validateEmbedBatch, sanitizeUpstreamError } from "./geminiProxy";

const SECRET = "test-secret-key-DO-NOT-LEAK";
let calls: any[] = [];
let mode: "ok" | "429" | "403" | "boom" = "ok";

const fakeClient = (apiKey: string) => {
  expect(apiKey).toBe(SECRET);
  return {
    models: {
      generateContent: async (p: any) => {
        calls.push(["gen", p]);
        if (mode === "429") throw Object.assign(new Error(`quota exceeded key=${SECRET}`), { status: 429 });
        if (mode === "403") throw Object.assign(new Error(`bad key ${SECRET}`), { status: 403 });
        if (mode === "boom") throw new Error(`internal ${SECRET}`);
        return { candidates: [{ content: { role: "model", parts: [{ text: "hi" }] } }] };
      },
      embedContent: async (p: any) => { calls.push(["emb", p]); return { embeddings: [{ values: [0.1, 0.2] }] }; },
    },
  } as any;
};

function start(opts: any) {
  const app = express();
  app.use("/api/gemini", createGeminiProxyRouter({ getApiKey: () => SECRET, clientFactory: fakeClient, ...opts }));
  return new Promise<{ url: string; close: () => void }>(res => {
    const srv = app.listen(0, "127.0.0.1", () => res({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
  });
}
const post = (url: string, path: string, body: any, headers: Record<string, string> = {}) =>
  fetch(`${url}/api/gemini/${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

describe("gemini proxy", () => {
  let s: { url: string; close: () => void };
  beforeAll(async () => { s = await start({ perClientPerMinute: 1000, globalPerMinute: 1000, allowedOrigins: ["chrome-extension://abc"] }); });
  afterAll(() => s.close());

  test("generate forwards validated params and returns candidates", async () => {
    mode = "ok"; calls = [];
    const r = await post(s.url, "generate", { model: "gemini-3-flash-preview", contents: "hello", config: { temperature: 0.2, systemInstruction: "x" } });
    expect(r.status).toBe(200);
    expect((await r.json()).candidates[0].content.parts[0].text).toBe("hi");
    expect(calls[0][1]).toEqual({ model: "gemini-3-flash-preview", contents: "hello", config: { temperature: 0.2, systemInstruction: "x" } });
  });
  test("embed works", async () => {
    const r = await post(s.url, "embed", { model: "gemini-embedding-2-preview", contents: "hello" });
    expect(r.status).toBe(200);
    expect((await r.json()).embeddings[0].values).toEqual([0.1, 0.2]);
  });
  test("rejects non-allowlisted model, config key, and non-function tools", async () => {
    for (const body of [
      { model: "../../evil", contents: "x" },
      { model: "gpt-4", contents: "x" },
      { model: "gemini-3-flash-preview", contents: "x", config: { httpOptions: { baseUrl: "http://evil" } } },
      { model: "gemini-3-flash-preview", contents: "x", config: { tools: [{ googleSearch: {} }] } },
      { model: "gemini-3-flash-preview", contents: "" },
      { model: "gemini-3-flash-preview", contents: { a: 1 } },
      { model: "gemini-3-flash-preview", contents: "x", config: { maxOutputTokens: 10_000_000 } },
    ]) expect((await post(s.url, "generate", body)).status).toBe(400);
  });
  test("rejects cross-origin and foreign sec-fetch-site, allows listed extension origin", async () => {
    const body = { model: "gemini-3-flash-preview", contents: "x" };
    expect((await post(s.url, "generate", body, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(s.url, "generate", body, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    const host = new URL(s.url).host;
    expect((await post(s.url, "generate", body, { Origin: `http://${host}` })).status).toBe(200);
    expect((await post(s.url, "generate", body, { Origin: "https://app.example", "X-Forwarded-Host": "app.example" })).status).toBe(200);
    const ext = await post(s.url, "generate", body, { Origin: "chrome-extension://abc" });
    expect(ext.status).toBe(200);
    expect(ext.headers.get("access-control-allow-origin")).toBe("chrome-extension://abc");
    const evil = await post(s.url, "generate", body, { Origin: "https://evil.example" });
    expect(evil.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("preflight only for allowed origins; no wildcard", async () => {
    const ok = await fetch(`${s.url}/api/gemini/generate`, { method: "OPTIONS", headers: { Origin: "chrome-extension://abc" } });
    expect(ok.status).toBe(204);
    const bad = await fetch(`${s.url}/api/gemini/generate`, { method: "OPTIONS", headers: { Origin: "https://evil.example" } });
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
  });
  test("requires JSON content type; malformed and oversize bodies are clean errors", async () => {
    expect((await fetch(`${s.url}/api/gemini/generate`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status).toBe(415);
    expect((await post(s.url, "generate", "{not json")).status).toBe(400);
    expect((await post(s.url, "generate", { model: "gemini-3-flash-preview", contents: "x".repeat(5 * 1024 * 1024) })).status).toBe(413);
  });
  test("upstream errors are sanitized and never leak the key", async () => {
    for (const [m, expected] of [["429", 429], ["403", 502], ["boom", 502]] as const) {
      mode = m;
      const r = await post(s.url, "generate", { model: "gemini-3-flash-preview", contents: "x" });
      const text = await r.text();
      expect(r.status).toBe(expected);
      expect(text).not.toContain(SECRET);
      expect(JSON.parse(text).error.message).toBeTruthy();
    }
    mode = "ok";
  });
  test("503 when key not configured", async () => {
    const s2 = await start({ getApiKey: () => undefined });
    const r = await post(s2.url, "generate", { model: "gemini-3-flash-preview", contents: "x" });
    expect(r.status).toBe(503);
    s2.close();
  });
  test("rate limits per client and globally", async () => {
    const s2 = await start({ perClientPerMinute: 2, globalPerMinute: 100 });
    const b = { model: "gemini-3-flash-preview", contents: "x" };
    expect([(await post(s2.url, "generate", b)).status, (await post(s2.url, "generate", b)).status, (await post(s2.url, "generate", b)).status]).toEqual([200, 200, 429]);
    // different X-Forwarded-For hop => different client
    expect((await post(s2.url, "generate", b, { "X-Forwarded-For": "9.9.9.9" })).status).toBe(200);
    s2.close();
    const s3 = await start({ perClientPerMinute: 100, globalPerMinute: 1 });
    expect((await post(s3.url, "generate", b)).status).toBe(200);
    expect((await post(s3.url, "generate", b, { "X-Forwarded-For": "1.1.1.1" })).status).toBe(429);
    s3.close();
  });
});

test("validateGenerate / sanitizeUpstreamError units", () => {
  expect(validateGenerate({ model: "models/gemini-2.0-flash", contents: [{ role: "user", parts: [{ text: "a" }] }], config: { tools: [{ functionDeclarations: [] }] } }).error).toBeUndefined();
  expect(validateGenerate(null, false).error).toBeTruthy();
  expect(validateGenerate({ model: "gemini-x", contents: "a", config: { outputDimensionality: 8 } }, true).error).toBeUndefined();
  expect(sanitizeUpstreamError({ status: 404 }).status).toBe("NOT_FOUND");
  expect(sanitizeUpstreamError({}).code).toBe(502);
  expect(sanitizeUpstreamError({ status: 400, message: '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}' }).status).toBe("UPSTREAM_AUTH");
});

// ---------------------------------------------------------------------------
// /embed-batch
// ---------------------------------------------------------------------------
describe("gemini proxy: /embed-batch", () => {
  let embedCalls: any[] = [];
  let upstream: "ok" | "short" | "aggregate" | "429" = "ok";
  const batchClient = () => ({
    models: {
      generateContent: async () => ({ candidates: [{ content: { role: "model", parts: [{ text: "hi" }] } }] }),
      embedContent: async (p: any) => {
        embedCalls.push(p);
        if (upstream === "429") throw Object.assign(new Error(`quota ${SECRET}`), { status: 429 });
        if (upstream === "aggregate") return { embeddings: [{ values: [9, 9] }] };
        const n = Array.isArray(p.contents) ? p.contents.length : 1;
        const count = upstream === "short" ? n - 1 : n;
        return { embeddings: Array.from({ length: count }, (_, i) => ({ values: [i, i + 1] })) };
      },
    },
  }) as any;
  const M = "gemini-embedding-2-preview";
  const startB = (opts: any = {}) => start({ clientFactory: batchClient, perClientPerMinute: 1000, globalPerMinute: 1000, ...opts });

  test("returns one vector per text, in order, each text sent as its own Content", async () => {
    const s2 = await startB(); embedCalls = []; upstream = "ok";
    const r = await post(s2.url, "embed-batch", { model: M, texts: ["a", "b", "c"] });
    expect(r.status).toBe(200);
    expect((await r.json()).embeddings).toEqual([{ values: [0, 1] }, { values: [1, 2] }, { values: [2, 3] }]);
    expect(embedCalls.length).toBe(1);
    expect(embedCalls[0].contents).toEqual([
      { role: "user", parts: [{ text: "a" }] }, { role: "user", parts: [{ text: "b" }] }, { role: "user", parts: [{ text: "c" }] }]);
    s2.close();
  });
  test("100 texts is one upstream call", async () => {
    const s2 = await startB(); embedCalls = []; upstream = "ok";
    const r = await post(s2.url, "embed-batch", { model: M, texts: Array.from({ length: 100 }, (_, i) => `t${i}`) });
    expect(r.status).toBe(200);
    expect((await r.json()).embeddings.length).toBe(100);
    expect(embedCalls.length).toBe(1);
    s2.close();
  });
  test("validation: bad model, non-array, empty, non-string, blank, too many, too long, bad config", async () => {
    const s2 = await startB({ embedBatchMaxTexts: 5, embedTextMaxChars: 50 }); embedCalls = []; upstream = "ok";
    for (const body of [
      { model: "../evil", texts: ["a"] },
      { model: "gpt-4", texts: ["a"] },
      { model: M },
      { model: M, texts: "a" },
      { model: M, texts: [] },
      { model: M, texts: ["a", 1] },
      { model: M, texts: ["a", null] },
      { model: M, texts: ["a", { parts: [{ text: "x" }] }] },
      { model: M, texts: ["a", "   "] },
      { model: M, texts: ["a", ""] },
      { model: M, texts: ["1", "2", "3", "4", "5", "6"] },
      { model: M, texts: ["x".repeat(51)] },
      { model: M, texts: ["a"], config: { httpOptions: { baseUrl: "http://evil" } } },
      { model: M, texts: ["a"], config: "x" },
      null, [], "str",
    ]) {
      const r = await post(s2.url, "embed-batch", body as any);
      expect([JSON.stringify(body).slice(0, 60), r.status]).toEqual([JSON.stringify(body).slice(0, 60), 400]);
    }
    expect(embedCalls.length).toBe(0); // nothing invalid reaches Gemini
    expect((await post(s2.url, "embed-batch", { model: M, texts: ["x".repeat(50)], config: { outputDimensionality: 768 } })).status).toBe(200);
    expect(embedCalls[0].config).toEqual({ outputDimensionality: 768 });
    s2.close();
  });
  test("caps are env-tunable and default to 100 texts / 20000 chars", async () => {
    const s2 = await startB(); embedCalls = []; upstream = "ok";
    expect((await post(s2.url, "embed-batch", { model: M, texts: Array.from({ length: 101 }, () => "t") })).status).toBe(400);
    expect((await post(s2.url, "embed-batch", { model: M, texts: ["x".repeat(20_001)] })).status).toBe(400);
    expect((await post(s2.url, "embed-batch", { model: M, texts: ["x".repeat(20_000)] })).status).toBe(200);
    s2.close();
    process.env.GEMINI_PROXY_EMBED_BATCH_MAX_TEXTS = "3";
    try {
      const s3 = await start({ clientFactory: batchClient });
      expect((await post(s3.url, "embed-batch", { model: M, texts: ["a", "b", "c", "d"] })).status).toBe(400);
      expect((await post(s3.url, "embed-batch", { model: M, texts: ["a", "b", "c"] })).status).toBe(200);
      s3.close();
    } finally { delete process.env.GEMINI_PROXY_EMBED_BATCH_MAX_TEXTS; }
  });
  test("a wrong number of vectors from upstream is a 502, never forwarded", async () => {
    const s2 = await startB();
    for (const m of ["short", "aggregate"] as const) {
      upstream = m;
      const r = await post(s2.url, "embed-batch", { model: M, texts: ["a", "b", "c"] });
      expect(r.status).toBe(502);
    }
    upstream = "ok"; s2.close();
  });
  test("upstream 429 is sanitized (no key) and passes through as 429", async () => {
    const s2 = await startB(); upstream = "429";
    const r = await post(s2.url, "embed-batch", { model: M, texts: ["a"] });
    const text = await r.text();
    expect(r.status).toBe(429);
    expect(text).not.toContain(SECRET);
    upstream = "ok"; s2.close();
  });
  test("same guards as the other routes: origin, content type, key configured", async () => {
    const s2 = await startB({ allowedOrigins: ["chrome-extension://abc"] });
    const body = { model: M, texts: ["a"] };
    expect((await post(s2.url, "embed-batch", body, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(s2.url, "embed-batch", body, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await fetch(`${s2.url}/api/gemini/embed-batch`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: "x" })).status).toBe(415);
    const ext = await post(s2.url, "embed-batch", body, { Origin: "chrome-extension://abc" });
    expect(ext.status).toBe(200);
    expect(ext.headers.get("access-control-expose-headers")).toBe("Retry-After");
    s2.close();
    const s3 = await start({ getApiKey: () => undefined });
    expect((await post(s3.url, "embed-batch", body)).status).toBe(503);
    s3.close();
  });

  describe("rate limits", () => {
    test("embed budget is separate from generate: exhausting one does not affect the other", async () => {
      const s2 = await startB({ perClientPerMinute: 2, embedPerClientPerMinute: 2 }); upstream = "ok";
      const g = { model: "gemini-3-flash-preview", contents: "x" };
      const e = { model: M, texts: ["a"] };
      expect([(await post(s2.url, "embed-batch", e)).status, (await post(s2.url, "embed-batch", e)).status, (await post(s2.url, "embed-batch", e)).status]).toEqual([200, 200, 429]);
      expect((await post(s2.url, "generate", g)).status).toBe(200); // generate budget untouched
      expect((await post(s2.url, "generate", g)).status).toBe(200);
      expect((await post(s2.url, "generate", g)).status).toBe(429);
      s2.close();
    });
    test("a batch counts as ONE call against the call budget: 2 batches of 100 fit in a 2-call budget", async () => {
      const s2 = await startB({ embedPerClientPerMinute: 2 }); upstream = "ok";
      const e = { model: M, texts: Array.from({ length: 100 }, (_, i) => `t${i}`) };
      expect([(await post(s2.url, "embed-batch", e)).status, (await post(s2.url, "embed-batch", e)).status, (await post(s2.url, "embed-batch", e)).status]).toEqual([200, 200, 429]);
      s2.close();
    });
    test("texts budget: a batch costs its size, a rejected request consumes nothing, 429 carries Retry-After", async () => {
      const s2 = await startB({ embedTextsPerClientPerMinute: 150 }); upstream = "ok";
      const mk = (n: number) => ({ model: M, texts: Array.from({ length: n }, (_, i) => `t${i}`) });
      expect((await post(s2.url, "embed-batch", mk(100))).status).toBe(200); // 100/150
      const over = await post(s2.url, "embed-batch", mk(60));              // would be 160: rejected, nothing consumed
      expect(over.status).toBe(429);
      const ra = Number(over.headers.get("retry-after"));
      expect(ra).toBeGreaterThanOrEqual(1);
      expect(ra).toBeLessThanOrEqual(60);
      expect((await post(s2.url, "embed-batch", mk(50))).status).toBe(200); // exactly fits the remaining 50
      expect((await post(s2.url, "embed-batch", mk(1))).status).toBe(429);
      s2.close();
    });
    test("per-client and global embed limits, different X-Forwarded-For is a different client", async () => {
      const s2 = await startB({ embedPerClientPerMinute: 1, embedGlobalPerMinute: 100 }); upstream = "ok";
      const e = { model: M, texts: ["a"] };
      expect((await post(s2.url, "embed-batch", e)).status).toBe(200);
      expect((await post(s2.url, "embed-batch", e)).status).toBe(429);
      expect((await post(s2.url, "embed-batch", e, { "X-Forwarded-For": "9.9.9.9" })).status).toBe(200);
      s2.close();
      const s3 = await startB({ embedPerClientPerMinute: 100, embedGlobalPerMinute: 1 });
      expect((await post(s3.url, "embed-batch", e)).status).toBe(200);
      expect((await post(s3.url, "embed-batch", e, { "X-Forwarded-For": "1.1.1.1" })).status).toBe(429);
      s3.close();
    });
    test("single /embed uses the embed budget too, and generate 429s now carry a real Retry-After", async () => {
      const s2 = await startB({ perClientPerMinute: 1, embedPerClientPerMinute: 1 }); upstream = "ok";
      expect((await post(s2.url, "embed", { model: M, contents: "a" })).status).toBe(200);
      expect((await post(s2.url, "embed", { model: M, contents: "a" })).status).toBe(429);
      const g = { model: "gemini-3-flash-preview", contents: "x" };
      expect((await post(s2.url, "generate", g)).status).toBe(200);
      const r = await post(s2.url, "generate", g);
      expect(r.status).toBe(429);
      expect(Number(r.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
      s2.close();
    });
  });
});

test("validateEmbedBatch units", () => {
  expect(validateEmbedBatch({ model: "gemini-embedding-2-preview", texts: ["a", "b"] }).value?.texts).toEqual(["a", "b"]);
  expect(validateEmbedBatch({ model: "gemini-embedding-2-preview", texts: ["a", "b"] }, { maxTexts: 1 }).error).toMatch(/too many/);
  expect(validateEmbedBatch({ model: "gemini-embedding-2-preview", texts: ["ab"] }, { maxTextChars: 1 }).error).toMatch(/too long/);
});
