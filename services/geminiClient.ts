/**
 * Browser-safe Gemini client.
 *
 * Exposes the small slice of the @google/genai surface this app uses
 * (models.generateContent, models.embedContent, chats.create -> sendMessage)
 * but forwards every call to the server-side proxy (server/geminiProxy.ts).
 * No API key exists in, or is needed by, the client bundle.
 */
import type { Content, GenerateContentConfig, GenerateContentResponse, Part } from "@google/genai";

export type GeminiResponse = GenerateContentResponse & { text: string | undefined; functionCalls: any[] | undefined };

export interface GeminiClientOptions {
  /** Base URL of the proxy, no trailing slash. May be async (extension reads chrome.storage). */
  baseUrl?: string | (() => string | Promise<string>);
  fetchImpl?: typeof fetch;
}

export class GeminiHttpError extends Error {
  status: number;
  error: { code: number; status: string; message: string };
  /** From the Retry-After response header, in ms (undefined when absent or unparseable). */
  retryAfterMs?: number;
  constructor(code: number, status: string, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "GeminiHttpError";
    this.status = code;
    this.error = { code, status, message };
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
  }
}

/** Retry-After is delta-seconds or an HTTP date; returns ms or undefined. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Math.min(parseInt(v, 10), 86_400) * 1000;
  const t = Date.parse(v);
  return Number.isFinite(t) ? Math.max(0, Math.min(t - now, 86_400_000)) : undefined;
}

/** Re-attach the `text` / `functionCalls` accessors the SDK adds, which JSON transport drops. */
export function hydrateResponse(raw: any): GeminiResponse {
  const parts: Part[] = raw?.candidates?.[0]?.content?.parts ?? [];
  const text = parts.filter((p: any) => typeof p.text === "string" && !p.thought).map((p: any) => p.text).join("");
  const calls = parts.filter((p: any) => p.functionCall).map((p: any) => p.functionCall);
  return Object.defineProperties({ ...raw }, {
    text: { value: text === "" ? undefined : text, enumerable: false },
    functionCalls: { value: calls.length ? calls : undefined, enumerable: false },
  }) as GeminiResponse;
}

export interface ChatLike {
  sendMessage(params: { message: string | Part[] | Part }): Promise<GeminiResponse>;
  getHistory(): Content[];
}
export type Chat = ChatLike;

export function createGeminiClient(options: GeminiClientOptions = {}) {
  const doFetch = () => options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const resolveBase = async () => {
    const b = typeof options.baseUrl === "function" ? await options.baseUrl() : (options.baseUrl ?? "");
    return b.replace(/\/+$/, "");
  };

  async function post(path: "generate" | "embed" | "embed-batch", body: unknown): Promise<any> {
    const base = await resolveBase();
    let res: Response;
    try {
      res = await doFetch()(`${base}/api/gemini/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (e: any) {
      throw new GeminiHttpError(0, "NETWORK", `Could not reach the Gemini proxy: ${e?.message || "network error"}`);
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = data?.error;
      throw new GeminiHttpError(
        err?.code ?? res.status, err?.status ?? "UNKNOWN", err?.message ?? `Gemini proxy error (${res.status})`,
        parseRetryAfter(res.headers?.get?.("Retry-After")));
    }
    return data;
  }

  const models = {
    generateContent: async (params: { model: string; contents: any; config?: GenerateContentConfig | Record<string, any> }) =>
      hydrateResponse(await post("generate", params)),
    embedContent: async (params: { model: string; contents: any; config?: Record<string, any> }): Promise<any> =>
      post("embed", params),
    /** One vector per text, in order (server enforces the batch caps). Returns `{ embeddings: [{ values }] }`. */
    embedBatch: async (params: { model: string; texts: string[]; config?: Record<string, any> }): Promise<{ embeddings: { values: number[] }[] }> =>
      post("embed-batch", params),
  };

  const chats = {
    create(params: { model: string; config?: GenerateContentConfig | Record<string, any>; history?: Content[] }): ChatLike {
      const history: Content[] = [...(params.history ?? [])];
      return {
        async sendMessage({ message }) {
          const parts: Part[] = typeof message === "string" ? [{ text: message }] : Array.isArray(message) ? message : [message];
          const userTurn: Content = { role: "user", parts };
          const response = await models.generateContent({
            model: params.model,
            contents: [...history, userTurn],
            config: params.config,
          });
          const modelContent = response.candidates?.[0]?.content;
          // Same as the SDK: only commit the turn once the model replied.
          if (modelContent) history.push(userTurn, modelContent);
          return response;
        },
        getHistory: () => [...history],
      };
    },
  };

  return { models, chats };
}

/** Default client: same-origin proxy. */
export const ai = createGeminiClient();
