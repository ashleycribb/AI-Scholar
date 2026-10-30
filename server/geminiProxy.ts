/**
 * Server-side Gemini proxy.
 *
 * The browser (and the Chrome extension) never see GEMINI_API_KEY. They POST
 * to /api/gemini/{generate,embed,embed-batch}; this router validates the request, applies
 * rate limits, and calls Gemini with the key read from the server environment
 * at request time.
 *
 * Hardening (the endpoint is reachable by anyone who can reach the app URL):
 *  - model allowlist (regex), config allowlist, only functionDeclarations tools
 *  - same-origin only (Origin must match Host) unless listed in
 *    GEMINI_PROXY_ALLOWED_ORIGINS (e.g. the extension's chrome-extension://<id>)
 *  - per-client and global fixed-window rate limits; embeddings have their own
 *    budgets (calls AND texts per minute) so a batch embed cannot starve chat/generate
 *  - request body cap, contents size cap
 *  - upstream errors are sanitized; the key is never echoed
 *
 * Provider layer: this router only validates, rate-limits and shapes HTTP. Calls go through an LLMService
 * (server/llm/), which owns provider selection, failover (generate only), timeouts and circuit breaking;
 * the Gemini SDK lives in server/llm/providers/gemini.ts. Responses carry an X-LLM-Provider header.
 *
 * Embedding note: use /embed-batch for more than one text. /embed with an array `contents` is
 * forwarded as-is, and gemini-embedding-2* aggregates a flat list of parts into a single vector.
 */
import express, { type Request, type Response, type NextFunction, Router } from "express";
import type { GoogleGenAI } from "@google/genai";
import { createLLMService } from "./llm/config";
import { LLMError, isLLMError, toHttpError } from "./llm/errors";
import { GEMINI_MODEL_PATTERN, normalizeGeminiError } from "./llm/providers/gemini";
import type { LLMService } from "./llm/service";

export const MODEL_PATTERN = GEMINI_MODEL_PATTERN;
export const GENERATE_CONFIG_KEYS = new Set([
  "systemInstruction", "tools", "responseMimeType", "responseSchema", "temperature",
  "topP", "topK", "maxOutputTokens", "thinkingConfig", "stopSequences", "seed",
]);
export const EMBED_CONFIG_KEYS = new Set(["outputDimensionality", "taskType", "title"]);
const BODY_LIMIT = "4mb";
const MAX_CONTENTS_CHARS = 3_000_000;
/** Defaults for /embed-batch; each is overridable via options or env (see createGeminiProxyRouter). */
export const DEFAULT_EMBED_BATCH_MAX_TEXTS = 100; // Gemini batchEmbedContents accepts up to 100 requests
export const DEFAULT_EMBED_TEXT_MAX_CHARS = 20_000; // ~8k-token input limit of the embedding models, with margin

export interface ProxyOptions {
  /** Returns the API key for the Gemini adapter; defaults to process.env.GEMINI_API_KEY (read per request). */
  getApiKey?: () => string | undefined;
  /** Test seam / alternative backend for the Gemini adapter. */
  clientFactory?: (apiKey: string) => Pick<GoogleGenAI, "models">;
  /** Provider service. Defaults to one built from env (LLM_* variables) with only the Gemini adapter registered. */
  llm?: LLMService;
  /** generate budget (calls per minute). */
  perClientPerMinute?: number;
  globalPerMinute?: number;
  /** embed budget: HTTP calls per minute (a batch call counts once). */
  embedPerClientPerMinute?: number;
  embedGlobalPerMinute?: number;
  /** embed budget: texts per minute (a batch of n counts n), the real quota driver upstream. */
  embedTextsPerClientPerMinute?: number;
  embedTextsGlobalPerMinute?: number;
  /** /embed-batch shape caps. */
  embedBatchMaxTexts?: number;
  embedTextMaxChars?: number;
  allowedOrigins?: string[];
}

class FixedWindowLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs = 60_000) {}
  private sweep(now: number) {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
      if (this.hits.size > 5000) this.hits.clear();
    }
  }
  /** Non-consuming check: would `cost` units fit right now? */
  has(key: string, cost = 1, now = Date.now()): boolean {
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) return cost <= this.limit;
    return cur.n + cost <= this.limit;
  }
  take(key: string, cost = 1, now = Date.now()): boolean {
    this.sweep(now);
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) {
      if (cost > this.limit) return false;
      this.hits.set(key, { n: cost, reset: now + this.windowMs });
      return true;
    }
    if (cur.n + cost > this.limit) return false;
    cur.n += cost;
    return true;
  }
  /** Seconds until the current window for `key` resets (>= 1). */
  retryAfterSeconds(key: string, now = Date.now()): number {
    const cur = this.hits.get(key);
    return cur && cur.reset > now ? Math.max(1, Math.ceil((cur.reset - now) / 1000)) : 1;
  }
}

const envInt = (name: string, dflt: number) => {
  const v = parseInt(process.env[name] || "", 10);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};

const fail = (res: Response, code: number, status: string, message: string) =>
  res.status(code).json({ error: { code, status, message } });

/** Client IP: the last X-Forwarded-For hop (appended by the platform's front end), else the socket. */
const clientId = (req: Request) => {
  const xff = String(req.headers["x-forwarded-for"] || "").split(",").map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : (req.socket.remoteAddress || "unknown");
};

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** Returns an error string, or null when valid; mutates nothing. */
export function validateGenerate(body: any, embed: boolean): { error?: string; value?: any } {
  if (!isPlainObject(body)) return { error: "Body must be a JSON object." };
  const { model, contents, config } = body;
  if (typeof model !== "string" || !MODEL_PATTERN.test(model)) return { error: "Unsupported model." };
  if (!(typeof contents === "string" || Array.isArray(contents)))
    return { error: "contents must be a string or array." };
  if (contents === "" || (Array.isArray(contents) && contents.length === 0)) return { error: "contents is empty." };
  let size = 0;
  try { size = JSON.stringify(contents).length; } catch { return { error: "contents not serializable." }; }
  if (size > MAX_CONTENTS_CHARS) return { error: "contents too large." };
  const clean: Record<string, unknown> = {};
  if (config !== undefined) {
    if (!isPlainObject(config)) return { error: "config must be an object." };
    const allowed = embed ? EMBED_CONFIG_KEYS : GENERATE_CONFIG_KEYS;
    for (const k of Object.keys(config)) {
      if (!allowed.has(k)) return { error: `config.${k} is not permitted.` };
      clean[k] = config[k];
    }
    if (!embed && clean.tools !== undefined) {
      const tools = clean.tools;
      if (!Array.isArray(tools) || tools.length > 8 || !tools.every(t => isPlainObject(t) && Object.keys(t).every(k => k === "functionDeclarations")))
        return { error: "Only functionDeclarations tools are permitted." };
    }
    if (clean.maxOutputTokens !== undefined && !(Number.isInteger(clean.maxOutputTokens) && (clean.maxOutputTokens as number) > 0 && (clean.maxOutputTokens as number) <= 65536))
      return { error: "maxOutputTokens out of range." };
  }
  return { value: { model, contents, config: clean } };
}

/**
 * Validate an /embed-batch body: { model, texts: string[], config? }.
 * Every text becomes its own Content so the result has exactly one vector per text
 * (gemini-embedding-2* aggregates a flat list of parts into ONE vector, which would silently
 * give every text the same embedding).
 */
export function validateEmbedBatch(
  body: any,
  caps: { maxTexts?: number; maxTextChars?: number } = {},
): { error?: string; value?: { model: string; texts: string[]; config: Record<string, unknown> } } {
  const maxTexts = caps.maxTexts ?? DEFAULT_EMBED_BATCH_MAX_TEXTS;
  const maxChars = caps.maxTextChars ?? DEFAULT_EMBED_TEXT_MAX_CHARS;
  if (!isPlainObject(body)) return { error: "Body must be a JSON object." };
  const { model, texts, config } = body;
  if (typeof model !== "string" || !MODEL_PATTERN.test(model)) return { error: "Unsupported model." };
  if (!Array.isArray(texts)) return { error: "texts must be an array of strings." };
  if (texts.length === 0) return { error: "texts is empty." };
  if (texts.length > maxTexts) return { error: `texts has too many items (max ${maxTexts}).` };
  let total = 0;
  for (const t of texts) {
    if (typeof t !== "string") return { error: "texts must be an array of strings." };
    if (t.trim() === "") return { error: "texts must not contain empty strings." };
    if (t.length > maxChars) return { error: `A text is too long (max ${maxChars} characters).` };
    total += t.length;
  }
  if (total > MAX_CONTENTS_CHARS) return { error: "texts too large." };
  const clean: Record<string, unknown> = {};
  if (config !== undefined) {
    if (!isPlainObject(config)) return { error: "config must be an object." };
    for (const k of Object.keys(config)) {
      if (!EMBED_CONFIG_KEYS.has(k)) return { error: `config.${k} is not permitted.` };
      clean[k] = config[k];
    }
  }
  return { value: { model, texts: texts as string[], config: clean } };
}

/** Map an upstream SDK error to a safe client-facing error. Never forwards raw upstream text. */
export function sanitizeUpstreamError(err: any): { code: number; status: string; message: string } {
  const { code, status, message } = toHttpError(normalizeGeminiError(err));
  return { code, status, message };
}

export function createGeminiProxyRouter(opts: ProxyOptions = {}): Router {
  const router = Router();
  const perClient = new FixedWindowLimiter(opts.perClientPerMinute ?? envInt("GEMINI_PROXY_PER_CLIENT_PER_MIN", 60));
  const global = new FixedWindowLimiter(opts.globalPerMinute ?? envInt("GEMINI_PROXY_GLOBAL_PER_MIN", 600));
  // Embeddings: separate budgets, so a search's embeddings never use up the generate budget (or vice versa).
  const embedClient = new FixedWindowLimiter(opts.embedPerClientPerMinute ?? envInt("GEMINI_PROXY_EMBED_PER_CLIENT_PER_MIN", 60));
  const embedGlobal = new FixedWindowLimiter(opts.embedGlobalPerMinute ?? envInt("GEMINI_PROXY_EMBED_GLOBAL_PER_MIN", 600));
  const embedTextsClient = new FixedWindowLimiter(opts.embedTextsPerClientPerMinute ?? envInt("GEMINI_PROXY_EMBED_TEXTS_PER_CLIENT_PER_MIN", 3000));
  const embedTextsGlobal = new FixedWindowLimiter(opts.embedTextsGlobalPerMinute ?? envInt("GEMINI_PROXY_EMBED_TEXTS_GLOBAL_PER_MIN", 20000));
  const batchCaps = {
    maxTexts: opts.embedBatchMaxTexts ?? envInt("GEMINI_PROXY_EMBED_BATCH_MAX_TEXTS", DEFAULT_EMBED_BATCH_MAX_TEXTS),
    maxTextChars: opts.embedTextMaxChars ?? envInt("GEMINI_PROXY_EMBED_TEXT_MAX_CHARS", DEFAULT_EMBED_TEXT_MAX_CHARS),
  };
  const extraOrigins = new Set(
    (opts.allowedOrigins ?? (process.env.GEMINI_PROXY_ALLOWED_ORIGINS || "").split(","))
      .map(s => s.trim()).filter(Boolean));
  const llm = opts.llm ?? createLLMService({ gemini: { getApiKey: opts.getApiKey, clientFactory: opts.clientFactory } });

  // Never cached; CORS is explicit (no wildcard) so other sites cannot read responses.
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && extraOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Access-Control-Expose-Headers", "Retry-After");
      if (req.method === "OPTIONS") return res.sendStatus(204);
    }
    next();
  });

  const guard = (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin) {
      let sameOrigin = false;
      try {
        const oh = new URL(origin).host;
        // X-Forwarded-Host covers platforms that rewrite Host; browsers cannot set either header.
        sameOrigin = oh === req.headers.host || oh === String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
      } catch { /* invalid */ }
      if (!sameOrigin && !extraOrigins.has(origin)) return fail(res, 403, "PERMISSION_DENIED", "Cross-origin requests are not permitted.");
    } else if (req.headers["sec-fetch-site"] === "cross-site") {
      return fail(res, 403, "PERMISSION_DENIED", "Cross-site requests are not permitted.");
    }
    if (!req.is("application/json")) return fail(res, 415, "INVALID_ARGUMENT", "Content-Type must be application/json.");
    next();
  };

  const tooMany = (res: Response, retryAfter: number) => {
    res.setHeader("Retry-After", String(retryAfter));
    return fail(res, 429, "RESOURCE_EXHAUSTED", "Too many requests to the Gemini proxy (429). Please retry shortly.");
  };

  /** Generate budget. */
  const generateBudget = (req: Request, res: Response, next: NextFunction) => {
    const id = clientId(req);
    if (!global.take("*") || !perClient.take(id)) {
      return tooMany(res, Math.max(perClient.retryAfterSeconds(id), global.retryAfterSeconds("*")));
    }
    next();
  };

  /**
   * Embed budget: one call per HTTP request plus `texts` units against the texts budget.
   * All limits are checked before anything is consumed, so a rejected request costs nothing.
   * Runs after body parsing, which is why the cost of a batch is known.
   */
  const embedBudget = (req: Request, res: Response, next: NextFunction) => {
    const id = clientId(req);
    const b = req.body;
    const n = Array.isArray(b?.texts) ? Math.min(b.texts.length, 100_000) : 1;
    if (!(embedGlobal.has("*") && embedClient.has(id) && embedTextsGlobal.has("*", n) && embedTextsClient.has(id, n))) {
      return tooMany(res, Math.max(
        embedClient.retryAfterSeconds(id), embedGlobal.retryAfterSeconds("*"),
        embedTextsClient.retryAfterSeconds(id), embedTextsGlobal.retryAfterSeconds("*")));
    }
    embedGlobal.take("*"); embedClient.take(id); embedTextsGlobal.take("*", n); embedTextsClient.take(id, n);
    next();
  };

  /** Cheap pre-parse check so a flood is rejected without parsing 4 MB bodies. Consumes nothing. */
  const embedPreCheck = (req: Request, res: Response, next: NextFunction) => {
    const id = clientId(req);
    if (!(embedGlobal.has("*") && embedClient.has(id))) {
      return tooMany(res, Math.max(embedClient.retryAfterSeconds(id), embedGlobal.retryAfterSeconds("*")));
    }
    next();
  };

  const jsonBody = express.json({ limit: BODY_LIMIT });
  router.use(guard);

  /** Normalized provider error -> the same client-facing JSON as before the provider layer. */
  const sendError = (res: Response, err: unknown) => {
    const e = toHttpError(isLLMError(err) ? err : new LLMError("unavailable", "unknown", "Gemini request failed."));
    console.error(`[gemini-proxy] upstream error ${e.code} ${e.status}`); // status only; never log body/key
    if (e.retryAfterSeconds) res.setHeader("Retry-After", String(e.retryAfterSeconds));
    fail(res, e.code, e.status, e.message);
  };

  const handle = (embed: boolean) => async (req: Request, res: Response) => {
    const v = validateGenerate(req.body, embed);
    if (v.error) return fail(res, 400, "INVALID_ARGUMENT", v.error);
    try {
      const out = embed ? await llm.embed(v.value) : await llm.generate(v.value);
      res.setHeader("X-LLM-Provider", out.providerId);
      res.json(out.raw);
    } catch (err) {
      sendError(res, err);
    }
  };

  /** One vector per text, in order. Each text is its own Content (see validateEmbedBatch). */
  const handleBatch = async (req: Request, res: Response) => {
    const v = validateEmbedBatch(req.body, batchCaps);
    if (v.error) return fail(res, 400, "INVALID_ARGUMENT", v.error);
    try {
      const out = await llm.embedBatch(v.value!);
      res.setHeader("X-LLM-Provider", out.providerId);
      res.json({ embeddings: out.embeddings, providerId: out.providerId });
    } catch (err) {
      sendError(res, err);
    }
  };

  router.post("/generate", generateBudget, jsonBody, handle(false));
  router.post("/embed", embedPreCheck, jsonBody, embedBudget, handle(true));
  router.post("/embed-batch", embedPreCheck, jsonBody, embedBudget, handleBatch);

  // Malformed JSON / oversize body / anything else: JSON error, no stack.
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large") return fail(res, 413, "INVALID_ARGUMENT", "Request body too large.");
    if (err?.type === "entity.parse.failed") return fail(res, 400, "INVALID_ARGUMENT", "Malformed JSON.");
    console.error("[gemini-proxy] internal error");
    fail(res, 500, "INTERNAL", "Internal error.");
  });

  return router;
}
