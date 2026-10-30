/**
 * Normalized provider errors. Adapters translate vendor errors into {@link LLMError}.
 * `message` is always safe to show to a client: adapters must never put raw upstream text,
 * request bodies or keys into it.
 */
import type { ProviderId } from "./types";

export type LLMErrorKind =
  | "rate_limited"   // provider quota / 429; carries retryAfterMs when known
  | "unavailable"    // 5xx, network failure, unknown failure
  | "timeout"        // per-call timeout fired
  | "bad_request"    // provider rejected the input (400)
  | "not_found"      // unknown model (404)
  | "auth"           // credentials rejected (401/403)
  | "misconfigured"  // not configured on this server (e.g. no API key)
  | "circuit_open"   // breaker is open for this provider; the call was not attempted
  | "unsupported"    // provider lacks the capability
  | "upstream_error"; // any other 4xx

export class LLMError extends Error {
  readonly kind: LLMErrorKind;
  readonly providerId: ProviderId;
  readonly retryAfterMs?: number;
  /** HTTP status the provider returned, when there was one. */
  readonly upstreamStatus?: number;
  constructor(kind: LLMErrorKind, providerId: ProviderId, message: string, extra: { retryAfterMs?: number; upstreamStatus?: number } = {}) {
    super(message);
    this.name = "LLMError";
    this.kind = kind;
    this.providerId = providerId;
    this.retryAfterMs = extra.retryAfterMs;
    this.upstreamStatus = extra.upstreamStatus;
  }
}

export const isLLMError = (e: unknown): e is LLMError => e instanceof LLMError;

/** Kinds where trying a different provider for `generate` may help. Never used for embeddings. */
export const FAILOVER_KINDS: ReadonlySet<LLMErrorKind> = new Set<LLMErrorKind>([
  "rate_limited", "unavailable", "timeout", "auth", "misconfigured", "circuit_open", "unsupported",
]);

/** Kinds that say the provider is unhealthy (they count toward opening the circuit breaker). */
export const BREAKER_KINDS: ReadonlySet<LLMErrorKind> = new Set<LLMErrorKind>(["unavailable", "timeout"]);

export interface HttpError { code: number; status: string; message: string; retryAfterSeconds?: number }

/** Map a normalized error to the proxy's client-facing error shape (same codes/statuses as before the refactor). */
export function toHttpError(e: LLMError): HttpError {
  const retryAfterSeconds = e.retryAfterMs !== undefined && e.retryAfterMs > 0
    ? Math.min(3600, Math.max(1, Math.ceil(e.retryAfterMs / 1000))) : undefined;
  switch (e.kind) {
    case "rate_limited": return { code: 429, status: "RESOURCE_EXHAUSTED", message: e.message, retryAfterSeconds };
    case "not_found": return { code: 404, status: "NOT_FOUND", message: e.message };
    case "bad_request": return { code: 400, status: "INVALID_ARGUMENT", message: e.message };
    case "auth": return { code: 502, status: "UPSTREAM_AUTH", message: e.message };
    case "misconfigured": return { code: 503, status: "UNAVAILABLE", message: e.message };
    case "circuit_open": return { code: 503, status: "UNAVAILABLE", message: e.message, retryAfterSeconds };
    case "timeout": return { code: 504, status: "DEADLINE_EXCEEDED", message: e.message };
    case "unsupported": return { code: 501, status: "UNIMPLEMENTED", message: e.message };
    case "upstream_error": {
      const s = e.upstreamStatus ?? 502;
      return { code: s >= 500 ? 502 : s, status: "UPSTREAM_ERROR", message: e.message };
    }
    case "unavailable":
    default: return { code: 502, status: "UPSTREAM_ERROR", message: e.message };
  }
}
