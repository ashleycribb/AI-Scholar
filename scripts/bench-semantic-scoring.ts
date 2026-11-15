/**
 * Times search-result scoring for the 50-paper fixture with the real local model behind POST /api/embed.
 * Any Gemini call is counted and answered with 429 (as if the preview quota were exhausted), to show the
 * default path never touches it. Usage: bun scripts/bench-semantic-scoring.ts
 */
import express from "express";
import type { AddressInfo } from "net";
import fixture from "../tests/fixtures/papers50.json";
import { createEmbedRouter } from "../server/embed/embedRoute";
import { createLocalEmbedder } from "../server/embed/embedders";
import { scoreProgressively } from "../services/embeddingService";

const embedder = createLocalEmbedder();
let t = performance.now();
await embedder.warmup();
const loadMs = Math.round(performance.now() - t);
const app = express();
app.use("/api/embed", createEmbedRouter({ embedder }));
const srv = await new Promise<any>(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
const base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
const realFetch = globalThis.fetch;
const counts = { embed: 0, gemini: 0, http429: 0 };
(globalThis as any).fetch = async (url: any, init: any) => {
  const path = new URL(String(url), "http://x").pathname;
  if (path === "/api/embed") { counts.embed++; return realFetch(base + path, init); }
  counts.gemini++; counts.http429++;
  return new Response(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED" } }), { status: 429 });
};
const papers = (fixture as any[]).map(p => ({ ...p, authors: "A", source: "openalex", openalex_id: p.id }));
for (const [label, q] of [["cold cache", "learning analytics dashboards"], ["warm cache, new query", "coral reef bleaching"]] as const) {
  Object.assign(counts, { embed: 0, gemini: 0, http429: 0 });
  const at: Record<string, number> = {};
  t = performance.now();
  const final = await scoreProgressively(papers as any, q, { onUpdate: (_p, s) => { at[s] = Math.round(performance.now() - t); } });
  console.log(JSON.stringify({ run: label, modelLoadMs: loadMs, firstScoreShownMs: at.keyword, semanticDoneMs: at.semantic, final, embedCalls: counts.embed, geminiCalls: counts.gemini, http429: counts.http429, textsEmbedded: label === "cold cache" ? 51 : 1 }));
}
srv.close();
process.exit(0);
