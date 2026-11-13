/**
 * S3A WASM Integration Service for Scholar Explorer
 * 
 * S3A LRS server is the authoritative database of record.
 * Every human and AI action is sent as an xAPI 1.0.3 statement to the S3A LRS.
 * The in-browser S3A WASM session acts as an offline cache.
 * Nothing counts as saved until the server acknowledges it.
 */

import init, { WasmAgentSnapshot, new_session, from_bytes } from "https://cdn.jsdelivr.net/gh/ashleycribb/s3a-wasm-dist@v0.1.56/v0.1.56/s3a_wasm_snapshot.js";

export const S3A_ENGINE_VERSION = "v0.1.56";
import type { ResearchPaper } from "../types";

export enum ScholarTool {
  TOOL_READ_FILE = 1,
  TOOL_OPENALEX_QUERY = 2,
  TOOL_EXTRACT_CLAIMS = 4,
  TOOL_SYNTHESIZE_EVIDENCE = 8,
  TOOL_CROSSREF_QUERY = 16,
  TOOL_EXPORT_SNAPSHOT = 32,
  TOOL_TA_SUPERVISOR_CALL = 64,
  TOOL_MUTATE_GRAPH = 128,
  TOOL_PUBLISH = 65536,
  TOOL_CREDENTIAL_EXPORT = 131072,
}

import {
  buildHumanStatement,
  buildAiStatement,
  generateStatementUuid,
  hexToDashedUuid,
  queueAndFlushStatement,
  initializeOutboxSync,
  getLrsSyncState,
  subscribeLrsSync
} from './s3aOutboxService';

import { getStatements } from './lrsClient';
import { authService, generateUuidV7 } from './authService';
import { 
  getResearchLoggingConsent, 
  setResearchLoggingConsent,
  getParticipantStudyId,
  saveParticipantStudyId,
  getStoredConsentState,
  saveStoredConsentState
} from './lrsCredentialsService';
export { 
  getResearchLoggingConsent, 
  setResearchLoggingConsent,
  getParticipantStudyId,
  saveParticipantStudyId,
  getStoredConsentState,
  saveStoredConsentState
};

// Verbs mapping according to S3A xAPI profile:
// 1: experienced (view paper)
// 2: reviewed (note)
// 3: approved (approve claim)
// 4: rejected (reject claim)
// 5: requested-human-review (request review)
// 6: flagged-hallucination
// 7: cites
// 8: imported
// 9: exported-snapshot
// Native Verbs according to S3A WebAssembly Snapshot Engine:
// 1: experienced, 2: reviewed, 3: approved, 4: rejected, 5: requested-human-review
// 6: flagged-hallucination, 7: cites, 8: imported, 9: exported-snapshot
// 10: searched, 11: opened, 12: viewed, 13: saved, 14: removed, 15: created
// 16: edited, 17: asked, 18: ai-answered, 19: accepted, 20: logged-out
// 21: consent-declined, 22: flagged-discrepancy, 23: verified-claim
export const S3A_VERBS = {
  VIEW_PAPER: 1,
  NOTE: 2,
  APPROVE_CLAIM: 3,
  REJECT_CLAIM: 4,
  REQUEST_REVIEW: 5,
  FLAG_HALLUCINATION: 6,
  CITES: 7,
  IMPORTED: 8,
  EXPORTED_SNAPSHOT: 9,
  SEARCHED: 10,
  OPENED: 11,
  VIEWED: 12,
  SAVED: 13,
  REMOVED: 14,
  CREATED: 15,
  EDITED: 16,
  ASKED: 17,
  AI_ANSWERED: 18,
  ACCEPTED: 19,
  LOGGED_OUT: 20,
  CONSENT_DECLINED: 21,
  FLAGGED_DISCREPANCY: 22,
  VERIFIED_CLAIM: 23,
} as const;

export const S3A_AGENTS = {
  LAB_ASSISTANT: 'lab-assistant',
  CLAIM_CHECKER: 'claim-checker',
  SOURCE_VERIFIER: 'source-verifier',
  METHODOLOGY_AUDITOR: 'methodology-auditor',
  CITATION_GENERATOR: 'citation-generator'
} as const;

export interface S3AHumanStepLog {
  stepIndex: number;
  verbId: number;
  verbName: string;
  actor: string;
  objectDesc: string;
  objectId?: string;
  aiTraceIndex: number | null;
  timestamp: string;
  statementId: string;
}

export interface S3AAiStepLog {
  stepIndex: number;
  agentSlug: string;
  stepType: number;
  confidence: number;
  humanIndex: number | null;
  humanStatementId?: string | null;
  preflightResult: string;
  requiresGate: boolean;
  isGateApproved?: boolean;
  timestamp: string;
  statementId: string;
  blockedByPolicy?: boolean;
}

export interface S3ASessionState {
  isInitialized: boolean;
  sessionUuidHex: string;
  dashedUuid: string;
  humanStepsCount: number;
  aiStepsCount: number;
  papersCount: number;
  bytesLength: number;
  lastPreflightStatus: string;
  humanSteps: S3AHumanStepLog[];
  aiSteps: S3AAiStepLog[];
  isOfflineCopy: boolean;
  dataSource: 'server' | 'offline_cache';
  bufferedQueueCount?: number;
  lastFlushError?: string | null;
  lastFlushAt?: string | null;
}

const IDB_NAME = 'scholar_explorer_s3a';
const IDB_STORE = 'snapshot_store';
const IDB_KEY = 'active_session_snapshot';
const IDB_UUID_KEY = 'active_session_uuid';

export interface VerbResolutionLogEntry {
  verb: string;
  initialIri: string;
  verbId: number;
  wasmVerbName: string;
  wasmIri: string;
  wasMapped: boolean;
  originalVerb: string;
  timestamp: string;
}

export const WASM_SUPPORTED_VERBS: Record<number, { name: string; iri: string }> = {
  1: { name: 'experienced', iri: 'http://adlnet.gov/expapi/verbs/experienced' },
  2: { name: 'reviewed', iri: 'https://ashecribb.dev/xapi/verbs/reviewed' },
  3: { name: 'approved', iri: 'https://ashecribb.dev/xapi/verbs/approved' },
  4: { name: 'rejected', iri: 'https://ashecribb.dev/xapi/verbs/rejected' },
  5: { name: 'requested-human-review', iri: 'https://ashecribb.dev/xapi/verbs/requested-human-review' },
  6: { name: 'flagged-hallucination', iri: 'https://ashecribb.dev/xapi/verbs/flagged-hallucination' },
  7: { name: 'cites', iri: 'http://purl.org/spar/cito/cites' },
  8: { name: 'imported', iri: 'https://ashecribb.dev/xapi/verbs/imported' },
  9: { name: 'exported-snapshot', iri: 'https://ashecribb.dev/xapi/verbs/exported-snapshot' },
  10: { name: 'searched', iri: 'https://ashecribb.dev/xapi/verbs/searched' },
  11: { name: 'opened', iri: 'https://ashecribb.dev/xapi/verbs/opened' },
  12: { name: 'viewed', iri: 'https://ashecribb.dev/xapi/verbs/viewed' },
  13: { name: 'saved', iri: 'https://ashecribb.dev/xapi/verbs/saved' },
  14: { name: 'removed', iri: 'https://ashecribb.dev/xapi/verbs/removed' },
  15: { name: 'created', iri: 'http://activitystrea.ms/schema/1.0/create' },
  16: { name: 'edited', iri: 'https://ashecribb.dev/xapi/verbs/edited' },
  17: { name: 'asked', iri: 'http://adlnet.gov/expapi/verbs/asked' },
  18: { name: 'ai-answered', iri: 'https://ashecribb.dev/xapi/verbs/ai-answered' },
  19: { name: 'accepted', iri: 'https://ashecribb.dev/xapi/verbs/accepted' },
  20: { name: 'logged-out', iri: 'http://adlnet.gov/expapi/verbs/logged-out' },
  21: { name: 'consent-declined', iri: 'https://ashecribb.dev/xapi/verbs/consent-declined' },
  22: { name: 'flagged-discrepancy', iri: 'https://ashecribb.dev/xapi/verbs/flagged-discrepancy' },
  23: { name: 'verified-claim', iri: 'https://ashecribb.dev/xapi/verbs/verified-claim' },
};

export function iri_for_verb_id(id: number): string | undefined {
  if (activeSnapshot) {
    try {
      const res = activeSnapshot.iri_for_verb_id(id);
      if (res) return res;
    } catch {}
  }
  return WASM_SUPPORTED_VERBS[id]?.iri;
}

export function verb_id_for_iri(iri: string): number | undefined {
  if (activeSnapshot) {
    try {
      const res = activeSnapshot.verb_id_for_iri(iri);
      if (res !== undefined) return res;
    } catch {}
  }
  for (const [key, val] of Object.entries(WASM_SUPPORTED_VERBS)) {
    if (val.iri === iri || val.name === iri) return Number(key);
  }
  return undefined;
}

export interface S3AStatementObject {
  id: string;
  name: string;
  type?: string;
  description?: string;
}

export interface S3AStatementExtras {
  actor?: 'human' | 'agent';
  agentSlug?: string;
  decision?: 'accepted' | 'rejected' | 'edited';
  confidence?: number;
  toolBit?: number;
  ai_trace_index?: number | null;
  aiIndex?: number | null;
  original_verb?: string;
  [key: string]: any;
}

export interface S3AStatement {
  id: string; // UUIDv7
  timestamp: string;
  session_id: string;
  actor_uuid?: string; // Omitted for consent-declined marker
  agent_uuid?: string;
  actorType: 'human' | 'agent';
  actor: {
    id: string;
    name: string;
    type: 'human' | 'agent';
  };
  verb: {
    id: string;
    display: string;
    verb_id?: number;
  };
  object: S3AStatementObject;
  extras?: Record<string, any>;
}

export interface QueuedBufferItem {
  id?: number;
  statement: S3AStatement;
  enqueuedAt: string;
}

let wasmInitPromise: Promise<any> | null = null;
let sessionInitPromise: Promise<WasmAgentSnapshot> | null = null;
let activeSnapshot: WasmAgentSnapshot | null = null;
let currentSessionUuidHex = '';
let humanSteps: S3AHumanStepLog[] = [];
let aiSteps: S3AAiStepLog[] = [];
let papersCount = 0;
let lastPreflightStatus = 'ok';
let isOfflineCopy = false;
let dataSource: 'server' | 'offline_cache' = 'server';
let totalStatementsCount = 0;
let unmappedVerbsCount = 0;
let recent5Statements: S3AStatement[] = [];
let verbResolutionLog: VerbResolutionLogEntry[] = [];
let isRestoredFromBytes = false;
let currentSnapshotBytesLength = 0;
let lastGoodBytes: Uint8Array | null = null;
let isSnapshotPoisoned = false;
let lastSnapshotError: string | null = null;
let lastFlushError: string | null = null;
let cachedBufferQueueCount = 0;

// Track OpenAlex paper IDs already added to the current S3A session to prevent duplicates
const sessionAddedPaperIds = new Set<string>();
// Track any add_paper / add_claim failures so they are never hidden and block broken exports
let sessionRecordErrors: string[] = [];
// Track papers skipped because they had no OpenAlex ID
let sessionSkippedPaperWarnings: string[] = [];

export function extractCleanOpenAlexId(rawId?: string): string {
  if (!rawId || typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  const match = trimmed.match(/(?:https?:\/\/openalex\.org\/)?(W[1-9][0-9]*)$/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return '';
}

export function getSessionRecordErrors(): string[] {
  return [...sessionRecordErrors];
}

export function clearSessionRecordErrors(): void {
  sessionRecordErrors = [];
}

export function getSkippedPaperWarnings(): string[] {
  return [...sessionSkippedPaperWarnings];
}

export function clearSkippedPaperWarnings(): void {
  sessionSkippedPaperWarnings = [];
}

export function isPaperInS3ASession(openalexId?: string): boolean {
  const clean = extractCleanOpenAlexId(openalexId);
  return clean ? sessionAddedPaperIds.has(clean) : false;
}

/**
 * Single async mutex/queue ensuring snapshot operations never execute concurrently or re-entrantly.
 */
class SnapshotMutex {
  private queue: Promise<any> = Promise.resolve();

  public run<T>(operation: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(() => operation(), () => operation());
    this.queue = next;
    return next;
  }
}
export const snapshotMutex = new SnapshotMutex();

export function isPoisonError(err: any): boolean {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('unreachable') || msg.includes('recursive use') || msg.includes('borrow');
}

export async function handlePoisonedSnapshot(err: any): Promise<void> {
  console.error('[S3A WASM] Snapshot poisoned, rebuilding from last good bytes:', err);
  isSnapshotPoisoned = true;
  lastSnapshotError = String(err?.message || err);

  if (activeSnapshot) {
    try {
      activeSnapshot.free();
    } catch (freeErr) {
      console.warn('[S3A WASM] Error calling free() on poisoned snapshot:', freeErr);
    }
    activeSnapshot = null;
  }

  const session = getDualSessionState();
  const cached = await loadSnapshotFromIdbBySessionId(session.session_id);
  const restoreBytes = (cached && cached.bytes && cached.bytes.length > 0) ? cached.bytes : lastGoodBytes;

  if (restoreBytes && restoreBytes.length > 0) {
    try {
      console.log(`[S3A WASM] Rebuilding snapshot from last good bytes (${restoreBytes.length} bytes)...`);
      activeSnapshot = from_bytes(restoreBytes);
      lastGoodBytes = restoreBytes;
      currentSnapshotBytesLength = restoreBytes.length;
      isSnapshotPoisoned = false;
    } catch (restoreErr) {
      console.error('[S3A WASM] Failed to rebuild from cached bytes, initializing clean session:', restoreErr);
      activeSnapshot = new_session(currentSessionUuidHex);
      isSnapshotPoisoned = false;
    }
  } else {
    console.log('[S3A WASM] Initializing fresh session snapshot...');
    activeSnapshot = new_session(currentSessionUuidHex);
    isSnapshotPoisoned = false;
  }

  await reapplyQueuedStatements();
  notifyStateChange();
  notifyDevPanel();
}

async function reapplyQueuedStatements(): Promise<void> {
  if (!activeSnapshot) return;
  try {
    const queued = await getBufferedStatementsFromDb();
    for (const item of queued) {
      const stmt = item.statement;
      if (stmt.actorType === 'human') {
        const verbId = stmt.verb?.verb_id || S3A_VERBS.NOTE;
        const actorHash = stringToU64Hash(stmt.actor_uuid || 'anonymous');
        const objHash = stringToU64Hash(stmt.object?.id || stmt.object?.name || 'object');
        const aiTraceIndex = typeof stmt.extras?.ai_trace_index === 'number'
          ? stmt.extras.ai_trace_index
          : (typeof stmt.extras?.aiIndex === 'number' ? stmt.extras.aiIndex : null);
        try {
          activeSnapshot.record_human(verbId, actorHash, objHash, aiTraceIndex);
        } catch {}
      } else {
        const agentSlug = stmt.actor?.name || 'claim-checker';
        const confidence = stmt.extras?.confidence ?? 0.95;
        const stepType = S3A_VERBS.AI_ANSWERED;
        const humanIndex = typeof stmt.extras?.humanIndex === 'number' ? stmt.extras.humanIndex : null;
        try {
          activeSnapshot.record_ai(agentSlug, stepType, confidence, humanIndex);
        } catch {}
      }
    }
  } catch (e) {
    console.warn('[S3A WASM] Error reapplying queued statements:', e);
  }
}

const listeners = new Set<(state: S3ASessionState) => void>();

function notifyStateChange() {
  const state = getS3ASessionState();
  listeners.forEach(fn => {
    try { fn(state); } catch (e) { console.error('S3A listener error:', e); }
  });
}

export function subscribeS3AState(fn: (state: S3ASessionState) => void): () => void {
  listeners.add(fn);
  fn(getS3ASessionState());
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Returns session state without invoking snapshot methods during React renders.
 */
export function getS3ASessionState(): S3ASessionState {
  return {
    isInitialized: activeSnapshot !== null,
    sessionUuidHex: currentSessionUuidHex,
    dashedUuid: hexToDashedUuid(currentSessionUuidHex),
    humanStepsCount: humanSteps.length,
    aiStepsCount: aiSteps.length,
    papersCount,
    bytesLength: currentSnapshotBytesLength,
    lastPreflightStatus,
    humanSteps: [...humanSteps],
    aiSteps: [...aiSteps],
    isOfflineCopy,
    dataSource,
    bufferedQueueCount: cachedBufferQueueCount,
    lastFlushError,
    lastFlushAt: lastFlushTimestamp
  };
}

/**
 * Positive 32-bit FNV-1a hash of any string for actor and object hashes
 */
export function stringToU64Hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0);
}

/**
 * Generates a clean 32-character hexadecimal UUID v4 for the S3A WASM snapshot.
 */
export function generateUuidV4Hex(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '').toLowerCase();
  }
  return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Initializes the WASM module once with the new init style.
 */
export async function initS3AWasm(): Promise<void> {
  if (wasmInitPromise) return wasmInitPromise;

  wasmInitPromise = (async () => {
    try {
      await init();
      console.log(`[S3A WASM] Initialized WebAssembly runtime (${S3A_ENGINE_VERSION}) successfully.`);
    } catch (err) {
      console.error('[S3A WASM] Failed to initialize WASM engine:', err);
      throw err;
    }
  })();

  return wasmInitPromise;
}

const BUFFER_STORE = 'buffer_store';

// IndexedDB persistence helpers for offline cache and statement buffering
function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB unavailable'));
    }
    const req = indexedDB.open(IDB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
      if (!db.objectStoreNames.contains('credentials_store')) {
        db.createObjectStore('credentials_store');
      }
      if (!db.objectStoreNames.contains('outbox_store')) {
        db.createObjectStore('outbox_store', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('rejected_store')) {
        db.createObjectStore('rejected_store', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains(BUFFER_STORE)) {
        db.createObjectStore(BUFFER_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistSnapshotToIdb(bytes: Uint8Array, uuidHex: string): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    store.put(bytes, IDB_KEY);
    store.put(uuidHex, IDB_UUID_KEY);
    store.put({ humanSteps, aiSteps, papersCount, isOfflineCopy, dataSource, totalStatementsCount, unmappedVerbsCount, recent5Statements, verbResolutionLog }, 'metadata');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[S3A WASM] Failed to persist offline cache to IndexedDB:', e);
  }
}

export async function saveSnapshotToIdbBySessionId(
  sessionId: string,
  bytes: Uint8Array,
  meta?: any
): Promise<void> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    // 3. Save export_bytes() to IndexedDB under the session ID
    store.put(bytes, sessionId);
    store.put(bytes, sessionId.replace(/-/g, '').toLowerCase());
    store.put(bytes, IDB_KEY);
    store.put(sessionId, IDB_UUID_KEY);
    store.put(sessionId, 'active_session_id');
    const mergedMeta = {
      ...(meta || {}),
      sessionId,
      totalStatementsCount,
      unmappedVerbsCount,
      recent5Statements,
      verbResolutionLog,
      savedAt: new Date().toISOString()
    };
    store.put(mergedMeta, `meta_${sessionId}`);
    store.put(mergedMeta, 'metadata');
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('[S3A WASM] Failed to save snapshot under session ID to IndexedDB:', e);
  }
}

export async function loadSnapshotFromIdbBySessionId(
  sessionId: string
): Promise<{ bytes: Uint8Array; meta?: any } | null> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);

    const hexKey = sessionId.replace(/-/g, '').toLowerCase();
    const getSessionBytesReq = store.get(sessionId);
    const getHexBytesReq = store.get(hexKey);
    const getFallbackBytesReq = store.get(IDB_KEY);
    const getMetaReq = store.get(`meta_${sessionId}`);
    const getFallbackMetaReq = store.get('metadata');

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        const bytes = (getSessionBytesReq.result || getHexBytesReq.result || getFallbackBytesReq.result) as Uint8Array | undefined;
        const meta = getMetaReq.result || getFallbackMetaReq.result;
        if (bytes && bytes.length > 0) {
          resolve({ bytes, meta });
        } else {
          resolve(null);
        }
      };
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function loadSnapshotFromIdb(): Promise<{ bytes: Uint8Array; uuidHex: string; meta?: any } | null> {
  try {
    const db = await openIdb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const store = tx.objectStore(IDB_STORE);

    const getBytesReq = store.get(IDB_KEY);
    const getUuidReq = store.get(IDB_UUID_KEY);
    const getMetaReq = store.get('metadata');

    return new Promise((resolve) => {
      tx.oncomplete = () => {
        const bytes = getBytesReq.result as Uint8Array | undefined;
        const uuidHex = getUuidReq.result as string | undefined;
        const meta = getMetaReq.result;
        if (bytes && uuidHex) {
          resolve({ bytes, uuidHex, meta });
        } else {
          resolve(null);
        }
      };
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Rebuild the session timeline from the authoritative S3A LRS server.
 * Uses the in-browser WASM cache only when offline (and labels it "offline copy").
 */
export async function rebuildTimelineFromServer(sessionUuidHex: string): Promise<boolean> {
  const dashed = hexToDashedUuid(sessionUuidHex);
  try {
    const statements = await getStatements({ registration: dashed });
    if (!statements || statements.length === 0) {
      // Empty session on server: valid, empty timeline
      dataSource = 'server';
      isOfflineCopy = false;
      return true;
    }

    // Sort ascending by timestamp
    statements.sort((a, b) => new Date(a.timestamp || 0).getTime() - new Date(b.timestamp || 0).getTime());

    const rebuiltHuman: S3AHumanStepLog[] = [];
    const rebuiltAi: S3AAiStepLog[] = [];
    const syncState = getLrsSyncState();

    statements.forEach((stmt) => {
      const isAi = stmt.actor?.account?.homePage?.includes('/agents');
      const stmtId = stmt.id;

      if (!isAi) {
        // Human action statement
        let verbId = 1;
        try {
          const resolved = verb_id_for_iri(stmt.verb?.id);
          if (resolved !== undefined) verbId = resolved;
        } catch {
          // fallback
        }

        const verbName = stmt.verb?.display?.['en-US'] || 'Human Action';
        const actor = stmt.actor?.name || stmt.actor?.account?.name || 'Researcher';
        const objectDesc = stmt.object?.definition?.name?.['en-US'] || stmt.object?.id || 'Paper';
        const objectId = stmt.object?.id;
        const stepIndex = rebuiltHuman.length;

        rebuiltHuman.push({
          stepIndex,
          verbId,
          verbName,
          actor,
          objectDesc,
          objectId,
          aiTraceIndex: null,
          timestamp: stmt.timestamp || new Date().toISOString(),
          statementId: stmtId
        });
      } else {
        // AI step statement
        const agentSlug = stmt.actor?.name || stmt.actor?.account?.name || 'claim-checker';
        const humanStmtRef = stmt.context?.statement?.id;
        let humanIndex: number | null = null;
        if (humanStmtRef) {
          const found = rebuiltHuman.findIndex(h => h.statementId === humanStmtRef);
          if (found !== -1) humanIndex = found;
        }

        const confidence = stmt.context?.extensions?.['https://ashecribb.dev/xapi/extensions/confidence'] ?? 0.95;
        const preflight = stmt.context?.extensions?.['https://ashecribb.dev/xapi/extensions/preflight-result'] || 'ok';
        const isBlocked = syncState.blockedSteps[stmtId] !== undefined;

        rebuiltAi.push({
          stepIndex: rebuiltAi.length,
          agentSlug,
          stepType: 1,
          confidence,
          humanIndex,
          humanStatementId: humanStmtRef,
          preflightResult: preflight,
          requiresGate: false,
          isGateApproved: true,
          timestamp: stmt.timestamp || new Date().toISOString(),
          statementId: stmtId,
          blockedByPolicy: isBlocked
        });
      }
    });

    humanSteps = rebuiltHuman;
    aiSteps = rebuiltAi;
    dataSource = 'server';
    isOfflineCopy = false;

    // Synchronize local WASM session snapshot from reconstructed state
    await snapshotMutex.run(async () => {
      const cleanSnapshot = new_session(sessionUuidHex);
      for (const h of humanSteps) {
        try {
          cleanSnapshot.record_human(h.verbId, stringToU64Hash(h.actor), stringToU64Hash(h.objectDesc), null);
        } catch {}
      }
      for (const a of aiSteps) {
        try {
          cleanSnapshot.record_ai(a.agentSlug, a.stepType, a.confidence, a.humanIndex);
        } catch {}
      }
      if (activeSnapshot) {
        try { activeSnapshot.free(); } catch {}
      }
      activeSnapshot = cleanSnapshot;

      // Cache to IDB as offline backup
      try {
        const bytes = cleanSnapshot.export_bytes();
        if (bytes && bytes.length > 0) {
          currentSnapshotBytesLength = bytes.length;
          lastGoodBytes = bytes;
          await persistSnapshotToIdb(bytes, sessionUuidHex);
        }
      } catch (e: any) {
        console.warn('[S3A Read Path] Failed to export clean snapshot bytes:', e);
        lastSnapshotError = String(e?.message || e);
        if (isPoisonError(e)) {
          await handlePoisonedSnapshot(e);
        }
      }
    });

    console.log(`[S3A Read Path] Rebuilt timeline from S3A LRS server: ${humanSteps.length} human steps, ${aiSteps.length} AI steps.`);
    notifyStateChange();
    notifyDevPanel();
    return true;
  } catch (err: any) {
    console.warn('[S3A Read Path] LRS server unavailable on session open; falling back to offline WASM cache:', err?.message || err);
    dataSource = 'offline_cache';
    isOfflineCopy = true;
    notifyStateChange();
    return false;
  }
}

async function _doInitializeS3ASession(forceNew = false): Promise<WasmAgentSnapshot> {
  await initS3AWasm();
  await initializeOutboxSync();

  const session = getDualSessionState();
  currentSessionUuidHex = session.session_id.replace(/-/g, '').toLowerCase();

  // Listen to blocked steps from outbox
  subscribeLrsSync((sync) => {
    let hasChanges = false;
    aiSteps.forEach((step) => {
      if (sync.blockedSteps[step.statementId] || sync.blockedSteps[`step-${step.stepIndex}`]) {
        if (!step.blockedByPolicy) {
          step.blockedByPolicy = true;
          hasChanges = true;
        }
      }
    });
    if (hasChanges) notifyStateChange();
  });

  if (!forceNew) {
    const cached = await loadSnapshotFromIdbBySessionId(session.session_id);
    if (cached && cached.bytes) {
      try {
        console.log(`[S3A WASM] Restoring session snapshot via from_bytes() for session ID: ${session.session_id}`);
        activeSnapshot = from_bytes(cached.bytes);
        isRestoredFromBytes = true;
        currentSnapshotBytesLength = cached.bytes.length;
        lastGoodBytes = cached.bytes;
        isSnapshotPoisoned = false;
        lastSnapshotError = null;

        const [storedState, isLoggingActive, storedStudyId] = await Promise.all([
          getStoredConsentState(),
          getResearchLoggingConsent(),
          getParticipantStudyId()
        ]);

        let engineConsent: 'none' | 'granted' | 'withdrawn' = 'none';
        try {
          if (typeof activeSnapshot.consent_state === 'function') {
            engineConsent = activeSnapshot.consent_state() as 'none' | 'granted' | 'withdrawn';
          }
        } catch {}

        const metaConsent = cached.meta?.consentState;
        const resolvedConsent: 'none' | 'granted' | 'withdrawn' =
          storedState !== 'none'
            ? storedState
            : (engineConsent !== 'none' ? engineConsent : (metaConsent || 'none'));
        const isConsentGranted = resolvedConsent === 'granted' && isLoggingActive;

        (activeSnapshot as any)._consentState = resolvedConsent;
        (activeSnapshot as any)._recordingActive = isConsentGranted;
        (activeSnapshot as any)._studyId = cached.meta?.studyId || storedStudyId || '';

        if (cached.meta) {
          papersCount = cached.meta.papersCount || papersCount;
        }

        if (isConsentGranted && cached.meta) {
          if (typeof cached.meta.totalStatementsCount === 'number') {
            totalStatementsCount = cached.meta.totalStatementsCount;
          }
          if (typeof cached.meta.unmappedVerbsCount === 'number') {
            unmappedVerbsCount = 0;
          }
          if (Array.isArray(cached.meta.recent5Statements)) {
            recent5Statements = cached.meta.recent5Statements;
          }
          if (cached.meta.lastFlushTime) {
            lastFlushTimestamp = cached.meta.lastFlushTime;
          }
          if (Array.isArray(cached.meta.verbResolutionLog)) {
            verbResolutionLog = cached.meta.verbResolutionLog;
          }
          humanSteps = cached.meta.humanSteps || humanSteps;
          aiSteps = cached.meta.aiSteps || aiSteps;
        } else {
          // Drop any persisted or queued xAPI/tracing statements when consent is not granted
          const droppedCount = cached.meta?.totalStatementsCount || 0;
          totalStatementsCount = 0;
          unmappedVerbsCount = 0;
          recent5Statements = [];
          verbResolutionLog = [];
          humanSteps = [];
          aiSteps = [];
          cachedBufferQueueCount = 0;
          await clearTracingQueuesFromDb();
          if (droppedCount > 0 || (cached.meta?.humanSteps?.length || 0) > 0 || (cached.meta?.aiSteps?.length || 0) > 0) {
            await saveSnapshotToIdbBySessionId(session.session_id, cached.bytes, {
              totalStatementsCount: 0,
              unmappedVerbsCount: 0,
              recent5Statements: [],
              lastFlushTime: null,
              verbResolutionLog: [],
              humanSteps: [],
              aiSteps: [],
              papersCount,
              consentState: resolvedConsent,
              recordingActive: false,
              studyId: (activeSnapshot as any)._studyId || ''
            });
          }
        }

        console.log(`[S3A WASM] Successfully restored snapshot with ${totalStatementsCount} statements persisted. Consent: ${(activeSnapshot as any)._consentState}`);
        notifyStateChange();
        notifyDevPanel();
        return activeSnapshot;
      } catch (err) {
        console.warn('[S3A WASM] Corrupt or outdated cached snapshot:', err);
      }
    }
  }

  // Create clean new session if none found
  currentSessionUuidHex = session.session_id.replace(/-/g, '').toLowerCase();
  humanSteps = [];
  aiSteps = [];
  papersCount = 0;
  sessionAddedPaperIds.clear();
  sessionRecordErrors = [];
  sessionSkippedPaperWarnings = [];
  lastPreflightStatus = 'ok';
  isOfflineCopy = false;
  dataSource = 'server';
  unmappedVerbsCount = 0;

  activeSnapshot = new_session(currentSessionUuidHex);
  const [initialConsentState, initialLoggingActive, initialStudyId] = await Promise.all([
    getStoredConsentState(),
    getResearchLoggingConsent(),
    getParticipantStudyId()
  ]);
  (activeSnapshot as any)._consentState = initialConsentState;
  (activeSnapshot as any)._recordingActive = initialLoggingActive && initialConsentState === 'granted';
  (activeSnapshot as any)._studyId = initialStudyId || '';

  isRestoredFromBytes = false;
  isSnapshotPoisoned = false;
  lastSnapshotError = null;
  currentSnapshotBytesLength = 0;
  console.log(`[S3A WASM] Created new session ${currentSessionUuidHex} for ${session.session_id}`);

  notifyStateChange();
  notifyDevPanel();

  return activeSnapshot;
}

/**
 * Initializes or restores an S3A session.
 * Guaranteed to run only once (guarded by module-level promise and mutex).
 */
export async function initializeS3ASession(forceNew = false): Promise<WasmAgentSnapshot> {
  if (activeSnapshot && !forceNew) {
    return activeSnapshot;
  }
  if (sessionInitPromise && !forceNew) {
    return sessionInitPromise;
  }

  sessionInitPromise = snapshotMutex.run(async () => {
    return _doInitializeS3ASession(forceNew);
  });

  return sessionInitPromise;
}

/**
 * Ensure active snapshot is ready (public API)
 */
export async function getActiveSnapshot(): Promise<WasmAgentSnapshot> {
  if (activeSnapshot) return activeSnapshot;
  return initializeS3ASession();
}

/**
 * Internal helper to ensure active snapshot without re-entering the outer mutex
 */
export async function _ensureActiveSnapshotInternal(): Promise<WasmAgentSnapshot> {
  if (activeSnapshot) return activeSnapshot;
  return _doInitializeS3ASession(false);
}

/**
 * Log a human action (view paper, approve/reject claim, note, request review).
 * 1. Generates client-side UUID v4 statement ID.
 * 2. Records in WASM session snapshot (offline cache).
 * 3. Builds xAPI 1.0.3 statement with category profile IRI, dashed registration UUID, and account actor.
 * 4. Appends to IndexedDB outbox store and triggers flush.
 */
export async function logHumanAction(
  verbId: number,
  actor: string,
  objectDesc: string,
  aiTraceIndex: number | null = null,
  objectId?: string
): Promise<number> {
  const consented = await getResearchLoggingConsent();
  if (!consented) {
    return 0;
  }

  const actorHash = stringToU64Hash(actor);
  const objectHash = stringToU64Hash(objectDesc);
  const statementId = generateStatementUuid();
  const stepIndex = humanSteps.length;

  let verbName = 'Action';
  if (verbId === S3A_VERBS.VIEW_PAPER) verbName = 'View Paper';
  else if (verbId === S3A_VERBS.APPROVE_CLAIM) verbName = 'Approve Claim';
  else if (verbId === S3A_VERBS.REJECT_CLAIM) verbName = 'Reject Claim';
  else if (verbId === S3A_VERBS.NOTE) verbName = 'Add Note';
  else if (verbId === S3A_VERBS.REQUEST_REVIEW) verbName = 'Request Review';
  else if (verbId === S3A_VERBS.FLAG_HALLUCINATION) verbName = 'Flag Hallucination';
  else if (WASM_SUPPORTED_VERBS[verbId]) verbName = WASM_SUPPORTED_VERBS[verbId].name;

  // 1. Record via Mutex Queue - NO export_bytes inside record call
  await snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      snapshot.record_human(verbId, actorHash, objectHash, aiTraceIndex);
    } catch (err: any) {
      console.error('[S3A WASM] record_human error:', err);
      if (isPoisonError(err)) {
        await handlePoisonedSnapshot(err);
      } else {
        throw err;
      }
    }
  });

  const user = authService.getUser();
  const researcherId = user?.userId || user?.id || 'researcher-local';
  const resolvedActorName = actor || user?.displayName || user?.name || 'Scholar Researcher';

  // OpenAlex Activity ID for papers; custom claim Activity ID otherwise
  const resolvedObjectId = objectId || (
    verbId === S3A_VERBS.VIEW_PAPER 
      ? `https://openalex.org/W${stringToU64Hash(objectDesc)}`
      : `https://ashecribb.dev/xapi/activities/claim/${stringToU64Hash(objectDesc)}`
  );

  const humanLog: S3AHumanStepLog = {
    stepIndex,
    verbId,
    verbName,
    actor: resolvedActorName,
    objectDesc,
    objectId: resolvedObjectId,
    aiTraceIndex,
    timestamp: new Date().toISOString(),
    statementId
  };
  humanSteps.push(humanLog);

  // 2. Build xAPI 1.0.3 statement
  const xapiStatement = buildHumanStatement({
    statementId,
    sessionUuidHex: currentSessionUuidHex,
    verbId,
    verbName,
    researcherId,
    researcherName: resolvedActorName,
    object: {
      id: resolvedObjectId,
      name: objectDesc,
      type: verbId === S3A_VERBS.VIEW_PAPER ? 'http://activitystrea.ms/schema/1.0/article' : 'https://ashecribb.dev/xapi/activity-types/empirical-claim'
    },
    stepIndex
  });

  notifyStateChange();

  // 3. Append to IndexedDB outbox & trigger flush
  await queueAndFlushStatement(xapiStatement, currentSessionUuidHex);

  return stepIndex;
}

/**
 * Assert that an agent is allowed to execute a given verb / tool.
 * Throws if agent is denied or unauthorized with 'blocked by policy'.
 */
export async function assertAgentAllows(
  agentSlug: string,
  verbId: number | null = null,
  toolBit: number | null = null
): Promise<void> {
  return snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      snapshot.assert_agent_allows(agentSlug, verbId, toolBit);
    } catch (err: any) {
      const errorMsg = typeof err === 'string' ? err : (err?.message || 'Agent action not allowed');
      throw new Error(`blocked by policy: ${errorMsg}`);
    }
  });
}

/**
 * Check if the agent requires a human supervisory gate approval before output is final.
 */
export async function checkRequiresHumanGate(agentSlug: string): Promise<boolean> {
  return snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      return snapshot.requires_human_gate(agentSlug);
    } catch {
      return false;
    }
  });
}

/**
 * Run epistemic preflight evaluation.
 */
export async function evaluatePreflight(
  confidence: number,
  conceptId: number | null = null,
  hasApprovedAnalogy: boolean | null = null
): Promise<{ passed: boolean; message: string }> {
  return snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    const res = snapshot.preflight(confidence, conceptId, hasApprovedAnalogy);
    lastPreflightStatus = res;
    const passed = res === 'ok' && confidence >= 0.70;
    return { passed, message: res };
  });
}

/**
 * Log an AI agent step (Gemini answer, claim check, synthesis).
 * 1. Checks agent permissions (assertAgentAllows).
 * 2. Checks preflight & gating.
 * 3. Generates UUID v4 statement ID.
 * 4. Links human's statement ID in context.statement when AI acts on a human step.
 * 5. Appends to IndexedDB outbox & flushes.
 */
export async function logAiAction(
  agentSlug: string,
  stepType: number,
  confidence: number,
  humanIndex: number | null = null,
  isGateApproved = false,
  toolBit: number | null = null
): Promise<{
  aiIndex: number;
  statementId: string;
  preflightPassed: boolean;
  preflightMessage: string;
  requiresGate: boolean;
  isGateApproved: boolean;
}> {
  const consented = await getResearchLoggingConsent();
  if (!consented) {
    return {
      aiIndex: 0,
      statementId: '',
      preflightPassed: true,
      preflightMessage: 'ok',
      requiresGate: false,
      isGateApproved: true
    };
  }

  // 1. Assert agent permissions first
  await assertAgentAllows(agentSlug, null, toolBit);

  // 2. Check if human gate is required
  const requiresGate = await checkRequiresHumanGate(agentSlug);

  // 3. Preflight check
  const preflightRes = await evaluatePreflight(confidence, null, null);
  const preflight = preflightRes.message;
  const preflightPassed = preflightRes.passed;

  // 4. Generate client statement ID
  const statementId = generateStatementUuid();
  const effectiveStepType = S3A_VERBS.AI_ANSWERED;

  // 5. Record step in WASM via Mutex - NO export_bytes inside record call
  let aiIndex = 0;
  await snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      aiIndex = snapshot.record_ai(agentSlug, effectiveStepType, confidence, humanIndex);
    } catch (err: any) {
      console.error('[S3A WASM] record_ai error:', err);
      if (isPoisonError(err)) {
        await handlePoisonedSnapshot(err);
      } else {
        throw err;
      }
    }
  });

  // Find linked human statement ID
  let humanStatementId: string | null = null;
  if (humanIndex !== null && humanIndex >= 0 && humanIndex < humanSteps.length) {
    humanStatementId = humanSteps[humanIndex].statementId;
  }

  const aiLog: S3AAiStepLog = {
    stepIndex: aiIndex,
    agentSlug,
    stepType: effectiveStepType,
    confidence,
    humanIndex,
    humanStatementId,
    preflightResult: preflight,
    requiresGate,
    isGateApproved,
    timestamp: new Date().toISOString(),
    statementId
  };
  aiSteps.push(aiLog);

  // 6. Build xAPI AI Statement (uses ai-answered only)
  const xapiStatement = buildAiStatement({
    statementId,
    sessionUuidHex: currentSessionUuidHex,
    agentSlug,
    verbId: S3A_VERBS.AI_ANSWERED,
    verbName: 'ai-answered',
    object: {
      id: `https://ashecribb.dev/xapi/activities/inference/${statementId}`,
      name: `AI Inference by ${agentSlug}`,
      type: 'https://ashecribb.dev/xapi/activity-types/ai-inference'
    },
    humanStatementId,
    stepIndex: aiIndex,
    confidence,
    preflightResult: preflight
  });

  notifyStateChange();

  // 7. Queue in Outbox & flush
  await queueAndFlushStatement(xapiStatement, currentSessionUuidHex);

  return {
    aiIndex,
    statementId,
    preflightPassed,
    preflightMessage: preflight,
    requiresGate,
    isGateApproved
  };
}

/**
 * Adds OpenAlex paper metadata into the S3A snapshot once when selected.
 * - Never invents 'W0', '10.0000/unknown', or year 2024.
 * - Skips papers without a valid OpenAlex ID and records a user-visible warning.
 * - Remembers which OpenAlex IDs are already in the session to prevent duplicates.
 * - Surfaces any add_paper failure as a visible error and records it in sessionRecordErrors.
 */
export async function addOpenAlexPaper(
  openalexId: string | undefined,
  doi: string | undefined,
  year: number | undefined,
  citedByCount: number = 0,
  title?: string
): Promise<{ added: boolean; skipped?: boolean; duplicate?: boolean; warning?: string; index?: number }> {
  const cleanId = extractCleanOpenAlexId(openalexId);
  if (!cleanId) {
    const label = title ? `"${title}"` : (doi || 'Untitled paper');
    const warning = `Skipped ${label}: no OpenAlex ID (not added to S3A session).`;
    if (!sessionSkippedPaperWarnings.includes(warning)) {
      sessionSkippedPaperWarnings.push(warning);
    }
    return { added: false, skipped: true, warning };
  }

  if (sessionAddedPaperIds.has(cleanId)) {
    return { added: false, duplicate: true };
  }

  const cleanDoi = doi ? doi.replace(/^https?:\/\/doi\.org\//i, '').trim() : '';
  const safeYear = (typeof year === 'number' && Number.isFinite(year) && year > 0) ? Math.floor(year) : 0;
  const safeCitations = (typeof citedByCount === 'number' && Number.isFinite(citedByCount) && citedByCount >= 0)
    ? Math.floor(citedByCount)
    : 0;

  let idx = 0;
  await snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      idx = snapshot.add_paper(cleanId, cleanDoi, safeYear, safeCitations, 0);
    } catch (err: any) {
      const errMsg = `Failed to record paper "${title || cleanId}" (${cleanId}) via add_paper: ${err?.message || err}`;
      if (!sessionRecordErrors.includes(errMsg)) {
        sessionRecordErrors.push(errMsg);
      }
      if (isPoisonError(err)) {
        await handlePoisonedSnapshot(err);
      }
      throw new Error(errMsg);
    }
  });

  sessionAddedPaperIds.add(cleanId);
  papersCount = sessionAddedPaperIds.size;
  notifyStateChange();
  return { added: true, index: idx };
}

/**
 * Records an empirical claim in the S3A snapshot via add_claim.
 * Surfaces any failure as a visible error and records it in sessionRecordErrors.
 *
 * `kind` and `embedding` match the wasm signature `add_claim(agent_slug, text, confidence, kind?, embedding?)`
 * (types/s3a_wasm.d.ts). `kind` defaults to the pack's empirical-claim kind when null.
 * (Previously the 4th/5th args were an evidence paper index and a human step index, which the
 * wasm API has no slot for, so the call did not type-check and would have thrown at runtime.)
 */
export async function addS3AClaim(
  agentOrAuthor: string,
  claimText: string,
  confidence: number = 1.0,
  kind: number | null = null,
  embedding: Float32Array | null = null
): Promise<number> {
  let claimIdx = 0;
  await snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    try {
      claimIdx = snapshot.add_claim(agentOrAuthor, claimText, confidence, kind, embedding);
    } catch (err: any) {
      const errMsg = `Failed to record claim "${claimText.slice(0, 60)}" via add_claim: ${err?.message || err}`;
      if (!sessionRecordErrors.includes(errMsg)) {
        sessionRecordErrors.push(errMsg);
      }
      if (isPoisonError(err)) {
        await handlePoisonedSnapshot(err);
      }
      throw new Error(errMsg);
    }
  });
  notifyStateChange();
  return claimIdx;
}

/**
 * Downloads the S3A snapshot bytes as an offline backup:
 * <session_uuid>.snapshot.s3a
 * Labeled "Export backup" in the menu.
 */
export async function downloadS3ASnapshotFile(): Promise<void> {
  await exportS3ASession({
    projectOrSessionName: currentSessionUuidHex || 'backup'
  });
}

/**
 * Runs a demo mode that executes:
 * 1. One human approval (approved claim)
 * 2. One AI claim check (assert_agent_allows, preflight check, human gate, record_ai linked to human step)
 * 3. Then triggers export backup
 */
export async function runS3ADemoMode(
  onStatusUpdate?: (msg: string) => void
): Promise<{ humanIndex: number; aiIndex: number; fileName: string }> {
  onStatusUpdate?.('Initializing S3A LRS Session & Epistemic Registry...');
  await getActiveSnapshot();

  // Step 1: Human action - Approve Claim
  onStatusUpdate?.('Logging human action: Researcher approves empirical claim #101...');
  const humanIndex = await logHumanAction(
    S3A_VERBS.APPROVE_CLAIM,
    'Researcher (Lead Evaluator)',
    'Claim: Neural attention maps mirror syntactic dependency parse trees',
    null
  );

  // Step 2: AI Claim Check with agent 'claim-checker' (AI steps use ai-answered only)
  onStatusUpdate?.('Authorizing agent [claim-checker] via assert_agent_allows...');
  await assertAgentAllows(S3A_AGENTS.CLAIM_CHECKER, S3A_VERBS.AI_ANSWERED, ScholarTool.TOOL_EXTRACT_CLAIMS);

  const requiresGate = await checkRequiresHumanGate(S3A_AGENTS.CLAIM_CHECKER);
  onStatusUpdate?.(`Agent [claim-checker] requires supervisory gate: ${requiresGate ? 'YES' : 'NO'}`);

  onStatusUpdate?.('Evaluating epistemic confidence preflight...');
  const confidence = 0.94;
  const preflight = await evaluatePreflight(confidence);

  if (!preflight.passed) {
    throw new Error(`Preflight rejected: ${preflight.message}`);
  }

  onStatusUpdate?.('Recording AI claim check trace linked to Human Approval step #' + humanIndex + '...');
  const { aiIndex } = await logAiAction(
    S3A_AGENTS.CLAIM_CHECKER,
    1,
    confidence,
    humanIndex,
    true
  );

  // Step 3: Export backup
  const fileName = `${currentSessionUuidHex}.backup.s3a`;
  let snapLen = 0;
  try {
    const bytes = await snapshotMutex.run(async () => {
      const snapshot = await _ensureActiveSnapshotInternal();
      return snapshot.export_bytes();
    });
    snapLen = bytes.length;
  } catch (err: any) {
    lastSnapshotError = String(err?.message || err);
    console.error('[S3A Demo] export_bytes error:', err);
    notifyDevPanel();
  }

  onStatusUpdate?.(`Persisted snapshot (${snapLen} bytes). Downloading backup ${fileName}...`);
  await downloadS3ASnapshotFile();

  onStatusUpdate?.(`Demo complete! Exported backup to ${fileName}`);
  return { humanIndex, aiIndex, fileName };
}

// -------------------------------------------------------------
// S3A Dual Session (Human actor_uuid + AI assistant agent_uuid)
// -------------------------------------------------------------

export interface S3ADualSession {
  actor_uuid: string; // UUIDv7
  agent_uuid: string; // UUIDv7
  session_id: string; // UUIDv7
}

let activeDualSession: S3ADualSession | null = null;

export function getDualSessionState(): S3ADualSession {
  if (activeDualSession) return activeDualSession;

  const user = authService.getUser();
  if (user && user.actor_uuid && user.agent_uuid && user.sessionId) {
    activeDualSession = {
      actor_uuid: user.actor_uuid,
      agent_uuid: user.agent_uuid,
      session_id: user.sessionId
    };
    currentSessionUuidHex = user.sessionId.replace(/-/g, '').toLowerCase();
    return activeDualSession;
  }

  // Restore existing session from localStorage to ensure stability across page refreshes
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('s3a_dual_session');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.session_id && parsed.actor_uuid && parsed.agent_uuid) {
          activeDualSession = parsed;
          currentSessionUuidHex = parsed.session_id.replace(/-/g, '').toLowerCase();
          return activeDualSession;
        }
      }
    } catch {}
  }

  const actor_uuid = user?.actor_uuid || generateUuidV7();
  const agent_uuid = user?.agent_uuid || generateUuidV7();
  const session_id = user?.sessionId || generateUuidV7();

  activeDualSession = { actor_uuid, agent_uuid, session_id };
  currentSessionUuidHex = session_id.replace(/-/g, '').toLowerCase();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('s3a_dual_session', JSON.stringify(activeDualSession));
    } catch {}
  }
  return activeDualSession;
}

export function resetDualSession(userSession?: { actor_uuid?: string; agent_uuid?: string; sessionId?: string }): S3ADualSession {
  const actor_uuid = userSession?.actor_uuid || generateUuidV7();
  const agent_uuid = userSession?.agent_uuid || generateUuidV7();
  const session_id = userSession?.sessionId || generateUuidV7();

  activeDualSession = { actor_uuid, agent_uuid, session_id };
  currentSessionUuidHex = session_id.replace(/-/g, '').toLowerCase();

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('s3a_dual_session', JSON.stringify(activeDualSession));
    } catch {}
  }

  try {
    activeSnapshot = new_session(currentSessionUuidHex);
    sessionAddedPaperIds.clear();
    sessionRecordErrors = [];
    sessionSkippedPaperWarnings = [];
    papersCount = 0;
    console.log(`[S3A WASM] Reset session for actor:${actor_uuid} agent:${agent_uuid}`);
  } catch (e) {
    console.warn('[S3A WASM] Session reset warning:', e);
  }

  notifyStateChange();
  notifyDevPanel();
  return activeDualSession;
}

// -------------------------------------------------------------
// S3A Buffer (Queue in IndexedDB) & Dev Tracking
// -------------------------------------------------------------

// In-memory dev tracking & recent statements
let lastFlushTimestamp: string | null = null;
let isFlushingBuffer = false;
let consentDeclinedMarkerSent = false;

function logVerbResolution(entry: VerbResolutionLogEntry) {
  verbResolutionLog.push(entry);
  if (verbResolutionLog.length > 50) {
    verbResolutionLog.shift();
  }
}

// Helpers for buffer in IDB
async function enqueueBufferStatement(statement: S3AStatement): Promise<number> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BUFFER_STORE, 'readwrite');
    const store = tx.objectStore(BUFFER_STORE);
    const req = store.add({
      statement,
      enqueuedAt: new Date().toISOString()
    });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function getBufferQueueCount(): Promise<number> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(BUFFER_STORE, 'readonly');
      const store = tx.objectStore(BUFFER_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

async function getBufferedStatementsFromDb(): Promise<QueuedBufferItem[]> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(BUFFER_STORE, 'readonly');
      const store = tx.objectStore(BUFFER_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

async function removeBufferedStatementsFromDb(ids: number[]): Promise<void> {
  if (!ids.length) return;
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(BUFFER_STORE, 'readwrite');
    const store = tx.objectStore(BUFFER_STORE);
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearTracingQueuesFromDb(): Promise<void> {
  try {
    const db = await openIdb();
    await new Promise<void>((resolve) => {
      const storeNames: string[] = [];
      if (db.objectStoreNames.contains(BUFFER_STORE)) storeNames.push(BUFFER_STORE);
      if (db.objectStoreNames.contains('outbox_store')) storeNames.push('outbox_store');
      if (storeNames.length === 0) return resolve();
      const tx = db.transaction(storeNames, 'readwrite');
      storeNames.forEach((name) => {
        try {
          tx.objectStore(name).clear();
        } catch {}
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore IDB unavailable errors
  }
}

function updateRecentStatements(stmt: S3AStatement) {
  recent5Statements.push(stmt);
  if (recent5Statements.length > 10) {
    recent5Statements.shift();
  }
}

// -------------------------------------------------------------
// emitStatement(verb, object, extras)
// -------------------------------------------------------------

export async function emitStatement(
  verb: string,
  object: S3AStatementObject,
  extras?: S3AStatementExtras
): Promise<string> {
  // 1. Consent is optional and never gates features.
  // Without consent, or if recording is inactive, no research-log statements are written for either the human or the AI.
  const consented = await getResearchLoggingConsent();
  const active = await isRecordingActive();
  if (!consented || !active) {
    return '';
  }

  await initS3AWasm();
  const session = getDualSessionState();

  // 2. AI steps use ai-answered only
  const actorType: 'human' | 'agent' = extras?.actor === 'agent' ? 'agent' : 'human';
  let verbToResolve = verb;
  if (actorType === 'agent' || verb === 'answered') {
    verbToResolve = 'ai-answered';
  }

  // 3. Remove fallback mapping: every verb must resolve through verb_id_for_iri
  let rawVerbId: number | undefined;
  try {
    rawVerbId = verb_id_for_iri(verbToResolve);
    if (rawVerbId === undefined && verbToResolve === 'cites') {
      rawVerbId = verb_id_for_iri('http://purl.org/spar/cito/cites');
    }
  } catch {
    rawVerbId = undefined;
  }


  let resolvedVerbId: number;
  let wasMapped: boolean;

  if (rawVerbId !== undefined && rawVerbId >= 1 && rawVerbId <= 23) {
    resolvedVerbId = rawVerbId;
    wasMapped = true;
  } else {
    wasMapped = false;
    unmappedVerbsCount++;
    resolvedVerbId = 1;
  }

  let wasmIri = '';
  try {
    wasmIri = iri_for_verb_id(resolvedVerbId) || '';
  } catch {}
  if (!wasmIri) {
    wasmIri = WASM_SUPPORTED_VERBS[resolvedVerbId]?.iri || `https://ashecribb.dev/xapi/verbs/${verbToResolve}`;
  }
  const wasmVerbName = WASM_SUPPORTED_VERBS[resolvedVerbId]?.name || verbToResolve;

  // Log verb resolution result for dev panel
  logVerbResolution({
    verb,
    initialIri: wasmIri,
    verbId: resolvedVerbId,
    wasmVerbName,
    wasmIri,
    wasMapped,
    originalVerb: verb,
    timestamp: new Date().toISOString()
  });

  const user = authService.getUser();
  const actorName = actorType === 'agent'
    ? (extras?.agentSlug || 'ai-assistant')
    : (user?.displayName || user?.name || 'Human Student');
  const actorId = actorType === 'agent' ? session.agent_uuid : session.actor_uuid;

  const statement: S3AStatement = {
    id: generateUuidV7(),
    timestamp: new Date().toISOString(),
    session_id: session.session_id,
    actor_uuid: session.actor_uuid,
    agent_uuid: session.agent_uuid,
    actorType,
    actor: {
      id: actorId,
      name: actorName,
      type: actorType
    },
    verb: {
      id: wasmIri,
      display: wasmVerbName,
      verb_id: resolvedVerbId
    },
    object,
    extras: {
      ...(extras || {}),
      ...(actorType === 'agent' ? { verb_name: 'ai-answered' } : {})
    }
  };

  // Queue in IndexedDB buffer for WASM snapshot writer
  await enqueueBufferStatement(statement);
  cachedBufferQueueCount = await getBufferQueueCount();
  updateRecentStatements(statement);

  // Queue in Outbox for sync to authoritative S3A LRS on VM
  const dashedReg = hexToDashedUuid(session.session_id.replace(/-/g, '').toLowerCase());
  const xapiStatement = actorType === 'human'
    ? buildHumanStatement({
        statementId: statement.id,
        sessionUuidHex: currentSessionUuidHex || session.session_id.replace(/-/g, '').toLowerCase(),
        verbId: resolvedVerbId,
        verbName: wasmVerbName,
        researcherId: session.actor_uuid,
        researcherName: actorName,
        object: {
          id: object.id,
          name: object.name,
          type: object.type
        },
        extensions: extras
      })
    : buildAiStatement({
        statementId: statement.id,
        sessionUuidHex: currentSessionUuidHex || session.session_id.replace(/-/g, '').toLowerCase(),
        agentSlug: extras?.agentSlug || 'ai-assistant',
        verbId: S3A_VERBS.AI_ANSWERED,
        verbName: 'ai-answered',
        object: {
          id: object.id,
          name: object.name,
          type: object.type
        },
        humanStatementId: extras?.humanStatementId || null,
        confidence: extras?.confidence ?? 0.95,
        preflightResult: 'ok',
        extensions: extras
      });

  await queueAndFlushStatement(xapiStatement, currentSessionUuidHex || session.session_id);

  notifyStateChange();
  notifyDevPanel();

  // Trigger flush to WASM snapshot writer
  triggerBackgroundFlush('emitStatement');

  return statement.id;
}

// -------------------------------------------------------------
// Flush Buffer to WASM Writer
// -------------------------------------------------------------

export function triggerBackgroundFlush(context = 'auto'): void {
  flushBuffer().catch((err: any) => {
    const errMsg = String(err?.message || err || 'Unknown buffer flush error');
    lastFlushError = errMsg;
    lastSnapshotError = errMsg;
    console.error(`[S3A Buffer] Flush failed (${context}); queued statements retained for retry:`, err);
    getBufferQueueCount()
      .then((count) => {
        cachedBufferQueueCount = count;
        notifyStateChange();
        notifyDevPanel();
      })
      .catch((countErr) => {
        console.warn('[S3A Buffer] Could not read buffer queue count after flush failure:', countErr);
      });
  });
}

export async function flushBuffer(): Promise<number> {
  if (isFlushingBuffer) return 0;
  isFlushingBuffer = true;

  return snapshotMutex.run(async () => {
    try {
      const consented = await getResearchLoggingConsent();
      const consentState = await getStoredConsentState();
      if (!consented || consentState !== 'granted') {
        await clearTracingQueuesFromDb();
        cachedBufferQueueCount = 0;
        lastFlushError = null;
        return 0;
      }

      const queuedItems = await getBufferedStatementsFromDb();
      cachedBufferQueueCount = queuedItems.length;
      if (queuedItems.length === 0) {
        lastFlushError = null;
        return 0;
      }

      const snapshot = await _ensureActiveSnapshotInternal();
      const session = getDualSessionState();

      // Apply queued statements to snapshot sequentially
      for (const item of queuedItems) {
        const stmt = item.statement;
        if (stmt.actorType === 'human') {
          const verbId = stmt.verb?.verb_id || S3A_VERBS.NOTE;
          const actorHash = stringToU64Hash(stmt.actor_uuid || 'anonymous');
          const objHash = stringToU64Hash(stmt.object.id || stmt.object.name);

          const aiTraceIndex = typeof stmt.extras?.ai_trace_index === 'number'
            ? stmt.extras.ai_trace_index
            : (typeof stmt.extras?.aiIndex === 'number' ? stmt.extras.aiIndex : null);

          try {
            snapshot.record_human(verbId, actorHash, objHash, aiTraceIndex);
          } catch (e: any) {
            const errMsg = String(e?.message || e);
            lastFlushError = errMsg;
            lastSnapshotError = errMsg;
            console.error('[S3A WASM Writer] record_human error (retaining queued statements for retry):', e);
            if (isPoisonError(e)) {
              await handlePoisonedSnapshot(e);
            }
            notifyStateChange();
            notifyDevPanel();
            throw e;
          }

          // If it's a paper with a valid OpenAlex ID not yet in the session, record in WASM paper catalog
          if (stmt.object.type === 'academic-paper' || stmt.extras?.openalex_id) {
            const openAlexId = extractCleanOpenAlexId(stmt.extras?.openalex_id || stmt.object.id);
            if (openAlexId && !sessionAddedPaperIds.has(openAlexId)) {
              const doi = stmt.extras?.doi ? String(stmt.extras.doi).replace(/^https?:\/\/doi\.org\//i, '').trim() : '';
              const rawYear = Number(stmt.extras?.year);
              const year = (Number.isFinite(rawYear) && rawYear > 0) ? Math.floor(rawYear) : 0;
              const rawCit = Number(stmt.extras?.citations);
              const citations = (Number.isFinite(rawCit) && rawCit >= 0) ? Math.floor(rawCit) : 0;
              try {
                snapshot.add_paper(openAlexId, doi, year, citations, 0);
                sessionAddedPaperIds.add(openAlexId);
                papersCount = sessionAddedPaperIds.size;
              } catch (e: any) {
                const errMsg = `add_paper failed for ${openAlexId}: ${e?.message || e}`;
                if (!sessionRecordErrors.includes(errMsg)) {
                  sessionRecordErrors.push(errMsg);
                }
                if (isPoisonError(e)) {
                  await handlePoisonedSnapshot(e);
                  throw e;
                }
              }
            }
          }
        } else {
          // AI step: AI steps use ai-answered only!
          const agentSlug = stmt.actor.name || 'ai-assistant';
          const confidence = stmt.extras?.confidence ?? 0.95;
          const stepType = S3A_VERBS.AI_ANSWERED;
          const humanIndex = typeof stmt.extras?.humanIndex === 'number' ? stmt.extras.humanIndex : null;
          try {
            snapshot.record_ai(agentSlug, stepType, confidence, humanIndex);
          } catch (e: any) {
            const errMsg = String(e?.message || e);
            lastFlushError = errMsg;
            lastSnapshotError = errMsg;
            console.error('[S3A WASM Writer] record_ai error (retaining queued statements for retry):', e);
            if (isPoisonError(e)) {
              await handlePoisonedSnapshot(e);
            }
            notifyStateChange();
            notifyDevPanel();
            throw e;
          }
        }
      }

      // Call WASM export_bytes directly without platform fallback hiding errors
      let bytes: Uint8Array;
      try {
        bytes = snapshot.export_bytes();
      } catch (err: any) {
        const errMsg = String(err?.message || err);
        lastSnapshotError = errMsg;
        lastFlushError = errMsg;
        console.error('[S3A WASM Writer] export_bytes error during flushBuffer (retaining queued statements for retry):', err);
        if (isPoisonError(err)) {
          await handlePoisonedSnapshot(err);
        }
        notifyStateChange();
        notifyDevPanel();
        throw err;
      }

      const prevLength = currentSnapshotBytesLength;

      // Never log "Flushed" or increment persisted count unless record_* AND export_bytes succeeded AND byte length changed
      if (bytes && bytes.length > 0) {
        const lengthChanged = bytes.length !== prevLength;
        if (lengthChanged) {
          totalStatementsCount += queuedItems.length;
        }
        currentSnapshotBytesLength = bytes.length;
        lastGoodBytes = bytes;
        lastFlushTimestamp = new Date().toISOString();
        lastSnapshotError = null;
        lastFlushError = null;

        if (lengthChanged) {
          console.log(`[S3A WASM Writer] Flushed batch of ${queuedItems.length} statements to WASM. Total persisted: ${totalStatementsCount}. Snapshot size: ${bytes.length} bytes.`);
        } else {
          console.warn(`[S3A WASM Writer] Flush did not change byte length (${prevLength} -> ${bytes.length}). Not incrementing persisted count.`);
        }

        await saveSnapshotToIdbBySessionId(session.session_id, bytes, {
          totalStatementsCount,
          unmappedVerbsCount,
          recent5Statements,
          lastFlushTime: lastFlushTimestamp,
          verbResolutionLog,
          humanSteps,
          aiSteps,
          consentState: (snapshot as any).consent_state ? snapshot.consent_state() : 'none',
          recordingActive: (snapshot as any).recording_active ? snapshot.recording_active() : false,
          studyId: (snapshot as any)._studyId || ''
        });

        const ids = queuedItems.map(q => q.id).filter((id): id is number => id !== undefined);
        await removeBufferedStatementsFromDb(ids);
        cachedBufferQueueCount = await getBufferQueueCount();

        notifyStateChange();
        notifyDevPanel();

        return queuedItems.length;
      }

      return 0;
    } catch (err: any) {
      const errMsg = String(err?.message || err);
      console.error('[S3A WASM Writer] Error during flushBuffer (statements retained in queue for retry):', err);
      lastSnapshotError = errMsg;
      lastFlushError = errMsg;
      cachedBufferQueueCount = await getBufferQueueCount();
      notifyStateChange();
      notifyDevPanel();
      throw err;
    } finally {
      isFlushingBuffer = false;
    }
  });
}

// -------------------------------------------------------------
// Auto-flush Triggers (30s interval + on pagehide/visibilitychange)
// -------------------------------------------------------------

if (typeof window !== 'undefined') {
  // Every 30 seconds
  setInterval(() => {
    triggerBackgroundFlush('interval-30s');
  }, 30000);

  // On pagehide (guard: bun/test stubs may have window without addEventListener)
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pagehide', () => {
      triggerBackgroundFlush('pagehide');
    });
  }

  // On visibilitychange (when user switches tabs or hides page)
  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        triggerBackgroundFlush('visibilitychange');
      }
    });
  }
}

/// -------------------------------------------------------------
// Export "Download my data (.s3a)"
// -------------------------------------------------------------
// S3A Export & Import API
// -------------------------------------------------------------

export interface S3AExportOptions {
  projectOrSessionName?: string;
}

/**
 * Exports the active S3A session snapshot as real binary bytes (.s3a).
 * 
 * 1. Does NOT invent values or add duplicate papers/queries during export.
 *    Papers are added once when selected by the user.
 * 2. If any add_paper or add_claim call failed during the session, throws a visible error
 *    listing what failed and does not download.
 * 3. Produces real S3A bytes: const bytes = session.export_bytes();
 * 4. Before downloading, checks the export: from_bytes(bytes) must load without throwing;
 *    if it throws, shows the error and does not save.
 * 5. Names the file scholar-<project-or-session-name>-<YYYY-MM-DD>.s3a.
 * 6. Saves as Blob with type "application/octet-stream" (never JSON.stringify).
 */
export async function exportS3ASession(options: S3AExportOptions = {}): Promise<{ filename: string; bytes: Uint8Array; warnings: string[] }> {
  await initS3AWasm();

  const consented = await getResearchLoggingConsent();
  if (consented) {
    await flushBuffer().catch((err: any) => {
      console.error('[S3A Export] Flush before export failed (queued statements retained for retry):', err);
    });
  }

  if (sessionRecordErrors.length > 0) {
    const errMsg = `Export blocked due to S3A recording errors:\n• ${sessionRecordErrors.join('\n• ')}`;
    throw new Error(errMsg);
  }

  const bytes = await snapshotMutex.run(async () => {
    const session = await _ensureActiveSnapshotInternal();
    return session.export_bytes();
  });

  // Pre-download check: from_bytes(bytes) must load without throwing;
  // if it throws, surface the error and do not save.
  try {
    const testSnapshot = from_bytes(bytes);
    try {
      testSnapshot.free();
    } catch (_f) {}
  } catch (verifyErr: any) {
    const errMsg = `Export validation failed: ${verifyErr?.message || verifyErr}`;
    console.error('[S3A Export] Pre-download verification failed:', errMsg);
    throw new Error(errMsg);
  }

  // Name the file scholar-<project-or-session-name>-<YYYY-MM-DD>.s3a
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const rawName = (options.projectOrSessionName || 'research-session').trim();
  const stripped = rawName
    .replace(/(\.snapshot)?\.(s3a|json)$/i, '')
    .replace(/^scholar[-_]+/i, '')
    .replace(/[-_]+\d{4}-\d{2}-\d{2}$/, '');
  const sanitizedName = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'research-session';

  const filename = `scholar-${sanitizedName}-${dateStr}.s3a`;

  // Save as Blob with type "application/octet-stream" when running in browser
  if (typeof document !== 'undefined') {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return { filename, bytes, warnings: [...sessionSkippedPaperWarnings] };
}

/**
 * Downloads participant or session data file using S3A engine bytes
 */
export async function downloadS3ADataFile(): Promise<void> {
  const session = getDualSessionState();
  await exportS3ASession({
    projectOrSessionName: `scholar-data-${session.session_id.slice(0, 8)}`
  });
}

/**
 * Imports an S3A binary file using from_bytes(new Uint8Array(await file.arrayBuffer())).
 * If it fails, shows "This is not an S3A file" (old OpenHarness JSON files will fail, which is correct).
 * Do not convert or accept JSON.
 */
export async function importS3ASnapshotFile(file: File): Promise<WasmAgentSnapshot> {
  await initS3AWasm();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const snapshot = from_bytes(bytes);
    return snapshot;
  } catch (err: any) {
    const errorMsg = 'This is not an S3A file';
    console.warn(`[S3A Import] ${errorMsg}:`, err);
    throw new Error(errorMsg);
  }
}

// -------------------------------------------------------------
// Dev Panel State & Subscription (?debug=1)
// -------------------------------------------------------------

export interface S3ADevPanelState {
  queueCount: number;
  totalStatementsCount: number;
  unmappedVerbsCount: number;
  lastFlushTime: string | null;
  last5Statements: S3AStatement[];
  verbResolutionLog: VerbResolutionLogEntry[];
  session: S3ADualSession;
  consented: boolean;
  isRestoredFromBytes: boolean;
  snapshotBytesLength: number;
  lastError: string | null;
  isPoisoned: boolean;
}

const devPanelListeners = new Set<(state: S3ADevPanelState) => void>();

export async function getDevPanelState(): Promise<S3ADevPanelState> {
  const queueCount = await getBufferQueueCount();
  const session = getDualSessionState();
  const consented = await getResearchLoggingConsent();
  return {
    queueCount,
    totalStatementsCount,
    unmappedVerbsCount,
    lastFlushTime: lastFlushTimestamp,
    last5Statements: [...recent5Statements].reverse().slice(0, 5),
    verbResolutionLog: [...verbResolutionLog].reverse().slice(0, 15),
    session,
    consented,
    isRestoredFromBytes,
    snapshotBytesLength: currentSnapshotBytesLength,
    lastError: lastSnapshotError,
    isPoisoned: isSnapshotPoisoned
  };
}

export function subscribeDevPanel(fn: (state: S3ADevPanelState) => void): () => void {
  devPanelListeners.add(fn);
  getDevPanelState().then(fn);
  return () => {
    devPanelListeners.delete(fn);
  };
}

async function notifyDevPanel() {
  const state = await getDevPanelState();
  devPanelListeners.forEach(fn => {
    try { fn(state); } catch {}
  });
}

/**
 * Sets research tracing consent using the snapshot engine method set_consent.
 * Purpose 1 = Research. Rejects if studyId is empty when granting consent.
 * Returns boolean of the new tracing state.
 */
export async function setConsent(granted: boolean, purpose = 1, studyId: string): Promise<boolean> {
  const snapshot = await getActiveSnapshot();
  const active = snapshot.set_consent(granted, purpose, studyId);
  await setResearchLoggingConsent(active);
  await saveStoredConsentState(snapshot.consent_state());
  if (granted && studyId) {
    await saveParticipantStudyId(studyId);
  }
  notifyStateChange();
  notifyDevPanel();
  // Trigger buffer flush to commit the consent/decline action to the WASM snapshot
  triggerBackgroundFlush('setConsent');
  return active;
}

/**
 * Checks whether research activity tracing is currently active on the snapshot.
 */
export async function isRecordingActive(): Promise<boolean> {
  try {
    const snapshot = await getActiveSnapshot();
    return snapshot.recording_active();
  } catch {
    return false;
  }
}

/**
 * Gets the current consent state ("none" | "granted" | "withdrawn") from the snapshot engine.
 */
export async function getConsentState(): Promise<'none' | 'granted' | 'withdrawn'> {
  try {
    const snapshot = await getActiveSnapshot();
    return snapshot.consent_state();
  } catch {
    return 'none';
  }
}

/**
 * Gets the participant's enrolled study ID.
 */
export async function getStudyId(): Promise<string> {
  try {
    const snapshot = await getActiveSnapshot();
    return (snapshot as any)._studyId || (await getParticipantStudyId());
  } catch {
    return await getParticipantStudyId();
  }
}

/**
 * Returns the human activity steps log.
 */
export async function getHumanActivityLog(): Promise<Array<{
  timestamp: string;
  stepIndex: number;
  verbName: string;
  actionDesc: string;
  actor: string;
  statementId: string;
}>> {
  return humanSteps.map(s => ({
    timestamp: s.timestamp,
    stepIndex: s.stepIndex,
    verbName: s.verbName,
    actionDesc: s.objectDesc,
    actor: s.actor,
    statementId: s.statementId
  }));
}

/**
 * Returns the AI assistant reasoning & activity steps log.
 */
export async function getAiActivityLog(): Promise<Array<{
  timestamp: string;
  stepIndex: number;
  agentSlug: string;
  stepType: number;
  confidence: number;
  humanIndex: number | null;
  statementId: string;
  blockedByPolicy: boolean;
}>> {
  return aiSteps.map(s => ({
    timestamp: s.timestamp,
    stepIndex: s.stepIndex,
    agentSlug: s.agentSlug,
    stepType: s.stepType,
    confidence: s.confidence,
    humanIndex: s.humanIndex,
    statementId: s.statementId,
    blockedByPolicy: s.blockedByPolicy
  }));
}

/**
 * Parses a real participant .s3a binary snapshot using the WASM snapshot engine's from_bytes.
 * Throws "This is not an S3A file" if from_bytes fails (e.g. invalid bytes, JSON).
 */
export async function parseParticipantSnapshot(bytes: Uint8Array): Promise<WasmAgentSnapshot> {
  await initS3AWasm();
  try {
    return from_bytes(bytes);
  } catch (err: any) {
    const errorMsg = 'This is not an S3A file';
    console.warn(`[S3A] ${errorMsg}:`, err);
    throw new Error(errorMsg);
  }
}

/**
 * Committee decision and Ed25519 cryptographic sign-off helpers
 */
/**
 * The reviewer signing key is generated in memory and is NOT saved anywhere. It is a
 * new key on every page load, so a signature proves the payload was not altered after
 * signing but does not prove which person signed it, and the key cannot be reused
 * across sessions. Treat committee signing here as a demo until a persistent,
 * identity-bound reviewer key is designed.
 */
export const EPHEMERAL_REVIEWER_KEY_NOTICE =
  'Demo signing key: a new Ed25519 key is made each time this page loads and is not saved. Signatures show the record was not altered, not who signed it.';

let reviewerKeyPair: CryptoKeyPair | null = null;

export async function getOrCreateReviewerKey(): Promise<{
  keyPair: CryptoKeyPair;
  rawPublicKey: Uint8Array;
}> {
  if (!reviewerKeyPair) {
    reviewerKeyPair = await window.crypto.subtle.generateKey(
      { name: 'Ed25519' },
      true,
      ['sign', 'verify']
    );
  }
  const rawKeyBuffer = await window.crypto.subtle.exportKey('raw', reviewerKeyPair.publicKey);
  return {
    keyPair: reviewerKeyPair,
    rawPublicKey: new Uint8Array(rawKeyBuffer)
  };
}

export async function signCommitteePayload(payloadBytes: Uint8Array): Promise<{
  rawPublicKey: Uint8Array;
  signature: Uint8Array;
}> {
  const { keyPair, rawPublicKey } = await getOrCreateReviewerKey();
  const signatureBuffer = await window.crypto.subtle.sign(
    { name: 'Ed25519' },
    keyPair.privateKey,
    payloadBytes
  );
  return {
    rawPublicKey,
    signature: new Uint8Array(signatureBuffer)
  };
}

/**
 * Returns raw canonical bytes from the engine for a committee evaluation verdict.
 */
export async function getCommitteeSigningPayload(
  verdict: number,
  reviewerId: string,
  submissionId: string,
  comment: string,
  timestampSec: number
): Promise<Uint8Array> {
  await initS3AWasm();
  const snap = await getActiveSnapshot();
  if (snap && typeof (snap as any).committee_signing_payload === 'function') {
    return (snap as any).committee_signing_payload(verdict, reviewerId, submissionId, comment, timestampSec);
  }
  if (typeof (WasmAgentSnapshot as any).committee_signing_payload === 'function') {
    return (WasmAgentSnapshot as any).committee_signing_payload(verdict, reviewerId, submissionId, comment, timestampSec);
  }
  throw new Error('committee_signing_payload function is not available on S3A engine');
}

/**
 * Records a committee decision on the engine with Ed25519 signature.
 * Verdict: 1=Approve, 2=Revise, 3=Reject.
 * Not gated by research consent and does not use record_human.
 */
export async function recordCommitteeDecision(
  verdict: number,
  reviewerId: string,
  submissionId: string,
  comment: string,
  timestampSec: number = Math.floor(Date.now() / 1000)
): Promise<{ success: boolean; result?: any }> {
  await initS3AWasm();
  const snap = await getActiveSnapshot();

  // 1. Obtain bytes from engine
  const payloadBytes = await getCommitteeSigningPayload(
    verdict,
    reviewerId,
    submissionId,
    comment,
    timestampSec
  );

  // 2. Sign with Ed25519 WebCrypto key
  const { rawPublicKey, signature } = await signCommitteePayload(payloadBytes);

  // 3. Record on engine
  if (snap && typeof (snap as any).record_committee_decision === 'function') {
    const res = (snap as any).record_committee_decision(
      verdict,
      reviewerId,
      submissionId,
      comment,
      timestampSec,
      rawPublicKey,
      signature
    );
    notifyStateChange();
    return { success: true, result: res };
  }
  if (typeof (WasmAgentSnapshot as any).record_committee_decision === 'function') {
    const res = (WasmAgentSnapshot as any).record_committee_decision(
      verdict,
      reviewerId,
      submissionId,
      comment,
      timestampSec,
      rawPublicKey,
      signature
    );
    notifyStateChange();
    return { success: true, result: res };
  }
  throw new Error('record_committee_decision function is not available on S3A engine');
}

/**
 * Lists committee decisions recorded in the engine.
 */
export async function listCommitteeDecisions(): Promise<any[]> {
  await initS3AWasm();
  const snap = await getActiveSnapshot();
  if (snap && typeof (snap as any).list_committee_decisions === 'function') {
    const raw = (snap as any).list_committee_decisions();
    return Array.isArray(raw) ? raw : (raw ? Array.from(raw) : []);
  }
  if (typeof (WasmAgentSnapshot as any).list_committee_decisions === 'function') {
    const raw = (WasmAgentSnapshot as any).list_committee_decisions();
    return Array.isArray(raw) ? raw : (raw ? Array.from(raw) : []);
  }
  return [];
}

/**
 * Verifies a committee decision signature at index against publicKey.
 */
export async function verifyCommitteeDecision(
  index: number,
  publicKey: Uint8Array
): Promise<boolean> {
  await initS3AWasm();
  const snap = await getActiveSnapshot();
  if (snap && typeof (snap as any).verify_committee_decision === 'function') {
    return Boolean((snap as any).verify_committee_decision(index, publicKey));
  }
  if (typeof (WasmAgentSnapshot as any).verify_committee_decision === 'function') {
    return Boolean((WasmAgentSnapshot as any).verify_committee_decision(index, publicKey));
  }
  return false;
}



// -------------------------------------------------------------
// Scholar Pack Structure & Tile Constants (Tiles 12, 13, 15)
// -------------------------------------------------------------

export const SCHOLAR_TILE_TYPES = {
  HUMAN_LRS: 10,
  AI_TRACE_LOG: 11,
  ACADEMIC_PAPERS: 12,
  RESEARCH_GRAPH: 13,
  SRS_WORKSPACE: 14,
  SRS_MANIFEST: 15,
  AGENT_REGISTRY: 18,
  NOTE_CLAIMS: 20,
  CITATION_FINGERPRINT: 32,
  COMMITTEE_DECISION: 96,
} as const;

export const RESEARCH_GRAPH_PREDICATES = {
  CONTAINS: 1,
  AUTHORED_BY: 2,
  CITES: 3,
  SUPPORTS: 1,
  CONTRADICTS: 2,
} as const;

export const ACADEMIC_PAPER_FLAGS = {
  SOURCE_OPENALEX: 1 << 3,
  SOURCE_CROSSREF: 1 << 4,
  RESEARCHER_APPROVED: 1 << 5,
  HAS_OA_URL_REF: 1 << 6,
} as const;

/**
 * 64-bit FNV-1a hash matching Rust s3a_pack_scholar::xapi::hash_iri.
 */
export function hashIri(iri: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  const bytes = new TextEncoder().encode(iri);
  for (let i = 0; i < bytes.length; i++) {
    hash ^= BigInt(bytes[i]);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return hash;
}

// Castagnoli CRC32C table (polynomial 0x82F63B78)
const CRC32C_POLYNOMIAL = 0x82f63b78;
const CRC32C_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (crc >>> 1) ^ CRC32C_POLYNOMIAL : crc >>> 1;
  }
  CRC32C_TABLE[i] = crc >>> 0;
}

export function computeCrc32c(bytes: Uint8Array, initial = 0): number {
  let crc = (initial ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC32C_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

let sessionDeltaSeq = 1;

export function getSessionDeltaSeq(): number {
  return sessionDeltaSeq;
}

export function resetSessionDeltaSeq(): void {
  sessionDeltaSeq = 1;
}

export interface ResearchGraphEdgeInput {
  subject_hash: bigint | number;
  object_hash: bigint | number;
  predicate_id: number;
  weight?: number;
  timestamp_sec?: number;
}

/**
 * Encodes an SrsSyncDeltaPacket containing ResearchGraphEdgeRecords (Tile 13)
 * with hardware-compatible CRC32C Castagnoli verification.
 */
export function buildGraphDeltaPacket(
  sessionUuidHex: string,
  deltaSeq: number,
  edges: ResearchGraphEdgeInput[]
): Uint8Array {
  const cleanHex = sessionUuidHex.replace(/[^0-9a-fA-F]/g, '');
  if (cleanHex.length !== 32) {
    throw new Error(`Invalid session UUID hex length: expected 32 hex chars, got ${cleanHex.length}`);
  }
  const sessHigh = BigInt('0x' + cleanHex.slice(0, 16));
  const sessLow = BigInt('0x' + cleanHex.slice(16, 32));
  const snapHigh = sessHigh ^ 0xa5a5a5a55a5a5a5an;
  const snapLow = sessLow ^ 0x5a5a5a5aa5a5a5a5n;

  const entriesBuf = new ArrayBuffer(168 * edges.length);
  const entriesBytes = new Uint8Array(entriesBuf);
  const nowSec = BigInt(Math.floor(Date.now() / 1000));

  for (let i = 0; i < edges.length; i++) {
    const edge = edges[i];
    const offset = i * 168;
    const entryView = new DataView(entriesBuf, offset, 168);
    entryView.setUint32(0, SCHOLAR_TILE_TYPES.RESEARCH_GRAPH, true); // Tile 13
    entryView.setUint32(4, 0, true);

    const edgeView = new DataView(entriesBuf, offset + 8, 64);
    edgeView.setBigUint64(0, BigInt(edge.subject_hash), true);
    edgeView.setBigUint64(8, BigInt(edge.object_hash), true);
    edgeView.setBigUint64(16, typeof edge.timestamp_sec === 'number' ? BigInt(edge.timestamp_sec) : nowSec, true);
    edgeView.setBigUint64(24, 0n, true); // hilbert_coord
    edgeView.setUint32(32, edge.predicate_id, true);
    edgeView.setFloat32(36, typeof edge.weight === 'number' ? edge.weight : 1.0, true);
    edgeView.setBigUint64(40, 1n, true); // FLAG_ACTIVE
  }

  const headerBuf = new ArrayBuffer(96);
  const headerView = new DataView(headerBuf);
  const magic = new TextEncoder().encode('S3ASYNC1');
  new Uint8Array(headerBuf, 0, 8).set(magic);
  headerView.setUint32(8, 1, true); // schema_version = 1
  headerView.setUint32(12, 0, true); // flags
  headerView.setBigUint64(16, sessHigh, true);
  headerView.setBigUint64(24, sessLow, true);
  headerView.setBigUint64(32, snapHigh, true);
  headerView.setBigUint64(40, snapLow, true);
  headerView.setBigUint64(48, BigInt(deltaSeq), true);
  headerView.setUint32(56, edges.length, true);
  headerView.setUint32(60, 0, true); // zero placeholder for CRC
  headerView.setBigUint64(64, nowSec, true);

  const checksum = computeCrc32c(entriesBytes, computeCrc32c(new Uint8Array(headerBuf)));
  headerView.setUint32(60, checksum, true);

  const packet = new Uint8Array(96 + entriesBytes.length);
  packet.set(new Uint8Array(headerBuf), 0);
  packet.set(entriesBytes, 96);
  return packet;
}

export interface ScholarPackWriteResult {
  added: boolean;
  skipped?: boolean;
  duplicate?: boolean;
  warning?: string;
  paperIndex?: number;
  edgesCount?: number;
  tracingEmitted?: boolean;
}

/**
 * Writes a selected paper as a complete record (metadata, PDF ref, sections, figures,
 * tables, references) to the Scholar pack (Tile 12 Papers, Tile 13 Research graph, Tile 15 Manifest).
 * 
 * - Dual UUID: links human researcher (actor_uuid) and AI assistant (agent_uuid).
 * - Consent-gated tracing: Pass 1 human selection statement is emitted ONLY if research logging consent is granted.
 */
export interface WritePaperToScholarPackOptions {
  actorUuid?: string;
  agentUuid?: string;
  /**
   * When false, the paper is written to the pack without a Pass 1 / xAPI
   * inclusion statement. Used when restaging a restored queue: restore is
   * not a new inclusion decision. Default true (real selection).
   */
  recordInclusionStatement?: boolean;
}

export async function writePaperToScholarPack(
  paper: ResearchPaper,
  options?: WritePaperToScholarPackOptions
): Promise<ScholarPackWriteResult> {
  const session = getDualSessionState();
  const actorUuid = options?.actorUuid || session.actor_uuid;
  const agentUuid = options?.agentUuid || session.agent_uuid;

  const cleanOpenAlex = extractCleanOpenAlexId(paper.openalex_id || paper.id);
  const cleanDoi = paper.doi ? paper.doi.replace(/^https?:\/\/doi\.org\//i, '').trim() : '';
  const paperIdentifier = cleanOpenAlex || cleanDoi || paper.id || paper.title;

  if (!paperIdentifier) {
    const warning = 'Skipped paper: missing identifier.';
    if (!sessionSkippedPaperWarnings.includes(warning)) sessionSkippedPaperWarnings.push(warning);
    return { added: false, skipped: true, warning };
  }

  const hasPdf = Boolean(paper.pdfURL || paper.openAccessPdfUrl);
  let flags = ACADEMIC_PAPER_FLAGS.SOURCE_OPENALEX | ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED;
  if (hasPdf) {
    flags |= ACADEMIC_PAPER_FLAGS.HAS_OA_URL_REF;
  }

  const safeYear = (typeof paper.year === 'number' && Number.isFinite(paper.year) && paper.year > 0)
    ? Math.floor(paper.year)
    : 0;
  const safeCitations = (typeof paper.citations === 'number' && Number.isFinite(paper.citations) && paper.citations >= 0)
    ? Math.floor(paper.citations)
    : 0;

  let paperIndex = 0;
  let isDuplicate = false;
  let edgesCount = 0;
  const dedupeKey = cleanOpenAlex || cleanDoi || paperIdentifier;

  await snapshotMutex.run(async () => {
    const snapshot = await _ensureActiveSnapshotInternal();
    if (sessionAddedPaperIds.has(dedupeKey)) {
      isDuplicate = true;
    } else {
      try {
        paperIndex = snapshot.add_paper(cleanOpenAlex || dedupeKey, cleanDoi, safeYear, safeCitations, flags);
        sessionAddedPaperIds.add(dedupeKey);
        papersCount = sessionAddedPaperIds.size;
      } catch (err: any) {
        const errMsg = `Failed to record paper "${paper.title || paperIdentifier}" via add_paper: ${err?.message || err}`;
        if (!sessionRecordErrors.includes(errMsg)) sessionRecordErrors.push(errMsg);
        if (isPoisonError(err)) await handlePoisonedSnapshot(err);
        throw new Error(errMsg);
      }
    }

    // Build Tile 13 Research Graph Edges (metadata, PDF ref, sections, figures, tables, references)
    const paperHash = hashIri(cleanOpenAlex || cleanDoi || paperIdentifier);
    const edges: ResearchGraphEdgeInput[] = [];

    // 1. PDF reference
    const pdfRef = paper.pdfURL || paper.openAccessPdfUrl;
    if (pdfRef) {
      edges.push({
        subject_hash: paperHash,
        object_hash: hashIri(pdfRef),
        predicate_id: RESEARCH_GRAPH_PREDICATES.CONTAINS,
        weight: 1.0,
      });
    }

    // 2. Sections
    if (Array.isArray(paper.sections)) {
      for (let sIdx = 0; sIdx < paper.sections.length; sIdx++) {
        const s = paper.sections[sIdx];
        const sKey = s.id || s.heading || s.title || (s.content ? s.content.slice(0, 40) : `section_${sIdx}`);
        edges.push({
          subject_hash: paperHash,
          object_hash: hashIri(sKey),
          predicate_id: RESEARCH_GRAPH_PREDICATES.CONTAINS,
          weight: 1.0,
        });
      }
    }

    // 3. Figures
    if (Array.isArray(paper.figures)) {
      for (let fIdx = 0; fIdx < paper.figures.length; fIdx++) {
        const f = paper.figures[fIdx];
        const fKey = f.id || f.label || f.caption || f.url || `figure_${fIdx}`;
        edges.push({
          subject_hash: paperHash,
          object_hash: hashIri(fKey),
          predicate_id: RESEARCH_GRAPH_PREDICATES.CONTAINS,
          weight: 1.0,
        });
      }
    }

    // 4. Tables
    if (Array.isArray(paper.tables)) {
      for (let tIdx = 0; tIdx < paper.tables.length; tIdx++) {
        const t = paper.tables[tIdx];
        const tKey = t.id || t.label || t.caption || `table_${tIdx}`;
        edges.push({
          subject_hash: paperHash,
          object_hash: hashIri(tKey),
          predicate_id: RESEARCH_GRAPH_PREDICATES.CONTAINS,
          weight: 1.0,
        });
      }
    }

    // 5. References
    if (Array.isArray(paper.references)) {
      for (let rIdx = 0; rIdx < paper.references.length; rIdx++) {
        const r = paper.references[rIdx];
        const rKey = typeof r === 'string'
          ? r
          : (r.openalex_id || r.doi || r.id || r.title || `ref_${rIdx}`);
        edges.push({
          subject_hash: paperHash,
          object_hash: hashIri(rKey),
          predicate_id: RESEARCH_GRAPH_PREDICATES.CITES,
          weight: 1.0,
        });
      }
    }

    if (edges.length > 0) {
      try {
        const packet = buildGraphDeltaPacket(currentSessionUuidHex, sessionDeltaSeq, edges);
        snapshot.apply_delta(packet);
        sessionDeltaSeq++;
        edgesCount = edges.length;
      } catch (deltaErr: any) {
        console.warn('[S3A WASM] Graph edges delta apply warning:', deltaErr);
      }
    }
  });

  // 6. Consent-gated tracing (Pass 1 selection only when consent is granted).
  // Restaging a restored queue must not record a new inclusion statement.
  let tracingEmitted = false;
  const recordInclusionStatement = options?.recordInclusionStatement !== false;
  const consented = await getResearchLoggingConsent();
  const consentState = await getStoredConsentState();

  if (recordInclusionStatement && consented && consentState === 'granted') {
    try {
      const user = authService.getUser();
      const resolvedActorName = user?.displayName || user?.name || 'Scholar Researcher';
      await logHumanAction(
        S3A_VERBS.SAVED,
        resolvedActorName,
        paper.title || paperIdentifier,
        null,
        cleanOpenAlex || cleanDoi || paperIdentifier
      );
      tracingEmitted = true;
    } catch (traceErr) {
      console.warn('[S3A WASM] Consent-gated trace recording error:', traceErr);
    }
  }

  notifyStateChange();
  return {
    added: !isDuplicate,
    duplicate: isDuplicate,
    paperIndex,
    edgesCount,
    tracingEmitted,
  };
}

/**
 * Writes every paper in the current selection queue into the in-memory WASM
 * session. Defaults to not recording inclusion statements so a restored queue
 * can be restaged without treating restore as a new selection.
 */
export async function stageQueuePapersInSession(
  papers: ResearchPaper[],
  options?: WritePaperToScholarPackOptions
): Promise<ScholarPackWriteResult[]> {
  const recordInclusionStatement = options?.recordInclusionStatement ?? false;
  const results: ScholarPackWriteResult[] = [];
  for (const paper of papers) {
    results.push(await writePaperToScholarPack(paper, { ...options, recordInclusionStatement }));
  }
  return results;
}

// -------------------------------------------------------------
// Scholar Pack Round-Trip Binary Reader & Inspector
// -------------------------------------------------------------

export interface ScholarPackManifest {
  magic: string;
  schema_version: number;
  archive_flags: number;
  project_uuid: [bigint, bigint];
  snapshot_uuid: [bigint, bigint];
  parent_snapshot_uuid: [bigint, bigint];
  origin_session_uuid: [bigint, bigint];
  created_at_sec: bigint;
  tile_count: number;
  crc32c_checksum: number;
  total_records: bigint;
}

export interface ScholarPackPaper {
  paper_id: bigint;
  timestamp_sec: bigint;
  hilbert_index: bigint;
  citation_count: number;
  year: number;
  venue_id: number;
  open_access_flag: number;
  warning_count: number;
  doi_prefix_hash: bigint;
  flags: bigint;
}

export interface ScholarPackEdge {
  subject_hash: bigint;
  object_hash: bigint;
  timestamp_sec: bigint;
  hilbert_coord: bigint;
  predicate_id: number;
  weight: number;
  flags: bigint;
}

export interface ScholarPackParsed {
  tileCount: number;
  tileTypes: number[];
  hasTile12: boolean;
  hasTile13: boolean;
  hasTile15: boolean;
  papers: ScholarPackPaper[];
  edges: ScholarPackEdge[];
  manifest: ScholarPackManifest | null;
}

/**
 * Parses and verifies an exported .snapshot.s3a container buffer.
 * Inspects Tile 12 (Papers), Tile 13 (Research Graph), and Tile 15 (Manifest).
 */
export function readScholarPack(bytes: Uint8Array): ScholarPackParsed {
  const FILE_HEADER_SIZE = 512;
  const HYPER_TILE_SIZE = 131072;

  if (bytes.length < FILE_HEADER_SIZE) {
    throw new Error(`Buffer too small for S3A file header: ${bytes.length} bytes`);
  }

  const fileView = new DataView(bytes.buffer, bytes.byteOffset, 512);
  const tileCount = fileView.getUint32(16, true);

  const parsed: ScholarPackParsed = {
    tileCount,
    tileTypes: [],
    hasTile12: false,
    hasTile13: false,
    hasTile15: false,
    papers: [],
    edges: [],
    manifest: null,
  };

  for (let i = 0; i < tileCount; i++) {
    const tileOffset = FILE_HEADER_SIZE + i * HYPER_TILE_SIZE;
    if (tileOffset + 512 > bytes.length) break;

    const tileView = new DataView(bytes.buffer, bytes.byteOffset + tileOffset, 64);
    const tileType = tileView.getUint32(8, true);
    const recordCount = tileView.getUint32(12, true);
    parsed.tileTypes.push(tileType);

    const payloadOffset = tileOffset + 512;

    if (tileType === SCHOLAR_TILE_TYPES.ACADEMIC_PAPERS) {
      parsed.hasTile12 = true;
      for (let r = 0; r < recordCount; r++) {
        const rOffset = payloadOffset + r * 64;
        if (rOffset + 64 > bytes.length) break;
        const rv = new DataView(bytes.buffer, bytes.byteOffset + rOffset, 64);
        parsed.papers.push({
          paper_id: rv.getBigUint64(0, true),
          timestamp_sec: rv.getBigUint64(8, true),
          hilbert_index: rv.getBigUint64(16, true),
          citation_count: rv.getUint32(36, true),
          year: rv.getUint16(40, true),
          venue_id: rv.getUint16(42, true),
          open_access_flag: rv.getUint16(44, true),
          warning_count: rv.getUint16(46, true),
          doi_prefix_hash: rv.getBigUint64(48, true),
          flags: rv.getBigUint64(56, true),
        });
      }
    } else if (tileType === SCHOLAR_TILE_TYPES.RESEARCH_GRAPH) {
      parsed.hasTile13 = true;
      for (let r = 0; r < recordCount; r++) {
        const rOffset = payloadOffset + r * 64;
        if (rOffset + 64 > bytes.length) break;
        const rv = new DataView(bytes.buffer, bytes.byteOffset + rOffset, 64);
        parsed.edges.push({
          subject_hash: rv.getBigUint64(0, true),
          object_hash: rv.getBigUint64(8, true),
          timestamp_sec: rv.getBigUint64(16, true),
          hilbert_coord: rv.getBigUint64(24, true),
          predicate_id: rv.getUint32(32, true),
          weight: rv.getFloat32(36, true),
          flags: rv.getBigUint64(40, true),
        });
      }
    } else if (tileType === SCHOLAR_TILE_TYPES.SRS_MANIFEST) {
      parsed.hasTile15 = true;
      if (payloadOffset + 512 <= bytes.length) {
        const mv = new DataView(bytes.buffer, bytes.byteOffset + payloadOffset, 512);
        const magicBytes = new Uint8Array(bytes.buffer, bytes.byteOffset + payloadOffset, 8);
        const magic = new TextDecoder('utf-8').decode(magicBytes);
        parsed.manifest = {
          magic,
          schema_version: mv.getUint32(8, true),
          archive_flags: mv.getUint32(12, true),
          project_uuid: [mv.getBigUint64(16, true), mv.getBigUint64(24, true)],
          snapshot_uuid: [mv.getBigUint64(32, true), mv.getBigUint64(40, true)],
          parent_snapshot_uuid: [mv.getBigUint64(48, true), mv.getBigUint64(56, true)],
          origin_session_uuid: [mv.getBigUint64(64, true), mv.getBigUint64(72, true)],
          created_at_sec: mv.getBigUint64(80, true),
          tile_count: mv.getUint32(88, true),
          crc32c_checksum: mv.getUint32(92, true),
          total_records: mv.getBigUint64(96, true),
        };
      }
    }
  }

  return parsed;
}

export const parseScholarPack = readScholarPack;
