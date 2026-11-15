/**
 * Client scoring pipeline: keyword match first, meaning match in place, no Gemini on the default path.
 * Uses the real 50-paper fixture and a deterministic fake /api/embed (see server/embed/localModel.test.ts
 * for the same checks against the real local model).
 */
import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import fixture from "../tests/fixtures/papers50.json";
import { hashEmbed } from "../tests/hashEmbedder";
import {
  keywordScorePapers, semanticScorePapers, scoreProgressively, passageHighlights, paperEmbeddingText, paperEmbeddingId,
  calibrateSimilarity, PAPER_TEXT_MAX_CHARS, type EmbedFn, type EmbedRequestBody,
} from "./embeddingService";
import type { ResearchPaper } from "../types";

const papers: ResearchPaper[] = (fixture as any[]).map(p => ({ ...p, authors: "A", source: "openalex", openalex_id: p.id } as any));
// Calibration-neutral fake model name: cosine maps linearly 0.5..0.9 -> 0..100.
const fakeEmbed = (log: EmbedRequestBody[] = []): EmbedFn => async body => {
  log.push(body);
  return { model: "test-hash", provider: "test", dims: 256, query: body.query ? hashEmbed(body.query) : undefined, documents: body.documents?.map(d => hashEmbed(d.text)) };
};

const realFetch = globalThis.fetch;
let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  (globalThis as any).fetch = async (url: any, init: any) => {
    const path = new URL(String(url), "http://x").pathname;
    fetched.push(path);
    if (path === "/api/embed") {
      const body = JSON.parse(init.body);
      return new Response(JSON.stringify(await fakeEmbed()(body)), { headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: { code: 429 } }), { status: 429 });
  };
});
afterEach(() => { globalThis.fetch = realFetch; });

describe("keyword match first", () => {
  test("every paper gets a keyword score synchronously, before any embedding call returns", async () => {
    const updates: { stage: string; papers: ResearchPaper[] }[] = [];
    let release!: () => void;
    const gate = new Promise<void>(r => { release = r; });
    const slowEmbed: EmbedFn = async body => { await gate; return fakeEmbed()(body); };
    const done = scoreProgressively(papers, "coral reef bleaching", { embed: slowEmbed, onUpdate: (p, stage) => updates.push({ stage, papers: p }) });
    // Synchronous first update: keyword scores on every card, so no card is ever "Analyzing..." (no Retry).
    expect(updates.length).toBe(1);
    expect(updates[0].stage).toBe("keyword");
    expect(updates[0].papers.every(p => typeof p.semanticScore === "number" && p.scoreSource === "keyword")).toBe(true);
    release();
    expect(await done).toBe("semantic");
    expect(updates.map(u => u.stage)).toEqual(["keyword", "semantic"]);
    // Upgraded in place: same papers, same order, new scores.
    expect(updates[1].papers.map(p => p.id)).toEqual(papers.map(p => p.id));
    expect(updates[1].papers.every(p => p.scoreSource === "semantic")).toBe(true);
  });

  test("keyword scores follow the query (on-topic papers lead) and are 0 for papers without the terms", () => {
    const scored = keywordScorePapers(papers, "coral reef bleaching");
    const top = [...scored].sort((a, b) => b.semanticScore! - a.semanticScore!).slice(0, 8);
    expect(top.every(p => (p as any).topic === "coral reef bleaching")).toBe(true);
    const diabetes = scored.filter(p => (p as any).topic === "type 2 diabetes exercise");
    expect(diabetes.every(p => p.semanticScore === 0)).toBe(true);
  });
});

describe("meaning match", () => {
  test("50 papers -> ONE /api/embed call: raw query + one text per paper (title + abstract, truncated), DOI/OpenAlex ids", async () => {
    const log: EmbedRequestBody[] = [];
    const out = await semanticScorePapers(papers, "learning analytics dashboards", { embed: fakeEmbed(log) });
    expect(out).not.toBeNull();
    expect(log.length).toBe(1);
    expect(log[0].query).toBe("learning analytics dashboards"); // raw query, no HyDE
    expect(log[0].documents!.length).toBe(50);
    log[0].documents!.forEach((d, i) => {
      expect(d.text).toBe(paperEmbeddingText(papers[i]));
      expect(d.text.length).toBeLessThanOrEqual(PAPER_TEXT_MAX_CHARS);
      expect(d.text.startsWith(papers[i].title)).toBe(true);
      expect(d.id).toBe(paperEmbeddingId(papers[i]));
    });
    expect(log[0].documents!.filter(d => d.id?.startsWith("doi:")).length).toBeGreaterThan(30);
  });

  test("default path talks only to /api/embed: no Gemini generate (HyDE) or embed-batch, no 429 path", async () => {
    let hydeCalls = 0;
    const stage = await scoreProgressively(papers, "groundwater contamination arsenic", { onUpdate: () => {}, hydeText: async () => { hydeCalls++; return null; } });
    expect(stage).toBe("semantic");
    expect(fetched).toEqual(["/api/embed"]);
    expect(hydeCalls).toBe(0);
  });

  test("different queries give different scores (computed, not hardcoded)", async () => {
    const a = (await semanticScorePapers(papers, "coral reef bleaching", { embed: fakeEmbed() }))!;
    const b = (await semanticScorePapers(papers, "type 2 diabetes exercise", { embed: fakeEmbed() }))!;
    const differing = a.filter((p, i) => p.semanticScore !== b[i].semanticScore).length;
    expect(differing).toBeGreaterThanOrEqual(18); // every on-topic paper of either query moves
    const mean = (xs: ResearchPaper[], topic: string) => { const t = xs.filter(p => (p as any).topic === topic); return t.reduce((s, p) => s + p.semanticScore!, 0) / t.length; };
    expect(mean(a, "coral reef bleaching")).toBeGreaterThan(mean(b, "coral reef bleaching") + 20);
    expect(mean(b, "type 2 diabetes exercise")).toBeGreaterThan(mean(a, "type 2 diabetes exercise") + 20);
    const topA = [...a].sort((x, y) => y.semanticScore! - x.semanticScore!)[0] as any;
    const topB = [...b].sort((x, y) => y.semanticScore! - x.semanticScore!)[0] as any;
    expect(topA.topic).toBe("coral reef bleaching");
    expect(topB.topic).toBe("type 2 diabetes exercise");
    expect(new Set(a.map(p => p.semanticScore)).size).toBeGreaterThan(5);
  });

  test("embedding service down or rate limited: keyword scores stay, one attempt, never throws", async () => {
    for (const status of [429, 503]) {
      let calls = 0;
      const failing: EmbedFn = async () => { calls++; throw Object.assign(new Error(`embed ${status}`), { status }); };
      const stages: string[] = [];
      const final = await scoreProgressively(papers, "coral reef bleaching", { embed: failing, onUpdate: (_p, s) => stages.push(s) });
      expect(final).toBe("keyword");
      expect(stages).toEqual(["keyword"]);
      expect(calls).toBe(1);
    }
  });

  test("score explanation says match to search term, never quality", async () => {
    const out = (await semanticScorePapers(papers.slice(0, 3), "coral reef bleaching", { embed: fakeEmbed() }))!;
    const text = JSON.stringify(out[0].scoreExplanation);
    expect(text).toContain("search term");
    expect(text).toContain("not a quality rating");
    expect(text).not.toMatch(/Recency"|recency score/);
  });
});

describe("HyDE (off by default)", () => {
  test("when enabled it runs after the meaning match is shown and upgrades again", async () => {
    const order: string[] = [];
    const log: EmbedRequestBody[] = [];
    const final = await scoreProgressively(papers.slice(0, 10), "coral bleaching", {
      embed: fakeEmbed(log), hyde: true,
      hydeText: async q => { order.push("hyde"); return `${q}\nheat stress on reef corals`; },
      onUpdate: (_p, s) => order.push(s),
    });
    expect(final).toBe("hyde");
    expect(order).toEqual(["keyword", "semantic", "hyde", "hyde"]);
    expect(log[0].query).toBe("coral bleaching");
    expect(log[1].query).toContain("heat stress");
  });

  test("a failing HyDE call leaves the meaning match in place", async () => {
    const final = await scoreProgressively(papers.slice(0, 5), "coral", { embed: fakeEmbed(), hyde: true, hydeText: async () => null, onUpdate: () => {} });
    expect(final).toBe("semantic");
  });
});

describe("passage highlights only for the opened paper", () => {
  test("one call with that paper's passages; best passages first", async () => {
    const log: EmbedRequestBody[] = [];
    const paper = papers.find(p => (p as any).topic === "coral reef bleaching" && p.abstract.length > 800)!;
    const spans = await passageHighlights(paper, "coral bleaching heat stress", { embed: fakeEmbed(log) });
    expect(log.length).toBe(1);
    const norm = (t: string) => t.replace(/\s+/g, " ").trim();
    expect(log[0].documents!.every(d => norm(paper.abstract).includes(norm(d.text).slice(0, 40)))).toBe(true);
    expect(spans.length).toBeLessThanOrEqual(2);
    if (spans.length === 2) expect(spans[0].score).toBeGreaterThanOrEqual(spans[1].score);
  });
});

test("calibration maps the bge-small range onto 0-100 and clamps", () => {
  expect(calibrateSimilarity(0.6, "BAAI/bge-small-en-v1.5")).toBe(0);
  expect(calibrateSimilarity(0.9, "BAAI/bge-small-en-v1.5")).toBe(100);
  expect(calibrateSimilarity(0.75, "BAAI/bge-small-en-v1.5")).toBe(50);
  expect(calibrateSimilarity(0.2, "BAAI/bge-small-en-v1.5")).toBe(0);
  expect(calibrateSimilarity(0.99, "BAAI/bge-small-en-v1.5")).toBe(100);
});
