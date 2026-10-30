import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import { createGeminiProxyRouter, validateGenerate, sanitizeUpstreamError } from "./geminiProxy";

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
