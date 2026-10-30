import type { LLMProvider, ProviderId } from "./types";

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;

/** Thrown for configuration mistakes (unknown or duplicate provider ids). These are startup errors, not request errors. */
export class LLMConfigError extends Error {
  constructor(message: string) { super(message); this.name = "LLMConfigError"; }
}

export class ProviderRegistry {
  private providers = new Map<ProviderId, LLMProvider>();

  register(p: LLMProvider): this {
    if (!ID_PATTERN.test(p.id)) throw new LLMConfigError(`Invalid LLM provider id "${p.id}".`);
    if (this.providers.has(p.id)) throw new LLMConfigError(`LLM provider "${p.id}" is already registered.`);
    this.providers.set(p.id, p);
    return this;
  }

  has(id: ProviderId): boolean { return this.providers.has(id); }
  get(id: ProviderId): LLMProvider | undefined { return this.providers.get(id); }
  list(): ProviderId[] { return [...this.providers.keys()]; }

  /** Like get, but throws {@link LLMConfigError} naming the registered ids when `id` is unknown. */
  resolve(id: ProviderId): LLMProvider {
    const p = this.providers.get(id);
    if (!p) throw new LLMConfigError(`Unknown LLM provider "${id}". Registered: ${this.list().join(", ") || "(none)"}.`);
    return p;
  }
}
