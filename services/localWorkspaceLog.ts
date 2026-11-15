/**
 * Local-first workspace log (20-year data design, fix 1).
 *
 * The researcher's selection queue and research notes are stored on their own
 * computer in IndexedDB as an append-only list of recorded actions. Current
 * state is never stored directly: it is rebuilt from the list on load.
 *
 * - Records are only ever added (IDBObjectStore.add); nothing is edited or deleted.
 * - Every record carries `schemaVersion` and a UTC ISO-8601 `recordedAt` timestamp.
 * - A write counts as saved only after the IndexedDB transaction completes.
 * - This is the source of truth for the queue and notes. The signed-in server
 *   state document is a secondary copy.
 *
 * This module writes plain JSON-compatible records. It does not encode S3A.
 */
import type { ResearchPaper } from '../types';
import { canonicalWorkId, extractAliases, sameWork, withWorkId } from '../utils/workIds';
import { paperFacts } from './paperFacts';
import { isUtcIso, nfcDeep } from '../utils/nfc';

/**
 * Version of the records this code writes. History (docs/data/MIGRATIONS.md):
 *   1  fix 1: paperId was whatever id the search source used (W…, crossref:…, random ids from some sources).
 *   2  fix 4: paperId is the permanent work id (utils/workIds.ts); queue.add papers carry aliases.
 *   3  fix 5: queue.add papers carry facts only (services/paperFacts.ts); no AI scores, summaries or UI state.
 * Old records are never rewritten (the log is append-only); they are upcast on read by migrateWorkspaceRecords.
 */
export const WORKSPACE_LOG_SCHEMA_VERSION = 3 as const;
export const WORKSPACE_LOG_DB_NAME = 'scholar_explorer_local';
export const WORKSPACE_LOG_DB_VERSION = 1;
export const WORKSPACE_LOG_STORE = 'workspace_events';

/** Default note id: one research-notes document per project. */
export function noteIdForProject(projectName?: string): string {
    return `notes:${projectName || 'default'}`;
}

interface BaseRecord {
    schemaVersion: typeof WORKSPACE_LOG_SCHEMA_VERSION;
    /** Set on records upcast from an older schema at read time: the version they were written with. */
    migratedFrom?: number;
    /** Auto-increment key assigned by IndexedDB (insertion order). */
    seq?: number;
    /** UTC ISO-8601 time the action was recorded, e.g. 2026-11-14T22:10:00.000Z. */
    recordedAt: string;
}

export interface QueueAddRecord extends BaseRecord {
    type: 'queue.add';
    paperId: string;
    /** Snapshot of the paper as shown when added, so the queue can be rebuilt offline. */
    paper: ResearchPaper;
    /** 'researcher' for an action taken in this browser; 'server-state-import' when copied from the signed-in server state. */
    origin: 'researcher' | 'server-state-import';
}

export interface QueueRemoveRecord extends BaseRecord {
    type: 'queue.remove';
    paperId: string;
    origin: 'researcher';
}

export interface NoteRecord extends BaseRecord {
    type: 'note.created' | 'note.edited';
    noteId: string;
    /** Paper the note is about; null for the project-level research notes. */
    paperId: string | null;
    /** Full note text as typed by the researcher. */
    text: string;
}

/**
 * The researcher's keep/drop judgment on a paper (the button beside its match score). Recorded whether or not the
 * researcher consented to a study: consent governs research about them, not keeping their own decisions.
 */
export interface PaperDecisionRecord extends BaseRecord {
    type: 'paper.decision';
    paperId: string;
    decision: 'keep' | 'drop';
    origin: 'researcher';
}

export type WorkspaceLogRecord = QueueAddRecord | QueueRemoveRecord | NoteRecord | PaperDecisionRecord;

/** Distributive Omit so each union member keeps its own fields. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type NewWorkspaceLogRecord = DistributiveOmit<WorkspaceLogRecord, 'schemaVersion' | 'seq' | 'recordedAt'>;

export interface RebuiltNote {
    noteId: string;
    paperId: string | null;
    text: string;
    createdAt: string;
    updatedAt: string;
}

export interface RebuiltDecision {
    paperId: string;
    decision: 'keep' | 'drop';
    decidedAt: string;
}

export interface RebuiltWorkspace {
    queue: ResearchPaper[];
    notes: Record<string, RebuiltNote>;
    /** Latest keep/drop decision per paper id. */
    decisions: Record<string, RebuiltDecision>;
    recordCount: number;
}

/**
 * The paper as saved in a queue.add record: facts only (services/paperFacts.ts). Match scores, summaries and other
 * model output, and transient UI state, are never written to the log.
 */
export function snapshotPaper(paper: ResearchPaper): ResearchPaper {
    return paperFacts(paper) as ResearchPaper;
}

/**
 * Written migration, v1 -> v2 (upcast on read; stored records are not changed):
 *  - queue.add: the paper gets its permanent work id and aliases (withWorkId); paperId becomes that id and the
 *    old id is kept as paper.sourceId.
 *  - every other record's paperId is mapped through the ids learned from the v1 queue.add records; an id never
 *    seen in a queue.add is converted when it is itself a recognizable identifier (W…, crossref:<doi>, arxiv:…),
 *    and otherwise kept unchanged.
 *  - schemaVersion becomes 2 and migratedFrom records 1.
 * Written migration, v2 -> v3 (also on read):
 *  - queue.add papers keep only their facts (paperFacts); AI scores, summaries, explanations and UI flags that older
 *    records saved are dropped, since they are rebuildable output and not the researcher's data.
 *  - schemaVersion becomes 3 and migratedFrom records the version the record was written with.
 * Records newer than this code understands throw: their meaning is never guessed.
 */
export function migrateWorkspaceRecords(records: Array<Record<string, any>>): WorkspaceLogRecord[] {
    const ordered = [...records].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
    const idMap = new Map<string, string>();
    for (const r of ordered) {
        if (r.schemaVersion === 1 && r.type === 'queue.add' && r.paper) {
            idMap.set(String(r.paperId), withWorkId({ ...r.paper, id: r.paper.id ?? r.paperId }).id);
        }
    }
    const mapId = (id: unknown): string | null => {
        if (id === null || id === undefined) return null;
        const old = String(id);
        if (idMap.has(old)) return idMap.get(old)!;
        const aliases = extractAliases({ id: old });
        const best = aliases.find(a => a.scheme !== 'fingerprint');
        return best ? canonicalWorkId({ id: old }) : old;
    };
    return ordered.map(r => {
        if (r.schemaVersion === WORKSPACE_LOG_SCHEMA_VERSION) return r as WorkspaceLogRecord;
        if (r.schemaVersion !== 1 && r.schemaVersion !== 2) {
            throw new Error(`Unsupported workspace log schemaVersion ${String(r.schemaVersion)}`);
        }
        const up: Record<string, any> = { ...r, schemaVersion: WORKSPACE_LOG_SCHEMA_VERSION, migratedFrom: r.schemaVersion };
        if (r.schemaVersion === 1) {
            // v1 -> v2
            if (r.type === 'queue.add' && r.paper) {
                const paper = withWorkId({ ...r.paper, id: r.paper.id ?? r.paperId });
                up.paper = paper;
                up.paperId = paper.id;
            } else if ('paperId' in r) {
                up.paperId = mapId(r.paperId);
            }
        }
        // v2 -> v3
        if (r.type === 'queue.add' && up.paper) up.paper = paperFacts(up.paper);
        return up as WorkspaceLogRecord;
    });
}

/** Rebuild current queue and notes by replaying the records in order (older records are upcast first). */
export function rebuildWorkspace(input: WorkspaceLogRecord[]): RebuiltWorkspace {
    const ordered = migrateWorkspaceRecords(input as Array<Record<string, any>>);
    const queue: ResearchPaper[] = [];
    const notes: Record<string, RebuiltNote> = {};
    const decisions: Record<string, RebuiltDecision> = {};
    for (const r of ordered) {
        if (r.schemaVersion !== WORKSPACE_LOG_SCHEMA_VERSION) {
            // Unknown future schema: never guess at its meaning.
            throw new Error(`Unsupported workspace log schemaVersion ${String((r as { schemaVersion?: unknown }).schemaVersion)}`);
        }
        switch (r.type) {
            case 'queue.add':
                if (!queue.some(p => p.id === r.paperId || sameWork(p, r.paper))) queue.push(r.paper);
                break;
            case 'queue.remove': {
                const i = queue.findIndex(p => p.id === r.paperId || p.sourceId === r.paperId);
                if (i >= 0) queue.splice(i, 1);
                break;
            }
            case 'note.created':
            case 'note.edited': {
                const prev = notes[r.noteId];
                notes[r.noteId] = {
                    noteId: r.noteId,
                    paperId: r.paperId,
                    text: r.text,
                    createdAt: prev?.createdAt ?? r.recordedAt,
                    updatedAt: r.recordedAt,
                };
                break;
            }
            case 'paper.decision':
                decisions[r.paperId] = { paperId: r.paperId, decision: r.decision, decidedAt: r.recordedAt };
                break;
            default:
                throw new Error(`Unknown workspace log record type ${String((r as { type?: unknown }).type)}`);
        }
    }
    // Restored queue papers carry the researcher's latest keep/drop decision.
    for (let i = 0; i < queue.length; i++) {
        const d = decisions[queue[i].id];
        if (d) queue[i] = { ...queue[i], researcherScoreDecision: d.decision };
    }
    return { queue, notes, decisions, recordCount: ordered.length };
}

/** Queue changes between two lists, as records to append (removals first, then additions in list order). */
export function diffQueue(previous: ResearchPaper[], next: ResearchPaper[]): NewWorkspaceLogRecord[] {
    const prevIds = new Set(previous.map(p => p.id));
    const nextIds = new Set(next.map(p => p.id));
    const out: NewWorkspaceLogRecord[] = [];
    for (const p of previous) {
        if (!nextIds.has(p.id)) out.push({ type: 'queue.remove', paperId: p.id, origin: 'researcher' });
    }
    for (const p of next) {
        if (!prevIds.has(p.id)) out.push({ type: 'queue.add', paperId: p.id, paper: snapshotPaper(p), origin: 'researcher' });
    }
    return out;
}

// ---------------------------------------------------------------------------
// IndexedDB access
// ---------------------------------------------------------------------------

let dbPromise: Promise<IDBDatabase> | null = null;

const logListeners = new Set<() => void>();
/** Called after every confirmed append (e.g. to refresh what an export will contain). */
export function subscribeWorkspaceLog(listener: () => void): () => void {
    logListeners.add(listener);
    return () => { logListeners.delete(listener); };
}
function notifyLogListeners(): void {
    logListeners.forEach(l => { try { l(); } catch (err) { console.error('[Local log] listener failed:', err); } });
}

function getIndexedDB(): IDBFactory {
    if (typeof indexedDB === 'undefined') {
        throw new Error('IndexedDB is not available in this browser');
    }
    return indexedDB;
}

function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        let req: IDBOpenDBRequest;
        try {
            req = getIndexedDB().open(WORKSPACE_LOG_DB_NAME, WORKSPACE_LOG_DB_VERSION);
        } catch (err) {
            reject(err);
            return;
        }
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(WORKSPACE_LOG_STORE)) {
                db.createObjectStore(WORKSPACE_LOG_STORE, { keyPath: 'seq', autoIncrement: true });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => { db.close(); dbPromise = null; };
            resolve(db);
        };
        req.onerror = () => reject(req.error ?? new Error('Could not open the local workspace database'));
        req.onblocked = () => reject(new Error('Local workspace database is blocked by another tab'));
    });
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
}

/**
 * Append records in one transaction. Resolves with the stored records only
 * after the transaction completes; rejects if anything fails (nothing is
 * reported as saved in that case).
 */
export async function appendWorkspaceRecords(entries: NewWorkspaceLogRecord[], now: () => Date = () => new Date()): Promise<WorkspaceLogRecord[]> {
    if (entries.length === 0) return [];
    const db = await openDb();
    const recordedAt = now().toISOString();
    // Text is stored NFC (fix 7), so the same note or name always has the same bytes.
    const records = entries.map(e => nfcDeep({ ...e, schemaVersion: WORKSPACE_LOG_SCHEMA_VERSION, recordedAt }) as WorkspaceLogRecord);
    return writeRecords(db, records);
}

function writeRecords(db: IDBDatabase, records: WorkspaceLogRecord[]): Promise<WorkspaceLogRecord[]> {
    return new Promise<WorkspaceLogRecord[]>((resolve, reject) => {
        let tx: IDBTransaction;
        try {
            tx = db.transaction(WORKSPACE_LOG_STORE, 'readwrite');
        } catch (err) {
            reject(err);
            return;
        }
        const store = tx.objectStore(WORKSPACE_LOG_STORE);
        records.forEach(r => {
            const req = store.add(r);
            req.onsuccess = () => { r.seq = req.result as number; };
        });
        tx.oncomplete = () => { resolve(records); notifyLogListeners(); };
        tx.onerror = () => reject(tx.error ?? new Error('Local save failed'));
        tx.onabort = () => reject(tx.error ?? new Error('Local save was aborted'));
    });
}

export class WorkspaceImportError extends Error {
    constructor(message: string) { super(message); this.name = 'WorkspaceImportError'; }
}

/**
 * Restores records exported from another browser (events.jsonl) into THIS browser's log, which must be empty:
 * an import never mixes with or rewrites existing history. Each record keeps its original seq, recordedAt (UTC),
 * schemaVersion and migratedFrom, so exporting again gives the same events. Everything is checked first and
 * written in one transaction: either all records are restored or none.
 */
export async function importWorkspaceRecords(input: Array<Record<string, unknown>>): Promise<WorkspaceLogRecord[]> {
    const existing = await readRawWorkspaceLog();
    if (existing.length > 0) {
        throw new WorkspaceImportError(`This browser already has ${existing.length} workspace record(s). Import only into an empty profile.`);
    }
    const seen = new Set<number>();
    const records = input.map((r, i) => {
        if (!r || typeof r !== 'object') throw new WorkspaceImportError(`Record ${i + 1} is not an object.`);
        if (!isUtcIso(r.recordedAt)) throw new WorkspaceImportError(`Record ${i + 1} has no UTC recordedAt timestamp.`);
        if (typeof r.seq !== 'number' || !Number.isInteger(r.seq) || r.seq < 1 || seen.has(r.seq)) {
            throw new WorkspaceImportError(`Record ${i + 1} has a missing or repeated seq.`);
        }
        seen.add(r.seq);
        return nfcDeep(r);
    });
    // Same checks as a normal load: unknown versions or record types are refused, never guessed.
    rebuildWorkspace(records as unknown as WorkspaceLogRecord[]);
    const ordered = migrateWorkspaceRecords(records as Array<Record<string, any>>);
    if (ordered.length === 0) return [];
    const db = await openDb();
    return writeRecords(db, ordered);
}

export function appendWorkspaceRecord(entry: NewWorkspaceLogRecord, now?: () => Date): Promise<WorkspaceLogRecord> {
    return appendWorkspaceRecords([entry], now).then(r => r[0]);
}

/** Every record in insertion order, upcast to the current schema (see migrateWorkspaceRecords). */
export async function readWorkspaceLog(): Promise<WorkspaceLogRecord[]> {
    return migrateWorkspaceRecords(await readRawWorkspaceLog() as Array<Record<string, any>>);
}

/** Every record exactly as stored (any schema version), in insertion order. */
export async function readRawWorkspaceLog(): Promise<WorkspaceLogRecord[]> {
    const db = await openDb();
    return new Promise<WorkspaceLogRecord[]>((resolve, reject) => {
        const tx = db.transaction(WORKSPACE_LOG_STORE, 'readonly');
        const req = tx.objectStore(WORKSPACE_LOG_STORE).getAll();
        req.onsuccess = () => resolve(req.result as WorkspaceLogRecord[]);
        req.onerror = () => reject(req.error ?? new Error('Could not read the local workspace log'));
    });
}

export async function loadWorkspace(): Promise<RebuiltWorkspace> {
    return rebuildWorkspace(await readWorkspaceLog());
}

export type PersistResult = 'granted' | 'denied' | 'unsupported' | 'error';

/**
 * Ask the browser not to evict this site's storage. A refusal is normal (the
 * data is still saved, only best-effort); callers can show it but must not fail.
 */
export async function requestPersistentStorage(nav: Pick<Navigator, 'storage'> | undefined = typeof navigator !== 'undefined' ? navigator : undefined): Promise<PersistResult> {
    try {
        const storage = nav?.storage;
        if (!storage || typeof storage.persist !== 'function') return 'unsupported';
        if (typeof storage.persisted === 'function' && await storage.persisted()) return 'granted';
        return (await storage.persist()) ? 'granted' : 'denied';
    } catch {
        return 'error';
    }
}

/** Test hook: drop the cached connection so the next call opens the database again. */
export function __resetWorkspaceLogConnectionForTests(): void {
    dbPromise = null;
}
