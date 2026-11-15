/**
 * Search-result scoring: how well each paper matches the search term. Never a quality rating.
 *
 *  1. keywordScorePapers: BM25+ keyword match, synchronous, shown on every card at once.
 *  2. semanticScorePapers: ONE call to the server's POST /api/embed (a local open embedding model by default,
 *     no Gemini quota) with the raw query and one text per paper (title + abstract, truncated). Cards are
 *     upgraded in place to meaning + keyword match. On any failure it returns null and the keyword scores stay.
 *  3. passageHighlights: passage-level matches, only for the paper the researcher opened.
 *  4. HyDE query expansion is optional (UserSettings.enableHydeQueryExpansion, off by default) and never blocks.
 *
 * The server caches paper vectors (per model + DOI/OpenAlex id); relevance is always computed here, fresh per query.
 */
import type { ResearchPaper, ScoreExplanation, SemanticSpan } from '../types';
import { scorePapersLexical } from '../utils/bm25';
import { cosineSimilarity } from '../utils/math';
import { buildPaperScoreExplanation } from './rerankService';
import { generateHypotheticalAnswer } from './geminiService';

export const KEYWORD_METHOD = 'Keyword match to your search term (BM25+)';
export const SEMANTIC_METHOD = 'Meaning match (text embeddings) + keyword match to your search term';
/** Share of the final match that comes from meaning (embeddings); the rest is keyword match. */
export const MEANING_WEIGHT = 0.7;
/** Characters of title + abstract embedded per paper (bge-small reads ~512 tokens). */
export const PAPER_TEXT_MAX_CHARS = 2000;
/** Papers per /api/embed call (server cap is 200). */
const EMBED_CALL_MAX_DOCS = 200;

/**
 * Cosine -> 0-100 "meaning match", per embedding model. bge-small calibrated on tests/fixtures/papers50.json
 * (50 real OpenAlex abstracts, 5 topics, the 5 topic names as queries): off-topic cosine p50 0.48 / p99 0.60 /
 * max 0.61; on-topic min 0.73 / p50 0.85 / p90 0.905. So 0.60 -> 0% and 0.90 -> 100%
 * (checked by server/embed/localModel.test.ts; re-run scripts/calibrate-embeddings.ts after a model change).
 */
export const MATCH_CALIBRATION: Record<string, { min: number; max: number }> = {
  'BAAI/bge-small-en-v1.5': { min: 0.60, max: 0.90 },
  'gemini-embedding-2-preview': { min: 0.45, max: 0.88 },
};
const DEFAULT_CALIBRATION = { min: 0.5, max: 0.9 };

export const calibrateSimilarity = (cos: number, model: string): number => {
  const { min, max } = MATCH_CALIBRATION[model.split(':')[0]] ?? DEFAULT_CALIBRATION;
  return Math.max(0, Math.min(100, Math.round(((cos - min) / (max - min)) * 100)));
};

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'what', 'how', 'why', 'when',
  'where', 'who', 'which', 'can', 'does', 'into', 'about', 'between', 'using', 'based', 'study', 'paper', 'research', 'of', 'in', 'on', 'to', 'an', 'a', 'is', 'or', 'by']);
const tokens = (t: string) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w.length > 1);
const hasAbstract = (p: ResearchPaper) => !!p.abstract && p.abstract.length > 50 && !p.abstract.includes('No abstract');

/** 0-1 keyword match per paper: BM25+ (relative to the best paper) x share of query terms the paper contains. */
export function keywordMatch(papers: ResearchPaper[], query: string): number[] {
  const terms = [...new Set(tokens(query).filter(t => !STOP.has(t)))];
  if (papers.length === 0 || terms.length === 0) return papers.map(() => 0);
  const bm25 = scorePapersLexical(papers.map(p => ({ title: p.title || '', abstract: hasAbstract(p) ? p.abstract : '' })), terms.join(' '));
  return papers.map((p, i) => {
    const words = new Set(tokens(`${p.title || ''} ${hasAbstract(p) ? p.abstract : ''}`));
    const coverage = terms.filter(t => words.has(t)).length / terms.length;
    return (bm25[i] || 0) * coverage;
  });
}

const explain = (paper: ResearchPaper, query: string, method: string, keywordPct: number, meaningPct?: number): ScoreExplanation => {
  const base = buildPaperScoreExplanation(paper, query, method);
  const inputs = meaningPct === undefined
    ? [
        { label: 'Keyword match', value: `${keywordPct}%`, weight: '100% (meaning match loading)' },
        { label: 'Meaning match', value: 'Calculating…', weight: `${Math.round(MEANING_WEIGHT * 100)}% once ready`, isLoading: true },
      ]
    : [
        { label: 'Meaning match', value: `${meaningPct}%`, weight: `${Math.round(MEANING_WEIGHT * 100)}%` },
        { label: 'Keyword match', value: `${keywordPct}%`, weight: `${Math.round((1 - MEANING_WEIGHT) * 100)}%` },
      ];
  return { ...base, method, inputs: [...inputs, { label: 'Citations, venue, recency', value: 'Not used: this is a match to your search term, not a quality rating', weight: '0%' }] };
};

/** Stage 1: immediate keyword scores (0-100) on every paper. */
export function keywordScorePapers(papers: ResearchPaper[], query: string): ResearchPaper[] {
  const kw = keywordMatch(papers, query);
  return papers.map((p, i) => {
    const pct = Math.round(kw[i] * 100);
    const out: ResearchPaper = { ...p, semanticScore: pct, keywordMatch: pct, scoreSource: 'keyword', rawSemanticSimilarity: undefined };
    out.scoreExplanation = explain(out, query, KEYWORD_METHOD, pct);
    return out;
  });
}

export interface EmbedRequestBody { query?: string; documents?: { id?: string; text: string }[] }
export interface EmbedResponseBody { model: string; provider: string; dims: number; query?: number[]; documents?: number[][]; cached?: number }
export type EmbedFn = (body: EmbedRequestBody, signal?: AbortSignal) => Promise<EmbedResponseBody>;

export class EmbedHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const httpEmbed: EmbedFn = async (body, signal) => {
  const res = await fetch('/api/embed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal });
  if (!res.ok) throw new EmbedHttpError(res.status, `embed ${res.status}`);
  return res.json();
};

export const paperEmbeddingText = (p: ResearchPaper): string =>
  (hasAbstract(p) ? `${p.title || ''}. ${p.abstract}` : `${p.title || ''}. ${p.abstract || ''}`).trim().slice(0, PAPER_TEXT_MAX_CHARS);

/** Cache identity on the server: DOI, else OpenAlex id, else none (the server then keys by a hash of the text). */
export const paperEmbeddingId = (p: ResearchPaper): string | undefined =>
  p.doi ? `doi:${p.doi.toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '')}`
    : p.openalex_id ? `openalex:${p.openalex_id.replace(/^https?:\/\/openalex\.org\//, '')}` : undefined;

export interface SemanticScoreOptions {
  embed?: EmbedFn;
  /** Text to embed as the query; defaults to the raw search term (e.g. a HyDE expansion when enabled). */
  queryText?: string;
  signal?: AbortSignal;
}

/** Stage 2: meaning + keyword match (0-100). Returns null when embeddings are unavailable (keep keyword scores). */
export async function semanticScorePapers(papers: ResearchPaper[], query: string, o: SemanticScoreOptions = {}): Promise<ResearchPaper[] | null> {
  if (papers.length === 0) return [];
  const embed = o.embed ?? httpEmbed;
  const queryText = (o.queryText || query || '').trim();
  if (!queryText) return null;
  try {
    const docs = papers.map(p => ({ id: paperEmbeddingId(p), text: paperEmbeddingText(p) || p.id }));
    let qv: number[] | undefined; let model = '';
    const vectors: number[][] = [];
    for (let i = 0; i < docs.length; i += EMBED_CALL_MAX_DOCS) {
      const r = await embed({ query: i === 0 ? queryText : undefined, documents: docs.slice(i, i + EMBED_CALL_MAX_DOCS) }, o.signal);
      if (i === 0) { qv = r.query; model = r.model; }
      if (!Array.isArray(r.documents) || r.documents.length !== Math.min(EMBED_CALL_MAX_DOCS, docs.length - i)) return null;
      vectors.push(...r.documents);
    }
    if (!qv || qv.length === 0) return null;
    const kw = keywordMatch(papers, query);
    return papers.map((p, i) => {
      const meaning = vectors[i]?.length ? calibrateSimilarity(cosineSimilarity(qv!, vectors[i]), model) : 0;
      const keywordPct = Math.round(kw[i] * 100);
      const score = Math.round(MEANING_WEIGHT * meaning + (1 - MEANING_WEIGHT) * keywordPct);
      const out: ResearchPaper = { ...p, semanticScore: score, keywordMatch: keywordPct, rawSemanticSimilarity: meaning, scoreSource: 'semantic' };
      out.scoreExplanation = explain(out, query, SEMANTIC_METHOD, keywordPct, meaning);
      return out;
    });
  } catch (e: any) {
    if (e?.name !== 'AbortError') console.warn(`[scoring] Meaning match unavailable (${e?.status ?? e?.message ?? 'error'}); keeping keyword match.`);
    return null;
  }
}

/** Splits text into overlapping 3-sentence passages (stride 2). */
export const chunkTextIntoPassages = (text: string): string[] => {
  if (!text || text.length < 50) return text ? [text] : [];
  const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [text];
  if (sentences.length <= 3) return [text.trim()];
  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    const chunk = sentences.slice(i, i + 3).join(' ').trim();
    if (chunk.length > 30) chunks.push(chunk);
    if (i + 3 >= sentences.length) break;
  }
  return chunks;
};

/** Stage 3 (opened paper only): the abstract passages that best match the search term. */
export async function passageHighlights(paper: ResearchPaper, query: string, o: { embed?: EmbedFn; signal?: AbortSignal } = {}): Promise<SemanticSpan[]> {
  if (!hasAbstract(paper) || !query.trim()) return [];
  const passages = chunkTextIntoPassages(paper.abstract).slice(0, 40);
  if (passages.length === 0) return [];
  try {
    const r = await (o.embed ?? httpEmbed)({ query: query.trim(), documents: passages.map(text => ({ text })) }, o.signal);
    if (!r.query || !r.documents || r.documents.length !== passages.length) return [];
    return passages
      .map((text, i) => ({ text, score: calibrateSimilarity(cosineSimilarity(r.query!, r.documents![i]), r.model) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2);
  } catch {
    return [];
  }
}

/** Optional HyDE expansion: one Gemini call, no retries, bounded wait. Returns null when unavailable. */
export async function hydeQueryText(query: string, timeoutMs = 15_000): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const answer = await Promise.race([
      generateHypotheticalAnswer(query, { retries: 0 }),
      new Promise<string>(resolve => { timer = setTimeout(() => resolve(query), timeoutMs); }),
    ]);
    return answer && answer !== query ? `${query}\n${answer}`.slice(0, PAPER_TEXT_MAX_CHARS) : null;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface ProgressiveScoringOptions extends SemanticScoreOptions {
  /** Run the optional HyDE expansion after the meaning match is on screen. Default false. */
  hyde?: boolean;
  /** Test seam for the HyDE call. */
  hydeText?: (query: string) => Promise<string | null>;
  /** Called with each improved set of scores: keyword (synchronously), then meaning, then HyDE. */
  onUpdate: (papers: ResearchPaper[], stage: 'keyword' | 'semantic' | 'hyde') => void;
}

/**
 * Keyword scores right away, then upgrade in place. Never throws; a failed stage leaves the previous scores.
 * Returns the stage that produced the final scores.
 */
export async function scoreProgressively(papers: ResearchPaper[], query: string, o: ProgressiveScoringOptions): Promise<'keyword' | 'semantic' | 'hyde'> {
  if (papers.length === 0) return 'keyword';
  o.onUpdate(keywordScorePapers(papers, query), 'keyword');
  const semantic = await semanticScorePapers(papers, query, o);
  if (!semantic || o.signal?.aborted) return 'keyword';
  o.onUpdate(semantic, 'semantic');
  if (!o.hyde) return 'semantic';
  const expanded = await (o.hydeText ?? hydeQueryText)(query);
  if (!expanded || o.signal?.aborted) return 'semantic';
  const hyde = await semanticScorePapers(papers, query, { ...o, queryText: expanded });
  if (!hyde || o.signal?.aborted) return 'semantic';
  o.onUpdate(hyde, 'hyde');
  return 'hyde';
}

/** One-shot scoring (keyword first, meaning match when available). */
export const calculatePaperScores = async (papers: ResearchPaper[], query: string): Promise<ResearchPaper[]> =>
  (await semanticScorePapers(papers, query)) ?? keywordScorePapers(papers, query);
