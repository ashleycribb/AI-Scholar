import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import { createEmbedRouter, EmbeddingCache, validateEmbedBody } from "./embedRoute";
import { createGeminiEmbedder, createLocalEmbedder, BGE_QUERY_PREFIX, type TextEmbedder } from "./embedders";
import { hashEmbed } from "../../tests/hashEmbedder";

let embedCalls: { texts: string[]; kind: string }[] = [];
const fake: TextEmbedder = {
  model: "fake-model", provider: "test",
  async embed(texts, kind) { embedCalls.push({ texts, kind }); return texts.map(hashEmbed); },
};

function start(opts: any) {
  const app = express();
  app.use("/api/embed", createEmbedRouter(opts));
  return new Promise<{ url: string; close: () => void }>(res => {
    const srv = app.listen(0, "127.0.0.1", () => res({ url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}`, close: () => srv.close() }));
  });
}
const post = (url: string, body: any, headers: Record<string, string> = {}) =>
  fetch(`${url}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

describe("POST /api/embed", () => {
  let s: { url: string; close: () => void };
  beforeAll(async () => { s = await start({ embedder: fake, perClientPerMinute: 1000 }); });
  afterAll(() => s.close());

  test("embeds query + documents in one call; vectors in order", async () => {
    embedCalls = [];
    const r = await post(s.url, { query: "coral bleaching", documents: [{ id: "doi:10.1/a", text: "coral reefs bleach" }, { text: "diabetes and exercise" }] });
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.model).toBe("fake-model");
    expect(j.documents.length).toBe(2);
    expect(j.query).toEqual(hashEmbed("coral bleaching"));
    expect(j.documents[1]).toEqual(hashEmbed("diabetes and exercise"));
    expect(embedCalls.map(c => c.kind)).toEqual(["document", "query"]);
  });

  test("document vectors are cached by model + id; the query is always embedded fresh", async () => {
    embedCalls = [];
    const docs = [{ id: "doi:10.9/x", text: "groundwater arsenic" }, { id: "openalex:W1", text: "learning dashboards" }];
    const first = await (await post(s.url, { query: "arsenic", documents: docs })).json();
    const second = await (await post(s.url, { query: "dashboards", documents: docs })).json();
    expect(first.cached).toBe(0);
    expect(second.cached).toBe(2);
    expect(embedCalls.filter(c => c.kind === "document").length).toBe(1);
    expect(embedCalls.filter(c => c.kind === "query").map(c => c.texts[0])).toEqual(["arsenic", "dashboards"]);
    expect(second.query).not.toEqual(first.query); // relevance input is per query, never cached
  });

  test("same id with changed text (e.g. abstract arrived later) is re-embedded", async () => {
    await post(s.url, { documents: [{ id: "doi:10.9/y", text: "title only" }] });
    embedCalls = [];
    const j = await (await post(s.url, { documents: [{ id: "doi:10.9/y", text: "title only. Now with an abstract." }] })).json();
    expect(j.cached).toBe(0);
    expect(embedCalls.length).toBe(1);
  });

  test("rejects cross-origin, bad bodies and oversize batches", async () => {
    expect((await post(s.url, { query: "x" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await post(s.url, {})).status).toBe(400);
    expect((await post(s.url, { documents: [{ text: "" }] })).status).toBe(400);
    expect((await post(s.url, { documents: Array.from({ length: 201 }, (_, i) => ({ text: `t${i}` })) })).status).toBe(400);
    expect((await fetch(`${s.url}/api/embed`, { method: "POST", body: "x" })).status).toBe(415);
  });

  test("validateEmbedBody truncates long texts", () => {
    const v = validateEmbedBody({ documents: [{ text: "a".repeat(10_000) }] });
    expect(v.documents![0].text.length).toBe(4000);
  });
});

describe("limits and failures", () => {
  test("per-client rate limit answers 429 with Retry-After", async () => {
    const s = await start({ embedder: fake, perClientPerMinute: 2 });
    try {
      expect((await post(s.url, { query: "a" })).status).toBe(200);
      expect((await post(s.url, { query: "b" })).status).toBe(200);
      const r = await post(s.url, { query: "c" });
      expect(r.status).toBe(429);
      expect(Number(r.headers.get("Retry-After"))).toBeGreaterThan(0);
    } finally { s.close(); }
  });

  test("an embedder failure is a 503 without leaking texts", async () => {
    const broken: TextEmbedder = { model: "m", provider: "test", embed: async () => { throw new Error("secret text here"); } };
    const s = await start({ embedder: broken });
    try {
      const r = await post(s.url, { query: "secret text here" });
      expect(r.status).toBe(503);
      expect(await r.text()).not.toContain("secret");
    } finally { s.close(); }
  });

  test("EMBED_PROVIDER=gemini path: a Gemini 429 is passed on as 429 (client keeps keyword scores)", async () => {
    const llm = { embedBatch: async () => { throw Object.assign(new Error("quota"), { kind: "rate_limited", retryAfterMs: 30_000 }); } } as any;
    const s = await start({ embedder: createGeminiEmbedder(llm) });
    try {
      const r = await post(s.url, { query: "x" });
      expect(r.status).toBe(429);
      expect(r.headers.get("Retry-After")).toBe("30");
    } finally { s.close(); }
  });
});

test("EmbeddingCache evicts least recently used", () => {
  const c = new EmbeddingCache(2);
  c.set("a", "h", [1]); c.set("b", "h", [2]); c.get("a", "h"); c.set("c", "h", [3]);
  expect(c.get("b", "h")).toBeUndefined();
  expect(c.get("a", "h")).toEqual([1]);
});

test("local embedder loads the model once, adds the BGE query instruction, batches, and runs one inference at a time", async () => {
  let loads = 0, active = 0, maxActive = 0;
  const seen: string[][] = [];
  const e = createLocalEmbedder({
    model: "BAAI/bge-small-en-v1.5",
    batchSize: 32,
    loadPipeline: async () => { loads++; return async (texts: string[]) => {
      active++; maxActive = Math.max(maxActive, active); seen.push(texts);
      await new Promise(r => setTimeout(r, 5)); active--;
      return { tolist: () => texts.map(() => [1, 0]) };
    }; },
  });
  const [a, b] = await Promise.all([e.embed(Array.from({ length: 70 }, (_, i) => `d${i}`), "document"), e.embed(["q"], "query")]);
  expect(loads).toBe(1);
  expect(a.length).toBe(70);
  expect(seen.map(t => t.length)).toEqual([32, 32, 6, 1]);
  expect(seen[3][0]).toBe(BGE_QUERY_PREFIX + "q");
  expect(b.length).toBe(1);
  expect(maxActive).toBe(1);
});
