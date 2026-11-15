/**
 * The real local model (BAAI/bge-small-en-v1.5 via @huggingface/transformers) end to end through POST /api/embed,
 * on 50 real OpenAlex abstracts. The first run downloads the model (~130 MB) to EMBED_MODEL_CACHE_DIR or the
 * transformers cache; model load is excluded from the timing. Set SKIP_LOCAL_MODEL_TESTS=1 to skip offline.
 */
import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import fixture from "../../tests/fixtures/papers50.json";
import { createEmbedRouter } from "./embedRoute";
import { createLocalEmbedder } from "./embedders";
import { scoreProgressively, semanticScorePapers, type EmbedFn } from "../../services/embeddingService";
import type { ResearchPaper } from "../../types";

const skip = process.env.SKIP_LOCAL_MODEL_TESTS === "1";
const papers: ResearchPaper[] = (fixture as any[]).map(p => ({ ...p, authors: "A", source: "openalex", openalex_id: p.id } as any));
const topics = [...new Set((fixture as any[]).map(p => p.topic as string))];

describe.skipIf(skip)("local embedding model", () => {
  let url = "", close = () => {};
  const paths: string[] = [];
  let embed: EmbedFn;
  beforeAll(async () => {
    const embedder = createLocalEmbedder();
    await embedder.warmup(); // download + load, not timed
    const app = express();
    app.use("/api/embed", createEmbedRouter({ embedder }));
    await new Promise<void>(r => { const srv = app.listen(0, "127.0.0.1", () => { url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`; close = () => srv.close(); r(); }); });
    embed = async (body, signal) => {
      paths.push("/api/embed");
      const res = await fetch(`${url}/api/embed`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
      if (!res.ok) throw Object.assign(new Error(`embed ${res.status}`), { status: res.status });
      return res.json();
    };
  }, 300_000);
  afterAll(() => close());

  test("50 papers scored in under 5 s (cold cache), keyword scores first, one HTTP call, no 429", async () => {
    const stages: { stage: string; at: number }[] = [];
    const t0 = performance.now();
    const final = await scoreProgressively(papers, "learning analytics dashboards", {
      embed, onUpdate: (_p, stage) => stages.push({ stage, at: performance.now() - t0 }),
    });
    const ms = performance.now() - t0;
    console.log(`[localModel] keyword at ${stages[0].at.toFixed(1)} ms, meaning match at ${stages[1]?.at.toFixed(0)} ms (50 papers, cold cache)`);
    expect(final).toBe("semantic");
    expect(stages.map(s => s.stage)).toEqual(["keyword", "semantic"]);
    expect(stages[0].at).toBeLessThan(50);
    expect(ms).toBeLessThan(5000);
    expect(paths.length).toBe(1);
  }, 30_000);

  test("each topic query ranks its own papers first, and different queries give different scores", async () => {
    const byQuery: Record<string, ResearchPaper[]> = {};
    for (const t of topics) {
      const out = (await semanticScorePapers(papers, t, { embed }))!;
      byQuery[t] = out;
      const top = [...out].sort((a, b) => b.semanticScore! - a.semanticScore!).slice(0, 8);
      expect(top.filter(p => (p as any).topic === t).length).toBeGreaterThanOrEqual(7);
    }
    const [q1, q2] = topics;
    const differing = byQuery[q1].filter((p, i) => p.semanticScore !== byQuery[q2][i].semanticScore).length;
    expect(differing).toBeGreaterThanOrEqual(15); // off-topic papers sit at 0 for both; every on-topic paper moves
    const mean = (xs: ResearchPaper[], topic: string) => { const t = xs.filter(p => (p as any).topic === topic); return t.reduce((s, p) => s + p.semanticScore!, 0) / t.length; };
    expect(mean(byQuery[q1], q1)).toBeGreaterThan(mean(byQuery[q2], q1) + 30);
    expect(mean(byQuery[q2], q2)).toBeGreaterThan(mean(byQuery[q1], q2) + 30);
  }, 60_000);

  test("calibration: off-topic meaning match stays low, on-topic lands high", async () => {
    const on: number[] = [], off: number[] = [];
    for (const t of topics) {
      for (const p of (await semanticScorePapers(papers, t, { embed }))!) (((p as any).topic === t) ? on : off).push(p.rawSemanticSimilarity!);
    }
    const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    expect(median(off)).toBe(0);
    expect(Math.max(...off)).toBeLessThanOrEqual(25);
    expect(median(on)).toBeGreaterThanOrEqual(60);
    expect(Math.min(...on)).toBeGreaterThanOrEqual(30);
  }, 60_000);
});
