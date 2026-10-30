/**
 * Gemini adapter: the only place that touches @google/genai.
 *
 * Requests are forwarded to the SDK exactly as the proxy always did ({model, contents, config}), and
 * generate/embed return the SDK response untouched in `raw`, so the proxy's JSON stays byte-for-byte the same.
 */
import { GoogleGenAI } from "@google/genai";
import { LLMError } from "../errors";
import type {
  CallContext, Capability, EmbedBatchRequest, EmbedBatchResult, EmbedRequest, EmbedResult,
  GenerateRequest, GenerateResult, LLMProvider, ProviderCapabilities, Usage,
} from "../types";

export const GEMINI_PROVIDER_ID = "gemini";
/** Models the Gemini adapter will accept (same allowlist the proxy validates against). */
export const GEMINI_MODEL_PATTERN = /^(models\/)?(gemini|gemma|text-embedding|embedding)[a-z0-9._-]{0,80}$/i;
export const GEMINI_MAX_EMBED_BATCH = 100;

export interface GeminiAdapterOptions {
  /** Returns the API key, read per request. Defaults to process.env.GEMINI_API_KEY. */
  getApiKey?: () => string | undefined;
  /** Test seam / alternative backend. */
  clientFactory?: (apiKey: string) => Pick<GoogleGenAI, "models">;
}

const NOT_CONFIGURED = "Gemini is not configured on the server (GEMINI_API_KEY is not set).";

/** Gemini 429 bodies carry `"retryDelay": "33s"`; some SDK errors also expose headers. Returns ms or undefined. */
export function parseRetryAfterMs(err: any): number | undefined {
  const direct = Number(err?.retryAfterMs);
  if (Number.isFinite(direct) && direct > 0) return direct;
  try {
    const h = typeof err?.headers?.get === "function" ? err.headers.get("retry-after") : err?.headers?.["retry-after"];
    const secs = Number(h);
    if (Number.isFinite(secs) && secs > 0) return secs * 1000;
  } catch { /* ignore */ }
  const m = /"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/.exec(String(err?.message ?? ""));
  if (m) { const secs = Number(m[1]); if (Number.isFinite(secs) && secs > 0) return Math.round(secs * 1000); }
  return undefined;
}

/** Map an SDK error to a safe LLMError. Never forwards raw upstream text. */
export function normalizeGeminiError(err: any, providerId = GEMINI_PROVIDER_ID): LLMError {
  if (err instanceof LLMError) return err;
  const raw = Number(err?.status ?? err?.code ?? err?.error?.code);
  const code = Number.isInteger(raw) && raw >= 400 && raw < 600 ? raw : 502;
  const msg = String(err?.message ?? "");
  const authMsg = "Gemini credentials were rejected by the server configuration.";
  if (/API_KEY_INVALID|API key not valid|API key expired/i.test(msg)) return new LLMError("auth", providerId, authMsg, { upstreamStatus: code });
  if (code === 429) return new LLMError("rate_limited", providerId, "Gemini quota or rate limit reached (429). Please retry shortly.", { upstreamStatus: 429, retryAfterMs: parseRetryAfterMs(err) });
  if (code === 404) return new LLMError("not_found", providerId, "Gemini model not found (404).", { upstreamStatus: 404 });
  if (code === 400) return new LLMError("bad_request", providerId, "Gemini rejected the request (400).", { upstreamStatus: 400 });
  if (code === 401 || code === 403) return new LLMError("auth", providerId, authMsg, { upstreamStatus: code });
  if (code >= 500) return new LLMError("unavailable", providerId, "Gemini request failed.", { upstreamStatus: code });
  return new LLMError("upstream_error", providerId, "Gemini request failed.", { upstreamStatus: code });
}

function usageOf(raw: any): Usage | undefined {
  const u = raw?.usageMetadata;
  if (!u || typeof u !== "object") return undefined;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
  return { promptTokens: num(u.promptTokenCount), completionTokens: num(u.candidatesTokenCount), totalTokens: num(u.totalTokenCount) };
}

function textOf(raw: any): string | undefined {
  const parts = raw?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return undefined;
  const t = parts.map((p: any) => (typeof p?.text === "string" ? p.text : "")).join("");
  return t === "" ? undefined : t;
}

export class GeminiProvider implements LLMProvider {
  readonly id = GEMINI_PROVIDER_ID;
  readonly capabilities: ProviderCapabilities = {
    generate: true, embed: true, functionCalling: true, maxEmbedBatch: GEMINI_MAX_EMBED_BATCH,
  };
  private readonly getKey: () => string | undefined;
  private readonly makeClient: (apiKey: string) => Pick<GoogleGenAI, "models">;

  constructor(opts: GeminiAdapterOptions = {}) {
    this.getKey = opts.getApiKey ?? (() => process.env.GEMINI_API_KEY);
    this.makeClient = opts.clientFactory ?? ((apiKey: string) => new GoogleGenAI({ apiKey }));
  }

  supportsModel(model: string, _capability: Capability): boolean {
    return GEMINI_MODEL_PATTERN.test(model);
  }

  private client() {
    const apiKey = this.getKey();
    if (!apiKey) throw new LLMError("misconfigured", this.id, NOT_CONFIGURED);
    return this.makeClient(apiKey);
  }

  async generate(req: GenerateRequest, _ctx?: CallContext): Promise<GenerateResult> {
    const client = this.client();
    try {
      const raw: any = await client.models.generateContent({ model: req.model, contents: req.contents, config: req.config } as any);
      return { providerId: this.id, model: req.model, raw, text: textOf(raw), usage: usageOf(raw) };
    } catch (err) {
      throw normalizeGeminiError(err, this.id);
    }
  }

  async embed(req: EmbedRequest, _ctx?: CallContext): Promise<EmbedResult> {
    const client = this.client();
    try {
      const raw: any = await client.models.embedContent({ model: req.model, contents: req.contents, config: req.config } as any);
      return { providerId: this.id, model: req.model, raw };
    } catch (err) {
      throw normalizeGeminiError(err, this.id);
    }
  }

  /** One vector per text, in order. Each text is its own Content (gemini-embedding-2* aggregates a flat list of parts into ONE vector). */
  async embedBatch(req: EmbedBatchRequest, _ctx?: CallContext): Promise<EmbedBatchResult> {
    const client = this.client();
    let out: any;
    try {
      out = await client.models.embedContent({
        model: req.model,
        contents: req.texts.map(text => ({ role: "user", parts: [{ text }] })),
        config: req.config,
      } as any);
    } catch (err) {
      throw normalizeGeminiError(err, this.id);
    }
    const embeddings = Array.isArray(out?.embeddings) ? out.embeddings : [];
    // A short/aggregated answer must never be paired positionally with the inputs.
    if (embeddings.length !== req.texts.length) {
      console.error(`[gemini-proxy] embed-batch count mismatch: sent ${req.texts.length}, got ${embeddings.length}`);
      throw new LLMError("unavailable", this.id, "Gemini returned an unexpected number of embeddings.", { upstreamStatus: 502 });
    }
    return {
      providerId: this.id,
      model: req.model,
      embeddings: embeddings.map((e: any) => ({ values: Array.isArray(e?.values) ? e.values : [] })),
    };
  }
}
