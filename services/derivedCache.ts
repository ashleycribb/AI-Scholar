/**
 * Derived cache (20-year data design, fix 5).
 *
 * Model output about a paper (match scores, plain-language summaries) is not the researcher's data: it can be
 * rebuilt from the paper facts by running the model again. It is kept here, in its own IndexedDB database, so it can
 * be deleted at any time without losing anything, and so every stored result says exactly what produced it:
 *
 *   model          the model that actually answered (as reported by the server), never a hardcoded label
 *   modelRevision  the provider's version string for it, or null when the provider does not report one
 *   inputHash      SHA-256 (hex) of the canonical JSON of exactly what was sent to the model
 *   createdAt      UTC ISO-8601
 *
 * A result without a model name is refused.
 */

export const DERIVED_CACHE_SCHEMA_VERSION = 1 as const;
export const DERIVED_DB_NAME = 'scholar_explorer_derived';
export const DERIVED_DB_VERSION = 1;
export const DERIVED_STORE = 'derived';

export type DerivedKind = 'match-score' | 'plain-language-summary';

export interface DerivedRecord<V = unknown> {
    schemaVersion: typeof DERIVED_CACHE_SCHEMA_VERSION;
    /** `${kind}|${workId}|${model}|${inputHash}` */
    key: string;
    workId: string;
    kind: DerivedKind;
    model: string;
    modelRevision: string | null;
    inputHash: string;
    createdAt: string;
    value: V;
}

export class MissingModelError extends Error {
    constructor(kind: string) {
        super(`Refusing to cache a ${kind} result that does not name the model that produced it.`);
        this.name = 'MissingModelError';
    }
}

/** Canonical JSON: object keys sorted, NFC strings, so the same input always hashes the same. */
export function canonicalInput(value: unknown): string {
    const norm = (v: unknown): unknown => {
        if (typeof v === 'string') return v.normalize('NFC');
        if (Array.isArray(v)) return v.map(norm);
        if (v && typeof v === 'object') {
            return Object.fromEntries(Object.keys(v as object).sort().map(k => [k, norm((v as Record<string, unknown>)[k])]));
        }
        return v;
    };
    return JSON.stringify(norm(value));
}

export async function sha256Hex(text: string): Promise<string> {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return Array.from(digest, b => b.toString(16).padStart(2, '0')).join('');
}

export async function inputHash(input: unknown): Promise<string> {
    return sha256Hex(canonicalInput(input));
}

/** Builds a cache record; throws MissingModelError when no model is named. */
export async function derivedRecord<V>(args: {
    workId: string; kind: DerivedKind; model: string | null | undefined; modelRevision?: string | null;
    input: unknown; value: V; now?: Date;
}): Promise<DerivedRecord<V>> {
    const model = (args.model ?? '').trim();
    if (!model) throw new MissingModelError(args.kind);
    const hash = await inputHash(args.input);
    return {
        schemaVersion: DERIVED_CACHE_SCHEMA_VERSION,
        key: `${args.kind}|${args.workId}|${model}|${hash}`,
        workId: args.workId,
        kind: args.kind,
        model,
        modelRevision: args.modelRevision ?? null,
        inputHash: hash,
        createdAt: (args.now ?? new Date()).toISOString(),
        value: args.value,
    };
}

function openDerivedDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === 'undefined') return Promise.resolve(null);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DERIVED_DB_NAME, DERIVED_DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(DERIVED_STORE)) {
                const store = db.createObjectStore(DERIVED_STORE, { keyPath: 'key' });
                store.createIndex('workId', 'workId');
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

/**
 * Stores derived records (replacing an identical key). Returns the number written; 0 when this environment has no
 * IndexedDB. The cache is optional, so callers may ignore a failure; it never stands in for a researcher's save.
 */
export async function putDerived(records: DerivedRecord[]): Promise<number> {
    for (const r of records) if (!r.model) throw new MissingModelError(r.kind);
    if (records.length === 0) return 0;
    const db = await openDerivedDb();
    if (!db) return 0;
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(DERIVED_STORE, 'readwrite');
            const store = tx.objectStore(DERIVED_STORE);
            for (const r of records) store.put(r);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error ?? new Error('derived cache write aborted'));
        });
        return records.length;
    } finally {
        db.close();
    }
}

export async function readDerived(filter: { workId?: string; kind?: DerivedKind } = {}): Promise<DerivedRecord[]> {
    const db = await openDerivedDb();
    if (!db) return [];
    try {
        const all = await new Promise<DerivedRecord[]>((resolve, reject) => {
            const tx = db.transaction(DERIVED_STORE, 'readonly');
            const req = filter.workId
                ? tx.objectStore(DERIVED_STORE).index('workId').getAll(filter.workId)
                : tx.objectStore(DERIVED_STORE).getAll();
            req.onsuccess = () => resolve(req.result as DerivedRecord[]);
            req.onerror = () => reject(req.error);
        });
        return filter.kind ? all.filter(r => r.kind === filter.kind) : all;
    } finally {
        db.close();
    }
}

/** Deletes the whole cache. Safe: everything in it can be rebuilt. */
export function clearDerivedCache(): Promise<void> {
    if (typeof indexedDB === 'undefined') return Promise.resolve();
    return new Promise((resolve, reject) => {
        const req = indexedDB.deleteDatabase(DERIVED_DB_NAME);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
    });
}
