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
