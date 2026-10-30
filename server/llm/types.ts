/**
 * Internal LLM contract ("Provider Strategy").
 *
 * The rest of the server talks to {@link LLMService} using only these types. Each vendor (Gemini today,
 * anything else later) lives behind an {@link LLMProvider} adapter that translates to and from its own SDK.
 * Nothing in here depends on a vendor SDK.
 */

/** Lowercase identifier, e.g. "gemini". Used in env config, logs and the X-LLM-Provider response header. */
export type ProviderId = string;

export type Capability = "generate" | "embed";

export interface Usage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** What a provider can do. The registry and failover policy use this to pick candidates. */
export interface ProviderCapabilities {
  generate: boolean;
  /** Single embed and embedBatch. */
  embed: boolean;
  /** Supports `config.tools` with functionDeclarations. */
  functionCalling: boolean;
  /** Largest number of texts one embedBatch call accepts. */
  maxEmbedBatch?: number;
}

/** Already validated by the proxy (model allowlist, config allowlist, size caps). */
export interface GenerateRequest {
  model: string;
  /** string, or an array of Content objects, in the provider-neutral shape the app already sends. */
  contents: unknown;
  config?: Record<string, unknown>;
}

export interface GenerateResult {
  providerId: ProviderId;
  model: string;
  /** Provider-native response body. The proxy returns it unchanged so clients see no difference. */
  raw: unknown;
  /** Convenience: concatenated text of the first candidate, when the provider can supply it. */
  text?: string;
  usage?: Usage;
}

/** Single embed. `contents` is forwarded as-is (the legacy /embed route). */
export interface EmbedRequest {
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}

export interface EmbedResult {
  providerId: ProviderId;
  model: string;
  raw: unknown;
  usage?: Usage;
}

/** One text per vector, same order. */
export interface EmbedBatchRequest {
  model: string;
  texts: string[];
  config?: Record<string, unknown>;
}

export interface EmbedBatchResult {
  providerId: ProviderId;
  model: string;
  /** Exactly one entry per input text, in order. A provider must throw rather than return a short list. */
  embeddings: { values: number[] }[];
  usage?: Usage;
}

/** Per-call context supplied by the service. */
export interface CallContext {
  /** Aborted when the per-call timeout fires. Adapters may pass it to their SDK if it supports it. */
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  /** True if this provider can serve `model` for `capability`. Failover skips providers that cannot. */
  supportsModel(model: string, capability: Capability): boolean;
  /** Must throw {@link LLMError} (see errors.ts), never a raw SDK error. */
  generate(req: GenerateRequest, ctx?: CallContext): Promise<GenerateResult>;
  embed(req: EmbedRequest, ctx?: CallContext): Promise<EmbedResult>;
  embedBatch(req: EmbedBatchRequest, ctx?: CallContext): Promise<EmbedBatchResult>;
}
