/**
 * Text embedders behind POST /api/embed.
 *
 *  - "local" (default): an open model run on this server with @huggingface/transformers (ONNX Runtime).
 *    Default BAAI/bge-small-en-v1.5 (384 dims, ~130 MB fp32). Loaded once, lazily, then reused. No Gemini quota.
 *  - "gemini": gemini-embedding-2-preview through the existing server-side LLM service (spends Gemini quota).
 *
 * Env: EMBED_PROVIDER=local|gemini, EMBED_LOCAL_MODEL, EMBED_LOCAL_DTYPE (fp32|fp16|q8), EMBED_MODEL_CACHE_DIR.
 */
import type { LLMService } from "../llm";

export type EmbedKind = "query" | "document";

export interface TextEmbedder {
  /** Stable name, part of every cache key (vectors from different models are not comparable). */
  readonly model: string;
  readonly provider: "local" | "gemini" | string;
  embed(texts: string[], kind: EmbedKind): Promise<number[][]>;
}

export const DEFAULT_LOCAL_MODEL = "BAAI/bge-small-en-v1.5";
/** BGE v1.5 retrieval instruction for short queries (documents get no prefix). */
export const BGE_QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";
/**
 * Texts per ONNX run. 1 is fastest and leanest on CPU for abstracts (no padding to the longest text):
 * 50 abstracts took 1.3 s at ~380 MB RSS with batch 1 vs 2.5 s at ~1.3 GB with batch 32 (8-core box, fp32).
 */
const DEFAULT_LOCAL_BATCH = 1;

export interface LocalEmbedderOptions {
  model?: string;
  dtype?: string;
  cacheDir?: string;
  /** Texts per inference run (env EMBED_LOCAL_BATCH). */
  batchSize?: number;
  /** Test seam: replaces the transformers.js pipeline factory. */
  loadPipeline?: (model: string, dtype: string, cacheDir?: string) => Promise<(texts: string[], opts: any) => Promise<{ tolist(): number[][] }>>;
}

async function defaultLoadPipeline(model: string, dtype: string, cacheDir?: string) {
  const { pipeline, env } = await import("@huggingface/transformers");
  if (cacheDir) env.cacheDir = cacheDir;
  try {
    return (await pipeline("feature-extraction", model, { dtype: dtype as any })) as any;
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    // Recover from a partial/corrupt ONNX cache file (e.g. interrupted download on restart)
    if (/Protobuf parsing failed|Load model .* failed|invalid wire type|unexpected EOF/i.test(msg) && env.cacheDir) {
      const fs = await import("fs");
      const path = await import("path");
      const resolvedBase = path.resolve(env.cacheDir);
      const modelCacheDir = path.resolve(resolvedBase, ...model.split("/"));
      if (modelCacheDir.startsWith(resolvedBase + path.sep)) {
        console.warn(`[embed] Clearing corrupted model cache at ${modelCacheDir} and retrying download...`);
        fs.rmSync(modelCacheDir, { recursive: true, force: true });
        return (await pipeline("feature-extraction", model, { dtype: dtype as any })) as any;
      }
    }
    throw err;
  }
}

export function createLocalEmbedder(o: LocalEmbedderOptions = {}): TextEmbedder & { warmup(): Promise<void> } {
  const model = o.model || process.env.EMBED_LOCAL_MODEL || DEFAULT_LOCAL_MODEL;
  const dtype = o.dtype || process.env.EMBED_LOCAL_DTYPE || "fp32";
  const cacheDir = o.cacheDir || process.env.EMBED_MODEL_CACHE_DIR || undefined;
  const load = o.loadPipeline ?? defaultLoadPipeline;
  const isBge = /bge-.*-en/i.test(model);
  const batch = Math.max(1, o.batchSize ?? (parseInt(process.env.EMBED_LOCAL_BATCH || "", 10) || DEFAULT_LOCAL_BATCH));
  let pipe: Promise<(texts: string[], opts: any) => Promise<{ tolist(): number[][] }>> | null = null;
  const getPipe = () => {
    pipe ??= load(model, dtype, cacheDir).catch(e => { pipe = null; throw e; }); // a failed download can be retried later
    return pipe;
  };
  // One inference at a time: ONNX Runtime already uses every core for a batch; parallel runs only thrash.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  };
  return {
    model: dtype === "fp32" ? model : `${model}:${dtype}`,
    provider: "local",
    async warmup() { await getPipe(); },
    embed(texts, kind) {
      return serial(async () => {
        const extract = await getPipe();
        const input = kind === "query" && isBge ? texts.map(t => BGE_QUERY_PREFIX + t) : texts;
        const out: number[][] = [];
        for (let i = 0; i < input.length; i += batch) {
          const t = await extract(input.slice(i, i + batch), { pooling: isBge ? "cls" : "mean", normalize: true });
          out.push(...t.tolist());
        }
        return out;
      });
    },
  };
}

export const GEMINI_EMBED_MODEL = "gemini-embedding-2-preview";

export function createGeminiEmbedder(llm: Pick<LLMService, "embedBatch">, model = GEMINI_EMBED_MODEL): TextEmbedder {
  return {
    model,
    provider: "gemini",
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += 100) {
        const r = await llm.embedBatch({ model, texts: texts.slice(i, i + 100), config: {} });
        out.push(...r.embeddings.map(e => e.values));
      }
      return out;
    },
  };
}
