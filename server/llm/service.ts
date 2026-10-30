/**
 * LLMService: the only entry point the rest of the server uses.
 *
 * Policy
 *  - generate: try the primary provider, then each fallback in order. Failover happens only for
 *    provider-health style errors (see FAILOVER_KINDS); a bad request or unknown model is returned as-is.
 *  - embed / embedBatch: NEVER fail over. Vectors from different providers or models are not comparable, so
 *    mixing them would silently corrupt search scores. The error goes back to the caller (the client then
 *    falls back to keyword ranking). Embeddings always use `embedProvider` (default: the primary).
 *  - every call has a timeout and goes through a per-provider, per-capability circuit breaker.
 */
import { CircuitBreaker, type BreakerOptions, type BreakerState } from "./circuitBreaker";
import { BREAKER_KINDS, FAILOVER_KINDS, LLMError, isLLMError } from "./errors";
import type { ProviderRegistry } from "./registry";
import type {
  Capability, EmbedBatchRequest, EmbedBatchResult, EmbedRequest, EmbedResult,
  GenerateRequest, GenerateResult, LLMProvider, ProviderId,
} from "./types";

export const DEFAULT_GENERATE_TIMEOUT_MS = 120_000;
export const DEFAULT_EMBED_TIMEOUT_MS = 30_000;

export type LLMEvent =
  | { type: "failover"; capability: "generate"; from: ProviderId; to: ProviderId; kind: string }
  | { type: "breaker"; providerId: ProviderId; capability: Capability; state: BreakerState };

export interface LLMServiceOptions {
  registry: ProviderRegistry;
  primary: ProviderId;
  /** Generate-only, tried in order after the primary. Empty by default. */
  fallbacks?: ProviderId[];
  /** Provider for embeddings; defaults to the primary. Never failed over. */
  embedProvider?: ProviderId;
  generateTimeoutMs?: number;
  embedTimeoutMs?: number;
  breaker?: BreakerOptions;
  onEvent?: (e: LLMEvent) => void;
}

export class LLMService {
  private readonly registry: ProviderRegistry;
  private readonly primary: ProviderId;
  private readonly fallbacks: ProviderId[];
  private readonly embedProvider: ProviderId;
  private readonly generateTimeoutMs: number;
  private readonly embedTimeoutMs: number;
  private readonly breakerOpts: BreakerOptions;
  private readonly onEvent?: (e: LLMEvent) => void;
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(opts: LLMServiceOptions) {
    this.registry = opts.registry;
    this.primary = opts.primary;
    this.embedProvider = opts.embedProvider ?? opts.primary;
    this.fallbacks = [...new Set(opts.fallbacks ?? [])].filter(id => id !== opts.primary);
    this.generateTimeoutMs = opts.generateTimeoutMs ?? DEFAULT_GENERATE_TIMEOUT_MS;
    this.embedTimeoutMs = opts.embedTimeoutMs ?? DEFAULT_EMBED_TIMEOUT_MS;
    this.breakerOpts = opts.breaker ?? {};
    this.onEvent = opts.onEvent;
    // Fail fast on misconfiguration (unknown ids) at construction, not on the first request.
    for (const id of [this.primary, this.embedProvider, ...this.fallbacks]) this.registry.resolve(id);
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const candidates = [this.primary, ...this.fallbacks].map(id => this.registry.resolve(id));
    const errors: LLMError[] = [];
    let last: LLMProvider | undefined;
    for (const p of candidates) {
      if (!p.capabilities.generate || !p.supportsModel(req.model, "generate")) {
        errors.push(new LLMError("unsupported", p.id, `Provider "${p.id}" cannot serve model "${req.model}".`));
        continue;
      }
      if (last && errors.length) this.emit({ type: "failover", capability: "generate", from: last.id, to: p.id, kind: errors[errors.length - 1].kind });
      last = p;
      try {
        return await this.call(p, "generate", this.generateTimeoutMs, ctx => p.generate(req, ctx));
      } catch (err) {
        const e = this.normalize(err, p.id);
        errors.push(e);
        if (!FAILOVER_KINDS.has(e.kind)) throw e;
      }
    }
    throw this.pickError(errors);
  }

  /** Embeddings: one provider only. No failover, by design. */
  async embed(req: EmbedRequest): Promise<EmbedResult> {
    const p = this.embedder(req.model);
    return this.call(p, "embed", this.embedTimeoutMs, ctx => p.embed(req, ctx)).catch(e => { throw this.normalize(e, p.id); });
  }

  /** Embeddings: one provider only. No failover, by design. */
  async embedBatch(req: EmbedBatchRequest): Promise<EmbedBatchResult> {
    const p = this.embedder(req.model);
    const out = await this.call(p, "embed", this.embedTimeoutMs, ctx => p.embedBatch(req, ctx)).catch(e => { throw this.normalize(e, p.id); });
    if (!Array.isArray(out.embeddings) || out.embeddings.length !== req.texts.length) {
      throw new LLMError("unavailable", p.id, `${p.id} returned an unexpected number of embeddings.`);
    }
    return out;
  }

  /** Health snapshot for diagnostics and tests. */
  health(): { providerId: ProviderId; capability: Capability; state: BreakerState }[] {
    return [...this.breakers.entries()].map(([k, b]) => {
      const [providerId, capability] = k.split(":") as [ProviderId, Capability];
      return { providerId, capability, state: b.getState() };
    });
  }

  private embedder(model: string): LLMProvider {
    const p = this.registry.resolve(this.embedProvider);
    if (!p.capabilities.embed || !p.supportsModel(model, "embed")) {
      throw new LLMError("unsupported", p.id, `Provider "${p.id}" cannot serve embedding model "${model}".`);
    }
    return p;
  }

  private breaker(id: ProviderId, cap: Capability): CircuitBreaker {
    const key = `${id}:${cap}`;
    let b = this.breakers.get(key);
    if (!b) { b = new CircuitBreaker(this.breakerOpts); this.breakers.set(key, b); }
    return b;
  }

  private emit(e: LLMEvent) { try { this.onEvent?.(e); } catch { /* observers must not break calls */ } }

  private normalize(err: unknown, id: ProviderId): LLMError {
    if (isLLMError(err)) return err;
    // A provider that leaks a raw error is a bug; never forward its text.
    return new LLMError("unavailable", id, "LLM provider request failed.");
  }

  private pickError(errors: LLMError[]): LLMError {
    return errors.find(e => e.kind !== "circuit_open" && e.kind !== "unsupported") ?? errors[0]
      ?? new LLMError("unsupported", this.primary, "No LLM provider is available.");
  }

  /** Breaker + timeout wrapper around one provider call. */
  private async call<T>(p: LLMProvider, cap: Capability, timeoutMs: number, fn: (ctx: { signal: AbortSignal }) => Promise<T>): Promise<T> {
    const br = this.breaker(p.id, cap);
    if (!br.tryAcquire()) {
      throw new LLMError("circuit_open", p.id, `${p.id} is temporarily unavailable. Please retry shortly.`, { retryAfterMs: br.retryAfterMs() });
    }
    const before = br.getState();
    const ac = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new LLMError("timeout", p.id, `${p.id} did not answer in time.`));
      }, timeoutMs);
    });
    try {
      const out = await Promise.race([fn({ signal: ac.signal }), timeout]);
      br.onSuccess();
      return out;
    } catch (err) {
      const e = this.normalize(err, p.id);
      if (BREAKER_KINDS.has(e.kind)) br.onFailure(); else br.onNeutral();
      throw e;
    } finally {
      if (timer) clearTimeout(timer);
      const after = br.getState();
      if (after !== before) this.emit({ type: "breaker", providerId: p.id, capability: cap, state: after });
    }
  }
}
