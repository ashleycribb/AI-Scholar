/**
 * POST /api/embed: embeddings for search-result scoring, computed on this server.
 *
 * Body: { query?: string, documents?: [{ id?: string, text: string }] }
 * Reply: { model, provider, dims, query?: number[], documents?: number[][], cached: number }
 *
 * Only vectors are cached (per document, keyed by model + DOI/OpenAlex id, else a hash of the text).
 * Relevance is never computed or cached here: the client scores every query fresh against the vectors.
 * The query vector is not cached (one short text, and queries are the user's own words).
 */
import { Router, json, type NextFunction, type Request, type Response } from "express";
import { createHash } from "crypto";
import { createGeminiEmbedder, createLocalEmbedder, type TextEmbedder } from "./embedders";
import type { LLMService } from "../llm";

export const EMBED_MAX_DOCUMENTS = 200;
export const EMBED_MAX_TEXT_CHARS = 4000;

const envInt = (name: string, dflt: number) => {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const fail = (res: Response, code: number, status: string, message: string) =>
  res.status(code).json({ error: { code, status, message } });
const clientId = (req: Request) => {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || "unknown");
};
const textHash = (t: string) => createHash("sha256").update(t).digest("base64url").slice(0, 22);

/** LRU of document vectors. */
export class EmbeddingCache {
  private map = new Map<string, { h: string; v: number[] }>();
  constructor(private max = 20_000) {}
  get(key: string, h: string): number[] | undefined {
    const e = this.map.get(key);
    if (!e || e.h !== h) return undefined; // same id, different text (e.g. abstract filled in later): re-embed
    this.map.delete(key); this.map.set(key, e);
    return e.v;
  }
  set(key: string, h: string, v: number[]) {
    this.map.delete(key); this.map.set(key, { h, v });
    while (this.map.size > this.max) this.map.delete(this.map.keys().next().value as string);
  }
  get size() { return this.map.size; }
}

export interface EmbedRouterOptions {
  embedder?: TextEmbedder;
  /** Needed only for EMBED_PROVIDER=gemini. */
  llm?: Pick<LLMService, "embedBatch">;
  cache?: EmbeddingCache;
  perClientPerMinute?: number;
}

export function createEmbedderFromEnv(llm?: Pick<LLMService, "embedBatch">): TextEmbedder {
  const provider = (process.env.EMBED_PROVIDER || "local").toLowerCase();
  if (provider === "gemini") {
    if (!llm) throw new Error("EMBED_PROVIDER=gemini needs the LLM service");
    return createGeminiEmbedder(llm);
  }
  return createLocalEmbedder();
}

export function validateEmbedBody(body: any): { error?: string; query?: string; documents?: { id?: string; text: string }[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "Body must be a JSON object." };
  const { query, documents } = body;
  if (query !== undefined && (typeof query !== "string" || !query.trim())) return { error: "query must be a non-empty string." };
  if (documents !== undefined && !Array.isArray(documents)) return { error: "documents must be an array." };
  if (query === undefined && (!documents || documents.length === 0)) return { error: "Nothing to embed." };
  if (documents && documents.length > EMBED_MAX_DOCUMENTS) return { error: `Too many documents (max ${EMBED_MAX_DOCUMENTS}).` };
  const docs: { id?: string; text: string }[] = [];
  for (const d of documents ?? []) {
    if (!d || typeof d.text !== "string" || !d.text.trim()) return { error: "Every document needs non-empty text." };
    if (d.id !== undefined && (typeof d.id !== "string" || d.id.length > 300)) return { error: "Document id must be a short string." };
    docs.push({ id: d.id || undefined, text: d.text.trim().slice(0, EMBED_MAX_TEXT_CHARS) });
  }
  return { query: typeof query === "string" ? query.trim().slice(0, EMBED_MAX_TEXT_CHARS) : undefined, documents: docs };
}

export function createEmbedRouter(o: EmbedRouterOptions = {}): Router {
  const router = Router();
  let embedder: TextEmbedder | null = o.embedder ?? null;
  const getEmbedder = () => (embedder ??= createEmbedderFromEnv(o.llm));
  const cache = o.cache ?? new EmbeddingCache(envInt("EMBED_CACHE_MAX_ENTRIES", 20_000));
  const perMin = o.perClientPerMinute ?? envInt("EMBED_PER_CLIENT_PER_MIN", 120);
  const hits = new Map<string, { n: number; reset: number }>();

  router.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader("Cache-Control", "no-store");
    // Same-origin only (browsers always send Origin on POST from another site).
    const origin = req.headers.origin;
    if (origin) {
      let same = false;
      try {
        const oh = new URL(origin).host;
        same = oh === req.headers.host || oh === String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
      } catch { /* invalid */ }
      if (!same) return fail(res, 403, "PERMISSION_DENIED", "Cross-origin requests are not permitted.");
    } else if (req.headers["sec-fetch-site"] === "cross-site") {
      return fail(res, 403, "PERMISSION_DENIED", "Cross-site requests are not permitted.");
    }
    if (req.method !== "POST") return fail(res, 405, "INVALID_ARGUMENT", "POST only.");
    if (!req.is("application/json")) return fail(res, 415, "INVALID_ARGUMENT", "Content-Type must be application/json.");
    const id = clientId(req), now = Date.now();
    if (hits.size > 5000) hits.clear();
    const cur = hits.get(id);
    if (!cur || cur.reset <= now) hits.set(id, { n: 1, reset: now + 60_000 });
    else if (++cur.n > perMin) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((cur.reset - now) / 1000))));
      return fail(res, 429, "RESOURCE_EXHAUSTED", "Too many embedding requests. Please retry shortly.");
    }
    next();
  });

  router.post("/", json({ limit: "1mb" }), async (req: Request, res: Response) => {
    const v = validateEmbedBody(req.body);
    if (v.error) return fail(res, 400, "INVALID_ARGUMENT", v.error);
    try {
      const e = getEmbedder();
      const docs = v.documents ?? [];
      const keys = docs.map(d => `${e.model}|${d.id ? `id:${d.id.toLowerCase()}` : `t:${textHash(d.text)}`}`);
      const hashes = docs.map(d => textHash(d.text));
      const vectors: (number[] | undefined)[] = docs.map((_, i) => cache.get(keys[i], hashes[i]));
      const missing = vectors.map((vec, i) => (vec ? -1 : i)).filter(i => i >= 0);
      if (missing.length) {
        const fresh = await e.embed(missing.map(i => docs[i].text), "document");
        if (fresh.length !== missing.length) throw new Error("embedder returned the wrong number of vectors");
        missing.forEach((i, j) => { vectors[i] = fresh[j]; cache.set(keys[i], hashes[i], fresh[j]); });
      }
      const query = v.query !== undefined ? (await e.embed([v.query], "query"))[0] : undefined;
      const dims = (query ?? vectors[0] ?? []).length;
      res.setHeader("X-Embed-Provider", e.provider);
      res.json({ model: e.model, provider: e.provider, dims, query, documents: v.documents ? vectors : undefined, cached: docs.length - missing.length });
    } catch (err: any) {
      const status = Number(err?.status ?? err?.upstreamStatus);
      if (err?.kind === "rate_limited" || status === 429) {
        if (err?.retryAfterMs) res.setHeader("Retry-After", String(Math.ceil(err.retryAfterMs / 1000)));
        return fail(res, 429, "RESOURCE_EXHAUSTED", "Embedding provider is rate limited.");
      }
      console.error("[embed] failed:", err?.kind || err?.name || "error"); // never log texts
      fail(res, 503, "UNAVAILABLE", "Embedding service unavailable.");
    }
  });

  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large") return fail(res, 413, "INVALID_ARGUMENT", "Request body too large.");
    if (err?.type === "entity.parse.failed") return fail(res, 400, "INVALID_ARGUMENT", "Malformed JSON.");
    fail(res, 500, "INTERNAL", "Internal error.");
  });
  return router;
}
