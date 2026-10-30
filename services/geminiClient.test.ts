import { test, expect } from "bun:test";
import { createGeminiClient, hydrateResponse } from "./geminiClient";

const mkFetch = (responses: any[], seen: any[] = []) => (async (url: any, init: any) => {
  seen.push({ url: String(url), body: JSON.parse(init.body) });
  const r = responses.shift();
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
}) as any;

test("hydrateResponse restores text and functionCalls", () => {
  const r = hydrateResponse({ candidates: [{ content: { parts: [{ text: "a" }, { text: "b" }, { functionCall: { name: "f", args: { x: 1 } } }] } }] });
  expect(r.text).toBe("ab");
  expect(r.functionCalls).toEqual([{ name: "f", args: { x: 1 } }]);
  expect(hydrateResponse({}).text).toBeUndefined();
  expect(hydrateResponse({}).functionCalls).toBeUndefined();
});

test("generateContent posts to the proxy; no key anywhere in the request", async () => {
  const seen: any[] = [];
  const ai = createGeminiClient({ baseUrl: "http://x/", fetchImpl: mkFetch([{ body: { candidates: [{ content: { parts: [{ text: "ok" }] } }] } }], seen) });
  const r = await ai.models.generateContent({ model: "gemini-3-flash-preview", contents: "q" });
  expect(r.text).toBe("ok");
  expect(seen[0].url).toBe("http://x/api/gemini/generate");
  expect(JSON.stringify(seen[0])).not.toMatch(/apiKey|key/i);
});

test("chat keeps history and replays function responses", async () => {
  const seen: any[] = [];
  const ai = createGeminiClient({ fetchImpl: mkFetch([
    { body: { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "t", args: {} } }] } }] } },
    { body: { candidates: [{ content: { role: "model", parts: [{ text: "done" }] } }] } },
  ], seen) });
  const chat = ai.chats.create({ model: "gemini-3-flash-preview", config: { systemInstruction: "s" } });
  const a = await chat.sendMessage({ message: "hi" });
  expect(a.functionCalls?.[0].name).toBe("t");
  const b = await chat.sendMessage({ message: [{ functionResponse: { name: "t", response: { result: 1 } } }] });
  expect(b.text).toBe("done");
  expect(seen[1].body.contents.map((c: any) => c.role)).toEqual(["user", "model", "user"]);
  expect(seen[1].body.config).toEqual({ systemInstruction: "s" });
  expect(chat.getHistory().length).toBe(4);
});

test("errors keep code/status so retry logic works; failed turn not committed", async () => {
  const ai = createGeminiClient({ fetchImpl: mkFetch([{ status: 429, body: { error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "slow (429)" } } }]) });
  const chat = ai.chats.create({ model: "gemini-3-flash-preview" });
  let err: any;
  try { await chat.sendMessage({ message: "x" }); } catch (e) { err = e; }
  expect(err.status).toBe(429);
  expect(err.error.status).toBe("RESOURCE_EXHAUSTED");
  expect(chat.getHistory().length).toBe(0);
});

import { parseRetryAfter, GeminiHttpError } from "./geminiClient";

test("embedBatch posts {model, texts} to /embed-batch and returns the embeddings", async () => {
  const seen: any[] = [];
  const ai = createGeminiClient({ baseUrl: "http://x/", fetchImpl: mkFetch([{ body: { embeddings: [{ values: [1] }, { values: [2] }] } }], seen) });
  const r = await ai.models.embedBatch({ model: "gemini-embedding-2-preview", texts: ["a", "b"] });
  expect(seen[0].url).toBe("http://x/api/gemini/embed-batch");
  expect(seen[0].body).toEqual({ model: "gemini-embedding-2-preview", texts: ["a", "b"] });
  expect(r.embeddings.map(e => e.values)).toEqual([[1], [2]]);
});

test("a 429 carries the Retry-After header as retryAfterMs", async () => {
  const f = (async () => new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "slow down" } }), { status: 429, headers: { "Retry-After": "7" } })) as any;
  const ai = createGeminiClient({ fetchImpl: f });
  const err: any = await ai.models.embedBatch({ model: "m", texts: ["a"] }).catch(e => e);
  expect(err).toBeInstanceOf(GeminiHttpError);
  expect(err.status).toBe(429);
  expect(err.retryAfterMs).toBe(7000);
  const noHeader = (async () => new Response(JSON.stringify({ error: { code: 429, message: "x" } }), { status: 429 })) as any;
  const e2: any = await createGeminiClient({ fetchImpl: noHeader }).models.embedBatch({ model: "m", texts: ["a"] }).catch(e => e);
  expect(e2.retryAfterMs).toBeUndefined();
});

test("parseRetryAfter: seconds, HTTP date, junk", () => {
  expect(parseRetryAfter("30")).toBe(30_000);
  expect(parseRetryAfter(" 0 ")).toBe(0);
  expect(parseRetryAfter(null)).toBeUndefined();
  expect(parseRetryAfter("soon")).toBeUndefined();
  const now = Date.parse("2026-10-30T12:00:00Z");
  expect(parseRetryAfter("Fri, 30 Oct 2026 12:00:45 GMT", now)).toBe(45_000);
  expect(parseRetryAfter("Fri, 30 Oct 2026 11:00:00 GMT", now)).toBe(0);
  expect(parseRetryAfter("999999999")).toBe(86_400_000);
});
