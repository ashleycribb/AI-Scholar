/**
 * Embedding client: batched, cached, de-duplicated, rate-limit friendly.
 *
 *  - Texts are sent to the server proxy's /api/gemini/embed-batch in chunks (default 100 per call,
 *    the Gemini batchEmbedContents limit), never one request per text.
 *  - Calls run through a small queue with limited concurrency (default 1), so a search can never
 *    stampede the proxy; concurrent callers in the same tick are coalesced into the same call.
 *  - Results are cached by a hash of the full text: in memory (LRU) and in IndexedDB when available.
 *    Identical texts (within a call, across callers, or already in flight) are embedded once.
 *  - On 429/network errors it retries a bounded number of times, honoring Retry-After (plus jitter).
 *    If the wait would be too long it gives up at once and enters a cooldown, during which further
 *    requests fail fast without touching the network. Failures resolve to [] (callers degrade to
 *    keyword scoring) and produce ONE warning per outage instead of one log line per text.
 *
 * Nothing here ever rejects: a text that could not be embedded yields an empty vector.
 */
import { ai } from "../services/geminiClient";

export const EMBEDDING_MODEL = "gemini-embedding-2-preview";
/** Texts per proxy call. Must not exceed the proxy's GEMINI_PROXY_EMBED_BATCH_MAX_TEXTS (default 100). */
export const EMBED_CHUNK_SIZE = 100;
/** Per-text cap; must not exceed the proxy's GEMINI_PROXY_EMBED_TEXT_MAX_CHARS (default 20000). */
export const EMBED_TEXT_MAX_CHARS = 20_000;

const LEGACY_LOCALSTORAGE_KEY = "are_embeddings_index_v1";

// ---------------------------------------------------------------------------
// Hashing (synchronous, so cache lookups stay cheap): two independent 53-bit cyrb53 hashes + length.
// ---------------------------------------------------------------------------
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export const hashText = (text: string): string =>
  `${text.length.toString(36)}.${cyrb53(text, 0).toString(36)}.${cyrb53(text, 0x9e3779b9).toString(36)}`;

// ---------------------------------------------------------------------------
// Persistent store (IndexedDB). Optional: every failure is swallowed.
// ---------------------------------------------------------------------------
export interface PersistentEmbeddingStore {
  getMany(keys: string[]): Promise<Map<string, number[]>>;
  putMany(entries: [string, number[]][]): Promise<void>;
}

export function createIndexedDbStore(opts: { dbName?: string; maxEntries?: number } = {}): PersistentEmbeddingStore | null {
  const idb: IDBFactory | undefined = (globalThis as any).indexedDB;
  if (!idb) return null;
  const dbName = opts.dbName ?? "are-embeddings";
  const maxEntries = opts.maxEntries ?? 2000;
  let dbPromise: Promise<IDBDatabase | null> | null = null;
  const open = () => dbPromise ??= new Promise<IDBDatabase | null>(resolve => {
    try {
      const req = idb.open(dbName, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore("v", { keyPath: "k" });
        os.createIndex("t", "t");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  const done = (tx: IDBTransaction) => new Promise<void>(res => {
    tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res();
  });
  return {
    async getMany(keys) {
      const out = new Map<string, number[]>();
      try {
        const db = await open();
        if (!db || keys.length === 0) return out;
        const tx = db.transaction("v", "readonly");
        const os = tx.objectStore("v");
        for (const k of keys) {
          const r = os.get(k);
          r.onsuccess = () => { const row = r.result; if (row?.v) out.set(k, Array.from(row.v as Float32Array)); };
        }
        await done(tx);
      } catch { /* cache is best-effort */ }
      return out;
    },
    async putMany(entries) {
      try {
        const db = await open();
        if (!db || entries.length === 0) return;
        const tx = db.transaction("v", "readwrite");
        const os = tx.objectStore("v");
        const t = Date.now();
        for (const [k, v] of entries) os.put({ k, v: Float32Array.from(v), t });
        await done(tx);
        // Evict the oldest-written rows when over budget (to 90% so we do not prune on every write).
        const tx2 = db.transaction("v", "readwrite");
        const os2 = tx2.objectStore("v");
        const cnt = os2.count();
        cnt.onsuccess = () => {
          let excess = cnt.result - Math.floor(maxEntries * 0.9);
          if (cnt.result <= maxEntries || excess <= 0) return;
          const cur = os2.index("t").openCursor();
          cur.onsuccess = () => {
            const c = cur.result;
            if (c && excess-- > 0) { c.delete(); c.continue(); }
          };
        };
        await done(tx2);
      } catch { /* best-effort */ }
    },
  };
}

// ---------------------------------------------------------------------------
// Embedder
// ---------------------------------------------------------------------------
export interface EmbedBatchClient {
  embedBatch(params: { model: string; texts: string[] }): Promise<{ embeddings: { values: number[] }[] }>;
}

export interface EmbedderOptions {
  client: EmbedBatchClient;
  model?: string;
  chunkSize?: number;
  /** Simultaneous proxy calls. Default 1. */
  concurrency?: number;
  /** Retries after the first attempt, for 429 / network errors only. Default 2. */
  maxRetries?: number;
  /** Backoff base when the server sent no Retry-After. Default 2000. */
  baseDelayMs?: number;
  /** Max random jitter added to every wait. Default 500. */
  jitterMs?: number;
  /** A wait longer than this is not attempted: give up and cool down instead. Default 20000. */
  maxRetryWaitMs?: number;
  /** Cooldown after giving up when no Retry-After was sent. Default 30000. Capped at 120000. */
  defaultCooldownMs?: number;
  memoryEntries?: number;
  /** null disables persistence. Default: none (the default instance below uses IndexedDB). */
  store?: PersistentEmbeddingStore | null;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  warn?: (msg: string) => void;
}

interface Deferred { resolve: (v: number[]) => void; promise: Promise<number[]> }
const deferred = (): Deferred => {
  let resolve!: (v: number[]) => void;
  const promise = new Promise<number[]>(r => { resolve = r; });
  return { resolve, promise };
};

const isRetryable = (e: any) => {
  const code = Number(e?.status ?? e?.error?.code);
  return code === 429 || code === 0 || e?.error?.status === "RESOURCE_EXHAUSTED" || e?.error?.status === "NETWORK";
};

export function createEmbedder(o: EmbedderOptions) {
  const model = o.model ?? EMBEDDING_MODEL;
  const chunkSize = Math.max(1, o.chunkSize ?? EMBED_CHUNK_SIZE);
  const concurrency = Math.max(1, o.concurrency ?? 1);
  const maxRetries = Math.max(0, o.maxRetries ?? 2);
  const baseDelayMs = o.baseDelayMs ?? 2000;
  const jitterMs = o.jitterMs ?? 500;
  const maxRetryWaitMs = o.maxRetryWaitMs ?? 20_000;
  const defaultCooldownMs = Math.min(o.defaultCooldownMs ?? 30_000, 120_000);
  const memoryEntries = Math.max(1, o.memoryEntries ?? 500);
  const store = o.store ?? null;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const random = o.random ?? Math.random;
  const warn = o.warn ?? ((m: string) => console.warn(m));

  const memory = new Map<string, number[]>(); // insertion order = LRU order
  const inflight = new Map<string, Promise<number[]>>();
  let pending: { key: string; text: string; d: Deferred }[] = [];
  let flushScheduled = false;
  const jobs: (() => Promise<void>)[] = [];
  let active = 0;
  let cooldownUntil = 0;
  let warned = false;

  const memGet = (key: string) => {
    const v = memory.get(key);
    if (v) { memory.delete(key); memory.set(key, v); }
    return v;
  };
  const memSet = (key: string, v: number[]) => {
    memory.delete(key); memory.set(key, v);
    while (memory.size > memoryEntries) memory.delete(memory.keys().next().value as string);
  };

  const warnOnce = (reason: string) => {
    if (warned) return;
    warned = true;
    warn(`[embeddings] Semantic scoring is temporarily unavailable (${reason}); results will use keyword ranking.`);
  };

  const waitFor = (attempt: number, e: any) => {
    const ra = typeof e?.retryAfterMs === "number" ? e.retryAfterMs : undefined;
    const base = ra ?? baseDelayMs * 2 ** attempt;
    return { base, wait: base + random() * jitterMs };
  };

  async function runChunk(chunk: { key: string; text: string; d: Deferred }[]) {
    const fail = (reason: string) => { warnOnce(reason); for (const c of chunk) c.d.resolve([]); };
    if (now() < cooldownUntil) { for (const c of chunk) c.d.resolve([]); return; }
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await o.client.embedBatch({ model, texts: chunk.map(c => c.text) });
        const embs = res?.embeddings;
        if (!Array.isArray(embs) || embs.length !== chunk.length) {
          // Never pair vectors with texts positionally unless the counts match exactly.
          return fail("unexpected response from the embedding service");
        }
        const toStore: [string, number[]][] = [];
        chunk.forEach((c, i) => {
          const v = Array.isArray(embs[i]?.values) ? embs[i].values : [];
          if (v.length > 0) { memSet(c.key, v); toStore.push([c.key, v]); }
          c.d.resolve(v);
        });
        warned = false; cooldownUntil = 0;
        if (store && toStore.length) void store.putMany(toStore).catch(() => {});
        return;
      } catch (e: any) {
        if (!isRetryable(e)) {
          // Config/model/validation errors will not fix themselves in seconds: back off briefly so the
          // rest of this search (and the next one) does not re-send the same failing request.
          cooldownUntil = now() + Math.min(defaultCooldownMs, 15_000);
          return fail(`error ${e?.status ?? ""}`.trim());
        }
        const { base, wait } = waitFor(attempt, e);
        if (attempt >= maxRetries || base > maxRetryWaitMs) {
          const hinted = typeof e?.retryAfterMs === "number" ? e.retryAfterMs : defaultCooldownMs;
          cooldownUntil = now() + Math.min(Math.max(hinted, 1000), 120_000);
          return fail("rate limited");
        }
        await sleep(wait);
      }
    }
  }

  function pump() {
    while (active < concurrency && jobs.length) {
      const job = jobs.shift()!;
      active++;
      job().catch(() => {}).finally(() => { active--; pump(); });
    }
  }

  function flush() {
    flushScheduled = false;
    const batch = pending; pending = [];
    for (let i = 0; i < batch.length; i += chunkSize) {
      const chunk = batch.slice(i, i + chunkSize);
      jobs.push(async () => {
        try { await runChunk(chunk); }
        catch { for (const c of chunk) c.d.resolve([]); } // belt and braces: never leave a caller hanging
      });
    }
    pump();
  }

  function enqueue(key: string, text: string, d: Deferred) {
    pending.push({ key, text, d });
    if (!flushScheduled) { flushScheduled = true; setTimeout(flush, 0); }
  }

  /** One vector per input text (same order); [] for texts that are blank or could not be embedded. */
  async function batchEmbedText(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) return [];
    const keys: (string | null)[] = [];
    const results: Promise<number[]>[] = [];
    const fresh = new Map<string, { text: string; d: Deferred }>(); // first-seen uncached, not in flight
    for (const raw of texts) {
      const text = typeof raw === "string" ? raw.trim().slice(0, EMBED_TEXT_MAX_CHARS) : "";
      if (!text) { keys.push(null); results.push(Promise.resolve([])); continue; }
      const key = hashText(text);
      keys.push(key);
      const hit = memGet(key);
      if (hit) { results.push(Promise.resolve(hit)); continue; }
      let p = inflight.get(key);
      if (!p) {
        const d = deferred();
        p = d.promise;
        inflight.set(key, p);
        void p.finally(() => { if (inflight.get(key) === p) inflight.delete(key); });
        fresh.set(key, { text, d });
      }
      results.push(p);
    }
    if (fresh.size > 0) {
      // Persistent lookup for all new keys at once, then enqueue the misses together (one call).
      const persisted = store ? await store.getMany([...fresh.keys()]).catch(() => new Map<string, number[]>()) : new Map<string, number[]>();
      for (const [key, { text, d }] of fresh) {
        const hit = persisted.get(key);
        if (hit && hit.length > 0) { memSet(key, hit); d.resolve(hit); }
        else enqueue(key, text, d);
      }
    }
    return Promise.all(results);
  }

  async function embedText(text: string): Promise<number[]> {
    return (await batchEmbedText([text]))[0] ?? [];
  }

  return {
    embedText,
    batchEmbedText,
    /** Test/ops helpers. */
    clearMemory: () => memory.clear(),
    resetCooldown: () => { cooldownUntil = 0; warned = false; },
    get cooldownUntil() { return cooldownUntil; },
  };
}

// ---------------------------------------------------------------------------
// App-wide instance
// ---------------------------------------------------------------------------
try { (globalThis as any).localStorage?.removeItem(LEGACY_LOCALSTORAGE_KEY); } catch { /* old ~1 MB cache, unused now */ }

const defaultEmbedder = createEmbedder({
  client: { embedBatch: p => ai.models.embedBatch(p) },
  store: createIndexedDbStore(),
});

export const embedText = defaultEmbedder.embedText;
export const batchEmbedText = defaultEmbedder.batchEmbedText;
export const __defaultEmbedder = defaultEmbedder;
