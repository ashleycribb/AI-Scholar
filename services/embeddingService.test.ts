/**
 * End-to-end through the real client stack (embeddingService -> utils/embeddings -> geminiClient -> fetch),
 * with fetch replaced by a fake proxy. Counts proxy calls and checks graceful degradation.
 */
import { test, expect, beforeEach, afterEach, describe } from "bun:test";
import { computeScores } from "./embeddingService";
import { __defaultEmbedder } from "../utils/embeddings";
import type { ResearchPaper } from "../types";

type Hit = { path: string; body: any };
let hits: Hit[] = [];
let respond: (hit: Hit) => Response;
const realFetch = globalThis.fetch;
const realWarn = console.warn, realErr = console.error;
let warns: string[] = [], errs: string[] = [];

const vec = (s: string) => { const v = new Array(8).fill(0); for (let i = 0; i < s.length; i++) v[i % 8] += s.charCodeAt(i); return v; };
const okResponse = (hit: Hit) => new Response(JSON.stringify({ embeddings: hit.body.texts.map((t: string) => ({ values: vec(t) })) }));
const tooMany = (retryAfter?: string) => () => new Response(
  JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", message: "Too many requests to the Gemini proxy (429). Please retry shortly." } }),
  { status: 429, headers: retryAfter ? { "Retry-After": retryAfter } : {} });

const sentence = (p: number, s: number, tag: string) => `${tag} paper ${p} sentence ${s} discusses learning analytics and interoperability of research data in detail.`;
const makePapers = (n: number, tag: string): ResearchPaper[] => Array.from({ length: n }, (_, p) => ({
  id: `${tag}${p}`, title: `${tag} paper ${p} on learning analytics`,
  abstract: Array.from({ length: 6 }, (_, s) => sentence(p, s, tag)).join(" "),
  authors: "A", year: 2024, source: "test",
} as any));

beforeEach(() => {
  hits = []; warns = []; errs = [];
  respond = okResponse;
  __defaultEmbedder.clearMemory(); __defaultEmbedder.resetCooldown();
  (globalThis as any).fetch = async (url: any, init: any) => {
    const hit = { path: new URL(String(url), "http://x").pathname, body: JSON.parse(init.body) };
    hits.push(hit);
    return respond(hit);
  };
  console.warn = (...a: any[]) => { warns.push(a.join(" ")); };
  console.error = (...a: any[]) => { errs.push(a.join(" ")); };
});
afterEach(() => { globalThis.fetch = realFetch; console.warn = realWarn; console.error = realErr; });

describe("search scoring uses batched embeddings", () => {
  test("a 30-result search (~90 passages) makes <= 2 proxy calls, all to /embed-batch", async () => {
    const out = await computeScores(makePapers(30, "a"), vec("learning analytics"), "learning analytics");
    expect(out.length).toBe(30);
    expect(hits.length).toBeLessThanOrEqual(2);
    expect(hits.every(h => h.path === "/api/gemini/embed-batch")).toBe(true);
    const sent = hits.flatMap(h => h.body.texts);
    expect(sent.length).toBe(90);
    expect(new Set(sent).size).toBe(sent.length); // no duplicates on the wire
    expect(hits.every(h => h.body.texts.length <= 100)).toBe(true);
    expect(out.every(p => (p.rawSemanticSimilarity ?? 0) >= 0 && p.semanticScore !== undefined)).toBe(true);
    expect(warns.length).toBe(0);
  });

  test("cache hit: scoring the same results again makes 0 proxy calls and the same scores", async () => {
    const papers = makePapers(30, "b");
    const first = await computeScores(papers, vec("learning analytics"), "learning analytics");
    const callsAfterFirst = hits.length;
    expect(callsAfterFirst).toBeGreaterThan(0);
    const second = await computeScores(papers, vec("learning analytics"), "learning analytics");
    expect(hits.length).toBe(callsAfterFirst);
    expect(second.map(p => [p.id, p.semanticScore])).toEqual(first.map(p => [p.id, p.semanticScore]));
  });

  test("overlapping result sets only embed the new passages", async () => {
    await computeScores(makePapers(10, "c"), vec("q"), "q");
    hits = [];
    await computeScores([...makePapers(10, "c"), ...makePapers(5, "d")], vec("q"), "q");
    expect(hits.length).toBe(1);
    expect(hits[0].body.texts.length).toBe(15); // 5 new papers x 3 passages
  });
});

describe("429 degrades gracefully", () => {
  test("every call 429s: results still render (keyword-ranked), calls stay bounded, one warning, no error spam", async () => {
    respond = tooMany("30"); // longer than the client's wait cap: give up right away
    const papers = makePapers(30, "e");
    const out = await computeScores(papers, vec("learning analytics"), "learning analytics");
    expect(out.length).toBe(30);
    expect(new Set(out.map(p => p.id))).toEqual(new Set(papers.map(p => p.id)));
    expect(out.every(p => typeof p.semanticScore === "number" && Number.isFinite(p.semanticScore))).toBe(true);
    expect(out.some(p => (p.semanticScore ?? 0) > 0)).toBe(true); // ranked lexically, not all zero
    expect(hits.length).toBe(1);
    expect(warns.filter(w => w.includes("[embeddings]")).length).toBe(1);
    expect(errs.length).toBe(0);
    // The next search during the cooldown does not touch the network at all and does not warn again.
    hits = [];
    const again = await computeScores(makePapers(30, "f"), vec("learning analytics"), "learning analytics");
    expect(again.length).toBe(30);
    expect(hits.length).toBe(0);
    expect(warns.filter(w => w.includes("[embeddings]")).length).toBe(1);
  });

  test("no query fallback text: returns papers with numeric scores instead of throwing", async () => {
    respond = tooMany("30");
    const out = await computeScores(makePapers(5, "g"), vec("x"));
    expect(out.length).toBe(5);
    expect(out.every(p => typeof p.semanticScore === "number")).toBe(true);
  });

  test("a short Retry-After is honored, then the search is scored normally", async () => {
    let n = 0;
    respond = h => (n++ === 0 ? tooMany("1")() : okResponse(h));
    const t0 = Date.now();
    const out = await computeScores(makePapers(5, "h"), vec("q"), "q");
    expect(hits.length).toBe(2);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(out.some(p => (p.rawSemanticSimilarity ?? 0) >= 0)).toBe(true);
    expect(warns.length).toBe(0);
  });
});
