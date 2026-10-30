/**
 * Server-side Gemini proxy.
 *
 * The browser (and the Chrome extension) never see GEMINI_API_KEY. They POST
 * to /api/gemini/{generate,embed}; this router validates the request, applies
 * rate limits, and calls Gemini with the key read from the server environment
 * at request time.
 *
 * Hardening (the endpoint is reachable by anyone who can reach the app URL):
 *  - model allowlist (regex), config allowlist, only functionDeclarations tools
 *  - same-origin only (Origin must match Host) unless listed in
 *    GEMINI_PROXY_ALLOWED_ORIGINS (e.g. the extension's chrome-extension://<id>)
 *  - per-client and global fixed-window rate limits
 *  - request body cap, contents size cap
 *  - upstream errors are sanitized; the key is never echoed
 */
import express, { type Request, type Response, type NextFunction, Router } from "express";
import { GoogleGenAI } from "@google/genai";

export const MODEL_PATTERN = /^(models\/)?(gemini|gemma|text-embedding|embedding)[a-z0-9._-]{0,80}$/i;
export const GENERATE_CONFIG_KEYS = new Set([
  "systemInstruction", "tools", "responseMimeType", "responseSchema", "temperature",
  "topP", "topK", "maxOutputTokens", "thinkingConfig", "stopSequences", "seed",
]);
export const EMBED_CONFIG_KEYS = new Set(["outputDimensionality", "taskType", "title"]);
const BODY_LIMIT = "4mb";
const MAX_CONTENTS_CHARS = 3_000_000;

export interface ProxyOptions {
  /** Returns the API key; defaults to process.env.GEMINI_API_KEY (read per request). */
  getApiKey?: () => string | undefined;
  /** Test seam / alternative backend. */
  clientFactory?: (apiKey: string) => Pick<GoogleGenAI, "models">;
  perClientPerMinute?: number;
  globalPerMinute?: number;
  allowedOrigins?: string[];
}

class FixedWindowLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private limit: number, private windowMs = 60_000) {}
  take(key: string, now = Date.now()): boolean {
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.reset <= now) this.hits.delete(k);
      if (this.hits.size > 5000) this.hits.clear();
    }
    const cur = this.hits.get(key);
    if (!cur || cur.reset <= now) { this.hits.set(key, { n: 1, reset: now + this.windowMs }); return true; }
    if (cur.n >= this.limit) return false;
    cur.n++;
    return true;
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

/** Map an upstream SDK error to a safe client-facing error. Never forwards raw upstream text. */
export function sanitizeUpstreamError(err: any): { code: number; status: string; message: string } {
  const raw = Number(err?.status ?? err?.code ?? err?.error?.code);
  const code = Number.isInteger(raw) && raw >= 400 && raw < 600 ? raw : 502;
  const msg = String(err?.message ?? "");
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(msg)) return { code: 502, status: "UPSTREAM_AUTH", message: "Gemini credentials were rejected by the server configuration." };
  if (code === 429) return { code, status: "RESOURCE_EXHAUSTED", message: "Gemini quota or rate limit reached (429). Please retry shortly." };
  if (code === 404) return { code, status: "NOT_FOUND", message: "Gemini model not found (404)." };
  if (code === 400) return { code, status: "INVALID_ARGUMENT", message: "Gemini rejected the request (400)." };
  if (code === 401 || code === 403) return { code: 502, status: "UPSTREAM_AUTH", message: "Gemini credentials were rejected by the server configuration." };
  return { code: code >= 500 ? 502 : code, status: "UPSTREAM_ERROR", message: "Gemini request failed." };
}

export function createGeminiProxyRouter(opts: ProxyOptions = {}): Router {
  const router = Router();
  const perClient = new FixedWindowLimiter(opts.perClientPerMinute ?? envInt("GEMINI_PROXY_PER_CLIENT_PER_MIN", 60));
  const global = new FixedWindowLimiter(opts.globalPerMinute ?? envInt("GEMINI_PROXY_GLOBAL_PER_MIN", 600));
  const extraOrigins = new Set(
    (opts.allowedOrigins ?? (process.env.GEMINI_PROXY_ALLOWED_ORIGINS || "").split(","))
      .map(s => s.trim()).filter(Boolean));
  const getKey = opts.getApiKey ?? (() => process.env.GEMINI_API_KEY);
  const makeClient = opts.clientFactory ?? ((apiKey: string) => new GoogleGenAI({ apiKey }));

  // Never cached; CORS is explicit (no wildcard) so other sites cannot read responses.
  router.use((req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    const origin = req.headers.origin;
    if (origin && extraOrigins.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
    if (!global.take("*") || !perClient.take(clientId(req))) {
      res.setHeader("Retry-After", "30");
      return fail(res, 429, "RESOURCE_EXHAUSTED", "Too many requests to the Gemini proxy (429). Please retry shortly.");
    }
    next();
  };

  router.use(guard, express.json({ limit: BODY_LIMIT }));

  const handle = (embed: boolean) => async (req: Request, res: Response) => {
    const v = validateGenerate(req.body, embed);
    if (v.error) return fail(res, 400, "INVALID_ARGUMENT", v.error);
    const apiKey = getKey();
    if (!apiKey) return fail(res, 503, "UNAVAILABLE", "Gemini is not configured on the server (GEMINI_API_KEY is not set).");
    try {
      const client = makeClient(apiKey);
      const out: any = embed
        ? await client.models.embedContent(v.value)
        : await client.models.generateContent(v.value);
      res.json(out);
    } catch (err: any) {
      const e = sanitizeUpstreamError(err);
      console.error(`[gemini-proxy] upstream error ${e.code} ${e.status}`); // status only; never log body/key
      fail(res, e.code, e.status, e.message);
    }
  };

  router.post("/generate", handle(false));
  router.post("/embed", handle(true));

  // Malformed JSON / oversize body / anything else: JSON error, no stack.
  router.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    if (err?.type === "entity.too.large") return fail(res, 413, "INVALID_ARGUMENT", "Request body too large.");
    if (err?.type === "entity.parse.failed") return fail(res, 400, "INVALID_ARGUMENT", "Malformed JSON.");
    console.error("[gemini-proxy] internal error");
    fail(res, 500, "INTERNAL", "Internal error.");
  });

  return router;
}
