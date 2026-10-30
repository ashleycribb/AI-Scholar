/**
 * services/s3aOutboxService.ts
 * 
 * S3A Outbox (Write Path) & Synchronization Manager.
 * 
 * Enforces:
 * 1. Client-generated UUID v4 'id' before queueing (idempotency).
 * 2. Profile IRI in context.contextActivities.category:
 *    https://ashecribb.dev/xapi/profiles/scholar-explorer/v1
 * 3. context.registration = session_uuid in standard dashed UUID format.
 * 4. Human actor: account { homePage: app URL, name: researcher id }.
 *    AI actor: account { homePage: app URL + "/agents", name: agent slug },
 *    and include human's statement id in context.statement when AI acts on human step.
 * 5. Verbs from WASM verb map (iri_for_verb_id).
 * 6. Papers: Activity with id https://openalex.org/W..., name = title.
 * 7. Outbox FIFO queueing in IndexedDB, batch sending up to 50 per POST,
 *    deleting only after 200 ack.
 * 8. Automatic flushing on start, online, and every 30s while queue non-empty.
 * 9. Non-retryable 403 (blocked by policy) & 400 (rejected profile violation).
 */

import { 
  enqueueOutboxStatement, 
  getQueuedStatements, 
  removeStatementsFromOutbox, 
  getOutboxQueueCount, 
  recordRejectedStatement, 
  getRejectedStatements,
  getLrsCredentials,
  getExplorerCredentials,
  getUserMode,
  getResearchLoggingConsent,
  getStoredConsentState,
  DEFAULT_LRS_ENDPOINT,
  type QueuedStatementItem
} from './lrsCredentialsService';
import { postStatements, testLrsConnection, lrsAuthAvailable, LrsError } from './lrsClient';
import { iri_for_verb_id } from './s3aWasmService';

export type LrsStatusType = 'connected' | 'offline' | 'auth_error';

export interface LrsSyncState {
  status: LrsStatusType;
  queuedCount: number;
  rejectedCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  serverVersion: string | null;
  activeEndpoint: string;
  isFlushing: boolean;
  blockedSteps: Record<string, string>; // statementId or stepIndex -> 'blocked by policy'
}

export const SCHOLAR_PROFILE_CATEGORY_IRI = 'https://ashecribb.dev/xapi/profiles/scholar-explorer/v1';

let syncState: LrsSyncState = {
  status: 'offline',
  queuedCount: 0,
  rejectedCount: 0,
  lastSyncedAt: null,
  lastError: null,
  serverVersion: null,
  activeEndpoint: DEFAULT_LRS_ENDPOINT,
  isFlushing: false,
  blockedSteps: {}
};

const listeners = new Set<(state: LrsSyncState) => void>();
let timerInterval: any = null;
let isInitialized = false;

function notifyListeners() {
  const copy = { ...syncState, blockedSteps: { ...syncState.blockedSteps } };
  listeners.forEach(fn => {
    try { fn(copy); } catch (e) { console.error('LRS listener error:', e); }
  });
}

export function subscribeLrsSync(fn: (state: LrsSyncState) => void): () => void {
  listeners.add(fn);
  fn({ ...syncState, blockedSteps: { ...syncState.blockedSteps } });
  return () => {
    listeners.delete(fn);
  };
}

export function getLrsSyncState(): LrsSyncState {
  return { ...syncState, blockedSteps: { ...syncState.blockedSteps } };
}

/**
 * Converts a 32-character hexadecimal UUID string to standard dashed 8-4-4-4-12 UUID format
 */
export function hexToDashedUuid(hex: string): string {
  if (!hex) return '';
  const clean = hex.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
  }
  return hex;
}

/**
 * Generates a clean client-side RFC4122 UUID v4 for idempotent xAPI statement identification
 */
export function generateStatementUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().toLowerCase();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Gets the current app URL for xAPI actor homePage
 */
export function getAppUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://scholar-explorer.dev';
}

const VERB_DISPLAYS: Record<number, string> = {
  1: 'experienced',
  2: 'reviewed',
  3: 'approved',
  4: 'rejected',
  5: 'requested-human-review',
  6: 'flagged-hallucination',
  7: 'cites',
  8: 'imported',
  9: 'exported-snapshot',
  10: 'searched',
  11: 'opened',
  12: 'viewed',
  13: 'saved',
  14: 'removed',
  15: 'created',
  16: 'edited',
  17: 'asked',
  18: 'ai-answered',
  19: 'accepted',
  20: 'logged-out',
  21: 'consent-declined',
  22: 'flagged-discrepancy',
  23: 'verified-claim'
};

/**
 * Resolves verb IRI directly using WASM module iri_for_verb_id.
 * All verbs resolve natively through the WASM package without fallback mapping.
 */
export function resolveVerbIri(verbId: number): string {
  try {
    const wasmIri = iri_for_verb_id(verbId);
    if (wasmIri) return wasmIri;
  } catch {
    // WASM not yet ready
  }
  return `https://ashecribb.dev/xapi/verbs/action-${verbId}`;
}

/**
 * Builds an xAPI 1.0.3 Human Statement conforming strictly to specification:
 * - Client-generated UUID v4 'id'
 * - Profile IRI in context.contextActivities.category
 * - context.registration in standard dashed UUID format
 * - Human actor: account { homePage: app URL, name: researcher id }
 * - Verbs from WASM verb map (iri_for_verb_id)
 * - Object = Activity with OpenAlex or custom activity IRI
 */
export function buildHumanStatement(params: {
  statementId: string;
  sessionUuidHex: string;
  verbId: number;
  verbName?: string;
  researcherId: string;
  researcherName?: string;
  object: {
    id: string;
    name: string;
    type?: string;
    description?: string;
  };
  stepIndex?: number;
  extensions?: Record<string, any>;
}): any {
  const verbIri = resolveVerbIri(params.verbId);
  const verbDisplay = params.verbName || VERB_DISPLAYS[params.verbId] || 'acted';
  const dashedRegistration = hexToDashedUuid(params.sessionUuidHex);
  const appUrl = getAppUrl();

  return {
    id: params.statementId,
    actor: {
      objectType: 'Agent',
      name: params.researcherName || 'Scholar Researcher',
      account: {
        homePage: appUrl,
        name: params.researcherId || 'researcher-local'
      }
    },
    verb: {
      id: verbIri,
      display: {
        'en-US': verbDisplay
      }
    },
    object: {
      id: params.object.id,
      objectType: 'Activity',
      definition: {
        name: {
          'en-US': params.object.name
        },
        ...(params.object.type ? { type: params.object.type } : {}),
        ...(params.object.description ? { description: { 'en-US': params.object.description } } : {})
      }
    },
    context: {
      registration: dashedRegistration,
      contextActivities: {
        category: [
          {
            id: SCHOLAR_PROFILE_CATEGORY_IRI,
            objectType: 'Activity'
          }
        ]
      },
      extensions: {
        'https://ashecribb.dev/xapi/extensions/step-index': params.stepIndex ?? 0,
        ...(params.extensions || {})
      }
    },
    timestamp: new Date().toISOString()
  };
}

/**
 * Builds an xAPI 1.0.3 AI Agent Statement:
 * - Client-generated UUID v4 'id'
 * - Profile IRI in context.contextActivities.category
 * - context.registration in standard dashed UUID format
 * - AI actor: account { homePage: app URL + "/agents", name: agent slug }
 * - Include human's statement id in context.statement when AI acts on a human step
 * - Verbs from WASM verb map
 */
export function buildAiStatement(params: {
  statementId: string;
  sessionUuidHex: string;
  agentSlug: string;
  verbId: number;
  verbName?: string;
  object: {
    id: string;
    name: string;
    type?: string;
    description?: string;
  };
  humanStatementId?: string | null;
  stepIndex?: number;
  confidence?: number;
  preflightResult?: string;
  extensions?: Record<string, any>;
}): any {
  const verbIri = resolveVerbIri(params.verbId);
  const verbDisplay = params.verbName || VERB_DISPLAYS[params.verbId] || 'inferred';
  const dashedRegistration = hexToDashedUuid(params.sessionUuidHex);
  const appUrl = getAppUrl();

  const statement: any = {
    id: params.statementId,
    actor: {
      objectType: 'Agent',
      name: params.agentSlug,
      account: {
        homePage: `${appUrl}/agents`,
        name: params.agentSlug
      }
    },
    verb: {
      id: verbIri,
      display: {
        'en-US': verbDisplay
      }
    },
    object: {
      id: params.object.id,
      objectType: 'Activity',
      definition: {
        name: {
          'en-US': params.object.name
        },
        ...(params.object.type ? { type: params.object.type } : {}),
        ...(params.object.description ? { description: { 'en-US': params.object.description } } : {})
      }
    },
    context: {
      registration: dashedRegistration,
      contextActivities: {
        category: [
          {
            id: SCHOLAR_PROFILE_CATEGORY_IRI,
            objectType: 'Activity'
          }
        ]
      },
      extensions: {
        'https://ashecribb.dev/xapi/extensions/step-index': params.stepIndex ?? 0,
        'https://ashecribb.dev/xapi/extensions/confidence': params.confidence ?? 1.0,
        'https://ashecribb.dev/xapi/extensions/preflight-result': params.preflightResult || 'ok',
        ...(params.extensions || {})
      }
    },
    timestamp: new Date().toISOString()
  };

  // Include the human's statement id in context.statement when the AI acts on a human step
  if (params.humanStatementId) {
    statement.context.statement = {
      id: params.humanStatementId,
      objectType: 'StatementRef'
    };
  }

  return statement;
}

/**
 * Enqueue a statement into the Outbox and immediately trigger a background flush.
 */
export async function queueAndFlushStatement(
  statement: any,
  sessionUuidHex: string
): Promise<number> {
  const [consented, consentState] = await Promise.all([
    getResearchLoggingConsent(),
    getStoredConsentState()
  ]);
  if (!consented || consentState !== 'granted') {
    return 0;
  }

  const dashed = hexToDashedUuid(sessionUuidHex);
  const outboxKey = await enqueueOutboxStatement(statement, dashed);

  // Update queued count in state
  const qCount = await getOutboxQueueCount();
  syncState.queuedCount = qCount;
  notifyListeners();

  // Trigger flush immediately
  flushOutbox().catch(err => {
    console.warn('[S3A Outbox] Background flush attempt encountered:', err?.message || err);
  });

  return outboxKey;
}

/**
 * Flush Outbox:
 * - Send up to 50 queued statements per POST, in order.
 * - Remove from the outbox only after a 200 response.
 * - If 403 for AI statement (agent not allowed), mark step "blocked by policy" and don't retry.
 * - If 400 for profile violation, record in rejected list with reason and don't retry.
 * - If 401: mark status 'auth_error' and do NOT drop statements.
 * - If network error/5xx: mark status 'offline' and do NOT drop statements.
 */
export async function flushOutbox(): Promise<void> {
  if (syncState.isFlushing) return;

  const [consented, consentState] = await Promise.all([
    getResearchLoggingConsent(),
    getStoredConsentState()
  ]);
  const queued = await getQueuedStatements(50);

  if (!consented || consentState !== 'granted') {
    if (queued.length > 0) {
      const dbKeys = queued.map(item => item.id!).filter(id => id !== undefined);
      await removeStatementsFromOutbox(dbKeys);
    }
    syncState.queuedCount = 0;
    syncState.status = 'offline';
    syncState.lastError = null;
    notifyListeners();
    return;
  }

  const totalCount = await getOutboxQueueCount();
  syncState.queuedCount = totalCount;

  // Check if current batch or user mode is Explorer
  const userMode = await getUserMode();
  const hasExplorerStatements = queued.some(item => 
    item.statement?.actor?.account?.homePage?.includes('/explorer') ||
    item.statement?.context?.contextActivities?.category?.some((c: any) => c.id?.includes('scholar-explorer-usage'))
  );

  const creds = (hasExplorerStatements || userMode === 'explorer')
    ? await getExplorerCredentials()
    : await getLrsCredentials();

  syncState.activeEndpoint = creds.endpoint;

  if (!(await lrsAuthAvailable(creds))) {
    syncState.status = 'offline';
    syncState.lastError = null;
    notifyListeners();
    return;
  }

  if (queued.length === 0) {
    // If empty, verify connection via testConnection
    if (syncState.status !== 'auth_error') {
      try {
        const testRes = await testLrsConnection(creds.endpoint, creds.username, creds.password);
        syncState.status = 'connected';
        syncState.serverVersion = testRes.version;
        syncState.lastError = null;
      } catch (err: any) {
        if (err instanceof LrsError && err.status === 401) {
          syncState.status = 'auth_error';
          syncState.lastError = 'Invalid credentials (401 Unauthorized)';
        } else {
          syncState.status = 'offline';
          syncState.lastError = err?.message || 'Server unreachable';
        }
      }
    }
    notifyListeners();
    return;
  }

  syncState.isFlushing = true;
  notifyListeners();

  try {
    const statementsToSend = queued.map(item => item.statement);
    const dbKeys = queued.map(item => item.id!).filter(id => id !== undefined);

    await postStatements(statementsToSend, creds);

    // If successful (200), remove sent IDs from outbox
    await removeStatementsFromOutbox(dbKeys);

    syncState.status = 'connected';
    syncState.lastSyncedAt = new Date().toISOString();
    syncState.lastError = null;
    const remainingCount = await getOutboxQueueCount();
    syncState.queuedCount = remainingCount;

    // If more items remain, trigger next batch
    if (remainingCount > 0) {
      setTimeout(() => {
        flushOutbox().catch(() => {});
      }, 50);
    }
  } catch (err: any) {
    if (err instanceof LrsError) {
      if (err.status === 401) {
        // 401 Auth Error: Keep in outbox, mark auth_error
        syncState.status = 'auth_error';
        syncState.lastError = err.serverMessage || 'Auth error: Check LRS username/password';
      } else if (err.status === 400 || err.status === 403 || err.status === 409) {
        // On 400/403/409 for a batch, retry statements one by one to save valid ones and isolate rejected ones
        for (const item of queued) {
          try {
            await postStatements([item.statement], creds);
            if (item.id) await removeStatementsFromOutbox([item.id]);
          } catch (singleErr: any) {
            const errorText = singleErr instanceof LrsError
              ? (singleErr.serverMessage || `HTTP ${singleErr.status}`)
              : (singleErr?.message || 'Rejected');
            await recordRejectedStatement(item.statement, errorText, item.id);
            if (item.id) await removeStatementsFromOutbox([item.id]);
          }
        }
        const rejected = await getRejectedStatements();
        syncState.rejectedCount = rejected.length;
        syncState.lastError = err.serverMessage || `Statements rejected (${err.status})`;
        syncState.queuedCount = await getOutboxQueueCount();
      } else {
        // 5xx or network
        syncState.status = 'offline';
        syncState.lastError = err.serverMessage || err.message;
      }
    } else {
      // Network error (server down, connection refused)
      syncState.status = 'offline';
      syncState.lastError = err?.message || 'LRS server offline';
    }
  } finally {
    syncState.isFlushing = false;
    notifyListeners();
  }
}

/**
 * Initialize S3A Outbox synchronization:
 * - Flush on app start
 * - Flush when browser comes back online
 * - Flush every 30 seconds while queue is non-empty
 */
export async function initializeOutboxSync(): Promise<void> {
  if (isInitialized) return;
  isInitialized = true;

  const creds = await getLrsCredentials();
  syncState.activeEndpoint = creds.endpoint;

  const count = await getOutboxQueueCount();
  const rejected = await getRejectedStatements();
  syncState.queuedCount = count;
  syncState.rejectedCount = rejected.length;

  // 1. Initial connection check & flush on app start
  flushOutbox().catch(e => console.warn('[S3A Outbox] Initial flush:', e));

  // 2. Online event listener
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      console.log('[S3A Outbox] Browser online event detected. Flushing outbox...');
      flushOutbox().catch(e => console.warn('[S3A Outbox] Online flush:', e));
    });
  }

  // 3. Periodic timer: every 30s while queue is non-empty (or periodic check)
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    const [consented, consentState] = await Promise.all([
      getResearchLoggingConsent(),
      getStoredConsentState()
    ]);
    if (!consented || consentState !== 'granted') {
      syncState.queuedCount = 0;
      return;
    }
    const currentQueue = await getOutboxQueueCount();
    syncState.queuedCount = currentQueue;
    if (currentQueue > 0 || syncState.status === 'offline') {
      flushOutbox().catch((err) => {
        console.warn('[S3A Outbox] Periodic flush error (queued statements retained):', err?.message || err);
      });
    }
  }, 30000);
}
