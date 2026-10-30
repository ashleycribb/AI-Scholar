/** Test helpers: a scriptable fake provider. Not imported by production code. */
import { LLMError } from "./errors";
import type {
  Capability, EmbedBatchRequest, EmbedBatchResult, EmbedRequest, EmbedResult, GenerateRequest, GenerateResult,
  LLMProvider, ProviderCapabilities,
} from "./types";

export type Behavior = "ok" | LLMError | "hang" | "throw-raw";

export class FakeProvider implements LLMProvider {
  readonly capabilities: ProviderCapabilities;
  calls: { op: "generate" | "embed" | "embedBatch"; model: string }[] = [];
  behavior: Behavior = "ok";
  constructor(readonly id: string, caps: Partial<ProviderCapabilities> = {}, private models: RegExp = /.*/) {
    this.capabilities = { generate: true, embed: true, functionCalling: false, ...caps };
  }
  supportsModel(model: string, _c: Capability) { return this.models.test(model); }
  private async act<T>(op: "generate" | "embed" | "embedBatch", model: string, ok: () => T): Promise<T> {
    this.calls.push({ op, model });
    if (this.behavior === "hang") return new Promise<T>(() => {});
    if (this.behavior === "throw-raw") throw new Error("raw upstream text sk-SECRET");
    if (this.behavior !== "ok") throw this.behavior;
    return ok();
  }
  generate(req: GenerateRequest): Promise<GenerateResult> {
    return this.act("generate", req.model, () => ({ providerId: this.id, model: req.model, raw: { from: this.id }, text: "t" }));
  }
  embed(req: EmbedRequest): Promise<EmbedResult> {
    return this.act("embed", req.model, () => ({ providerId: this.id, model: req.model, raw: { embeddings: [{ values: [1] }] } }));
  }
  embedBatch(req: EmbedBatchRequest): Promise<EmbedBatchResult> {
    return this.act("embedBatch", req.model, () => ({ providerId: this.id, model: req.model, embeddings: req.texts.map(() => ({ values: [1] })) }));
  }
}

export const err = (kind: ConstructorParameters<typeof LLMError>[0], id = "x", extra = {}) => new LLMError(kind, id, `${kind} msg`, extra);
