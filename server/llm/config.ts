/**
 * Env-driven setup. Only the Gemini adapter is registered today; adding a provider means writing one adapter
 * and registering it in {@link createLLMService}.
 *
 *   LLM_PRIMARY_PROVIDER         default "gemini"
 *   LLM_FALLBACK_PROVIDERS       comma-separated, generate only, default empty
 *   LLM_EMBED_PROVIDER           default: the primary. Embeddings never fail over.
 *   LLM_GENERATE_TIMEOUT_MS      default 120000
 *   LLM_EMBED_TIMEOUT_MS         default 30000
 *   LLM_BREAKER_FAILURES         consecutive failures that open the breaker, default 5
 *   LLM_BREAKER_OPEN_MS          how long it stays open before one probe call, default 30000
 */
import type { LLMProvider } from "./types";
import { GeminiProvider, type GeminiAdapterOptions } from "./providers/gemini";
import { LLMConfigError, ProviderRegistry } from "./registry";
import { DEFAULT_EMBED_TIMEOUT_MS, DEFAULT_GENERATE_TIMEOUT_MS, LLMService, type LLMEvent } from "./service";

type Env = Record<string, string | undefined>;

const posInt = (v: string | undefined, dflt: number) => {
  const n = parseInt(v || "", 10);
  return Number.isFinite(n) && n > 0 ? n : dflt;
};

const parseIds = (v: string | undefined) =>
  (v || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

export interface LLMServiceFactoryOptions {
  env?: Env;
  gemini?: GeminiAdapterOptions;
  /** Extra providers to register (tests, future adapters). */
  extraProviders?: LLMProvider[];
  onEvent?: (e: LLMEvent) => void;
}

export function createLLMService(opts: LLMServiceFactoryOptions = {}): LLMService {
  const env = opts.env ?? process.env;
  const registry = new ProviderRegistry().register(new GeminiProvider(opts.gemini));
  for (const p of opts.extraProviders ?? []) registry.register(p);
  const primary = (env.LLM_PRIMARY_PROVIDER || "gemini").trim().toLowerCase();
  const fallbacks = parseIds(env.LLM_FALLBACK_PROVIDERS);
  const embedProvider = (env.LLM_EMBED_PROVIDER || "").trim().toLowerCase() || undefined;
  try {
    return new LLMService({
      registry, primary, fallbacks, embedProvider,
      generateTimeoutMs: posInt(env.LLM_GENERATE_TIMEOUT_MS, DEFAULT_GENERATE_TIMEOUT_MS),
      embedTimeoutMs: posInt(env.LLM_EMBED_TIMEOUT_MS, DEFAULT_EMBED_TIMEOUT_MS),
      breaker: { failureThreshold: posInt(env.LLM_BREAKER_FAILURES, 5), openMs: posInt(env.LLM_BREAKER_OPEN_MS, 30_000) },
      onEvent: opts.onEvent ?? defaultLog,
    });
  } catch (e) {
    if (e instanceof LLMConfigError) throw new LLMConfigError(`${e.message} Check LLM_PRIMARY_PROVIDER / LLM_FALLBACK_PROVIDERS / LLM_EMBED_PROVIDER.`);
    throw e;
  }
}

/** Status only; never logs request or response bodies. */
function defaultLog(e: LLMEvent) {
  if (e.type === "failover") console.warn(`[llm] generate failover ${e.from} -> ${e.to} (${e.kind})`);
  else console.warn(`[llm] circuit ${e.providerId}/${e.capability} is now ${e.state}`);
}
