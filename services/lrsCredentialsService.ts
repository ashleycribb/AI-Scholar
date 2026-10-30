/**
 * services/lrsCredentialsService.ts
 * 
 * IndexedDB storage for S3A LRS credentials, outbox queue, and rejected statements.
 * Strict privacy rule: Credentials are stored ONLY in IndexedDB, never in source code,
 * localStorage, logs, or exported files.
 */

export interface LrsCredentials {
  endpoint: string;
  username: string;
  password: string;
}

export interface QueuedStatementItem {
  id?: number;              // Auto-increment primary key in IDB
  statementId: string;      // UUID v4 of the xAPI statement
  statement: any;           // Complete xAPI 1.0.3 statement JSON
  createdAt: string;        // ISO timestamp
  attempts: number;         // Attempt counter
  lastError?: string;       // Last error message if failed
  targetSessionUuid: string;// Registration UUID
}

export interface RejectedStatementItem {
  id?: number;
  statementId: string;
  statement: any;
  reason: string;
  rejectedAt: string;
}

const DB_NAME = 'scholar_explorer_s3a';
const DB_VERSION = 3;

const CREDENTIALS_STORE = 'credentials_store';
const OUTBOX_STORE = 'outbox_store';
const REJECTED_STORE = 'rejected_store';
const BUFFER_STORE = 'buffer_store';
const CREDENTIALS_KEY = 'lrs_config';
const EXPLORER_CREDENTIALS_KEY = 'lrs_explorer_config';
const EXPLORER_DEVICE_ID_KEY = 'explorer_device_id';
const USER_MODE_KEY = 'active_user_mode';
const FIRST_RUN_CONSENT_KEY = 'first_run_consent_time';
const RESEARCH_LOGGING_CONSENT_KEY = 'research_logging_consent';
const STUDY_ID_KEY = 'participant_study_id';
const CONSENT_STATE_KEY = 'research_consent_state';
const EXPLORER_HISTORY_KEY = 'explorer_search_history';

export type UserRoleMode = 'explorer' | 'researcher';

/**
 * Hosted S3A LRS Base URL.
 * Set in one single configuration constant.
 * Localhost is kept only as an optional development override (e.g., via settings or VITE_DEV_LRS_ENDPOINT).
 */
export const HOSTED_LRS_BASE_ENDPOINT = 'https://34.74.163.88.sslip.io/xapi';

/**
 * Returns the default S3A LRS endpoint for the application.
 * Default is the hosted production server https://34.74.163.88.sslip.io/xapi.
 * Supports optional dev override via env var VITE_DEV_LRS_ENDPOINT or VITE_LRS_ENDPOINT.
 */
export function getDefaultLrsEndpoint(): string {
  // Optional dev environment override
  const envEndpoint = (typeof import.meta !== 'undefined' && (import.meta as any).env)
    ? ((import.meta as any).env.VITE_DEV_LRS_ENDPOINT || (import.meta as any).env.VITE_LRS_ENDPOINT)
    : undefined;
  if (envEndpoint && typeof envEndpoint === 'string' && envEndpoint.trim()) {
    return envEndpoint.trim();
  }
  return HOSTED_LRS_BASE_ENDPOINT;
}

export const DEFAULT_LRS_ENDPOINT = getDefaultLrsEndpoint();

/**
 * Helper to get default credentials from environment or defaults without hardcoding secrets in source.
 */
export function getEnvLrsCredentials(target: 'explorer' | 'researcher'): { username: string; password: string; authHeader?: string } {
  const env = (typeof import.meta !== 'undefined' && (import.meta as any).env) ? (import.meta as any).env : {};
  
  // Direct LRS auth token / header from env / secrets
  const rawAuth = env.VITE_LRS_AUTH || env.VITE_LRS_AUTHORIZATION || '';
  if (rawAuth && typeof rawAuth === 'string') {
    const trimmed = rawAuth.trim();
    if (trimmed.startsWith('Basic ') || trimmed.startsWith('Bearer ')) {
      return { username: '', password: '', authHeader: trimmed };
    }
    if (trimmed.includes(':')) {
      const [u, ...p] = trimmed.split(':');
      return { username: u.trim(), password: p.join(':').trim() };
    }
  }

  if (target === 'explorer') {
    const username = env.VITE_EXPLORER_LRS_USERNAME || env.VITE_LRS_USERNAME || '';
    const password = env.VITE_EXPLORER_LRS_PASSWORD || env.VITE_LRS_PASSWORD || '';
    return { username: username.trim(), password: password.trim() };
  }

  const username = env.VITE_RESEARCHER_LRS_USERNAME || env.VITE_LRS_USERNAME || '';
  const password = env.VITE_RESEARCHER_LRS_PASSWORD || env.VITE_LRS_PASSWORD || '';
  return { username: username.trim(), password: password.trim() };
}

/**
 * Checks whether valid LRS credentials are configured in the environment or storage.
 * Never sends incomplete or unauthenticated requests that return 401.
 */
export function hasConfiguredLrsCredentials(creds?: LrsCredentials): boolean {
  if (!creds) return false;
  if ((creds as any).authHeader && typeof (creds as any).authHeader === 'string' && (creds as any).authHeader.trim()) {
    return true;
  }
  return Boolean(creds.username && creds.password && creds.username.trim() && creds.password.trim());
}

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e: IDBVersionChangeEvent) => {
      const db = req.result;
      
      // Existing WASM snapshot store
      if (!db.objectStoreNames.contains('snapshot_store')) {
        db.createObjectStore('snapshot_store');
      }

      // New stores for LRS Integration
      if (!db.objectStoreNames.contains(CREDENTIALS_STORE)) {
        db.createObjectStore(CREDENTIALS_STORE);
      }

      if (!db.objectStoreNames.contains(OUTBOX_STORE)) {
        db.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(REJECTED_STORE)) {
        db.createObjectStore(REJECTED_STORE, { keyPath: 'id', autoIncrement: true });
      }

      if (!db.objectStoreNames.contains(BUFFER_STORE)) {
        db.createObjectStore(BUFFER_STORE, { keyPath: 'id', autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Normalizes an LRS endpoint to always have a trailing slash
 */
export function normalizeLrsEndpoint(endpoint?: string): string {
  let ep = (endpoint || '').trim();
  if (!ep) ep = getDefaultLrsEndpoint();

  // If the endpoint is pointing to localhost:8080 but the current app is not running locally on port 8080,
  // migrate to the hosted LRS endpoint so requests don't fail with "Failed to fetch"
  if (ep.includes('localhost:8080') && typeof window !== 'undefined' && window.location && !window.location.host.includes('8080') && !window.location.host.includes('localhost')) {
    ep = getDefaultLrsEndpoint();
  }

  // If relative path like '/xapi/'
  if (ep.startsWith('/')) {
    const origin = typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:3000';
    ep = `${origin}${ep}`;
  }

  if (!ep.endsWith('/')) ep += '/';
  return ep;
}

/**
 * Retrieve LRS credentials from IndexedDB.
 * Defaults to https://34.74.163.88.sslip.io/xapi/ with "researcher" account if not configured.
 */
export async function getLrsCredentials(): Promise<LrsCredentials & { authHeader?: string }> {
  const envCreds = getEnvLrsCredentials('researcher');
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(CREDENTIALS_KEY);

      req.onsuccess = () => {
        const val = req.result as (LrsCredentials & { authHeader?: string }) | undefined;
        if (val && val.endpoint) {
          resolve({
            endpoint: normalizeLrsEndpoint(val.endpoint),
            username: val.username || envCreds.username,
            password: val.password || envCreds.password,
            authHeader: val.authHeader || envCreds.authHeader
          });
        } else {
          resolve({
            endpoint: DEFAULT_LRS_ENDPOINT,
            username: val?.username || envCreds.username,
            password: val?.password || envCreds.password,
            authHeader: val?.authHeader || envCreds.authHeader
          });
        }
      };

      req.onerror = () => {
        resolve({
          endpoint: DEFAULT_LRS_ENDPOINT,
          username: envCreds.username,
          password: envCreds.password,
          authHeader: envCreds.authHeader
        });
      };
    });
  } catch (err) {
    return {
      endpoint: DEFAULT_LRS_ENDPOINT,
      username: envCreds.username,
      password: envCreds.password,
      authHeader: envCreds.authHeader
    };
  }
}

/**
 * Save LRS credentials securely to IndexedDB.
 */
export async function saveLrsCredentials(creds: LrsCredentials): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const sanitized: LrsCredentials = {
      endpoint: normalizeLrsEndpoint(creds.endpoint),
      username: (creds.username || '').trim(),
      password: creds.password || ''
    };
    const req = store.put(sanitized, CREDENTIALS_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieve Explorer mode LRS credentials.
 * Defaults to "explorer" account and env password if not configured.
 */
export async function getExplorerCredentials(): Promise<LrsCredentials> {
  const envCreds = getEnvLrsCredentials('explorer');
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(EXPLORER_CREDENTIALS_KEY);

      req.onsuccess = () => {
        const val = req.result as LrsCredentials | undefined;
        if (val && (val.endpoint || val.username || val.password)) {
          resolve({
            endpoint: normalizeLrsEndpoint(val.endpoint),
            username: val.username || envCreds.username,
            password: val.password || envCreds.password
          });
        } else {
          resolve({
            endpoint: DEFAULT_LRS_ENDPOINT,
            username: val?.username || envCreds.username,
            password: val?.password || envCreds.password
          });
        }
      };

      req.onerror = () => {
        resolve({
          endpoint: DEFAULT_LRS_ENDPOINT,
          username: envCreds.username,
          password: envCreds.password
        });
      };
    });
  } catch {
    return {
      endpoint: DEFAULT_LRS_ENDPOINT,
      username: envCreds.username,
      password: envCreds.password
    };
  }
}

/**
 * Save Explorer mode LRS credentials securely to IndexedDB.
 */
export async function saveExplorerCredentials(creds: LrsCredentials): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const sanitized: LrsCredentials = {
      endpoint: normalizeLrsEndpoint(creds.endpoint),
      username: (creds.username || '').trim(),
      password: creds.password || ''
    };
    const req = store.put(sanitized, EXPLORER_CREDENTIALS_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().toLowerCase();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function hexToDashedUuid(hex: string): string {
  if (!hex) return '';
  const clean = hex.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (clean.length === 32) {
    return `${clean.slice(0, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}-${clean.slice(16, 20)}-${clean.slice(20, 32)}`;
  }
  return hex;
}

/**
 * Gets or creates the anonymous random UUID v4 device ID for Explorer mode.
 * Stored in IndexedDB only, never contains name or email.
 */
export async function getExplorerDeviceId(): Promise<string> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(EXPLORER_DEVICE_ID_KEY);

      req.onsuccess = () => {
        if (req.result && typeof req.result === 'string') {
          resolve(req.result);
        } else {
          const newId = generateUuidV4();
          store.put(newId, EXPLORER_DEVICE_ID_KEY);
          resolve(newId);
        }
      };

      req.onerror = () => {
        resolve(generateUuidV4());
      };
    });
  } catch {
    return generateUuidV4();
  }
}

/**
 * Regenerates a fresh UUID v4 device ID after "Delete my data".
 */
export async function regenerateExplorerDeviceId(): Promise<string> {
  const db = await openIdb();
  const newId = generateUuidV4();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(newId, EXPLORER_DEVICE_ID_KEY);
    req.onsuccess = () => resolve(newId);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves the active user mode: 'explorer' | 'researcher'.
 * Default for new users: 'explorer'.
 */
export async function getUserMode(): Promise<UserRoleMode> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(USER_MODE_KEY);
      req.onsuccess = () => {
        // Default for new users is 'explorer'
        resolve((req.result as UserRoleMode) || 'explorer');
      };
      req.onerror = () => resolve('explorer');
    });
  } catch {
    return 'explorer';
  }
}

/**
 * Saves the active user mode: 'explorer' | 'researcher'.
 */
export async function saveUserMode(mode: UserRoleMode): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(mode, USER_MODE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Gets first-run consent timestamp if user has acknowledged the notice.
 */
export async function getFirstRunConsentTime(): Promise<string | null> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(FIRST_RUN_CONSENT_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Stores the first-run consent timestamp.
 */
export async function saveFirstRunConsentTime(time = new Date().toISOString()): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(time, FIRST_RUN_CONSENT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Checks if the user has consented to research logging.
 * Tracing is OFF by default and only turns on for enrolled study participants who consent.
 */
export async function getResearchLoggingConsent(): Promise<boolean> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(RESEARCH_LOGGING_CONSENT_KEY);
      req.onsuccess = () => {
        resolve(req.result === true);
      };
      req.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

/**
 * Stores explicit research logging consent.
 */
export async function setResearchLoggingConsent(consented: boolean): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(consented, RESEARCH_LOGGING_CONSENT_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Retrieves the enrolled participant's real study ID.
 */
export async function getParticipantStudyId(): Promise<string> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(STUDY_ID_KEY);
      req.onsuccess = () => resolve(typeof req.result === 'string' ? req.result : '');
      req.onerror = () => resolve('');
    });
  } catch {
    return '';
  }
}

/**
 * Persists the enrolled participant's study ID.
 */
export async function saveParticipantStudyId(studyId: string): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(studyId.trim(), STUDY_ID_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Gets the persisted consent state ("none" | "granted" | "withdrawn").
 */
export async function getStoredConsentState(): Promise<'none' | 'granted' | 'withdrawn'> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(CONSENT_STATE_KEY);
      req.onsuccess = () => {
        if (req.result === 'granted' || req.result === 'withdrawn' || req.result === 'none') {
          resolve(req.result);
        } else {
          resolve('none');
        }
      };
      req.onerror = () => resolve('none');
    });
  } catch {
    return 'none';
  }
}

/**
 * Stores the consent state.
 */
export async function saveStoredConsentState(state: 'none' | 'granted' | 'withdrawn'): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
    const store = tx.objectStore(CREDENTIALS_STORE);
    const req = store.put(state, CONSENT_STATE_KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/**
 * Past Explorer search queries for transition to Researcher mode.
 */
export async function getPastExplorerSearches(): Promise<string[]> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readonly');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.get(EXPLORER_HISTORY_KEY);
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function addPastExplorerSearch(query: string): Promise<void> {
  if (!query || !query.trim()) return;
  const q = query.trim();
  try {
    const db = await openIdb();
    const existing = await getPastExplorerSearches();
    const updated = [q, ...existing.filter(item => item.toLowerCase() !== q.toLowerCase())].slice(0, 30);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.put(updated, EXPLORER_HISTORY_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn('[Explorer History] Failed to store query:', err);
  }
}

export async function clearPastExplorerSearches(): Promise<void> {
  try {
    const db = await openIdb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(CREDENTIALS_STORE, 'readwrite');
      const store = tx.objectStore(CREDENTIALS_STORE);
      const req = store.delete(EXPLORER_HISTORY_KEY);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {}
}

/**
 * Append an xAPI statement to the outbox queue.
 */
export async function enqueueOutboxStatement(
  statement: any,
  sessionUuid: string
): Promise<number> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    const item: QueuedStatementItem = {
      statementId: statement.id,
      statement,
      createdAt: new Date().toISOString(),
      attempts: 0,
      targetSessionUuid: sessionUuid
    };
    const req = store.add(item);
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Fetch all queued statements in FIFO order.
 */
export async function getQueuedStatements(limit = 50): Promise<QueuedStatementItem[]> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readonly');
    const store = tx.objectStore(OUTBOX_STORE);
    const req = store.openCursor();
    const results: QueuedStatementItem[] = [];

    req.onsuccess = (e) => {
      const cursor = (e.target as IDBRequest).result as IDBCursorWithValue | null;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Get total count of queued statements in outbox.
 */
export async function getOutboxQueueCount(): Promise<number> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(OUTBOX_STORE, 'readonly');
      const store = tx.objectStore(OUTBOX_STORE);
      const req = store.count();
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => resolve(0);
    });
  } catch {
    return 0;
  }
}

/**
 * Remove acknowledged statements from outbox by their DB primary keys.
 */
export async function removeStatementsFromOutbox(ids: number[]): Promise<void> {
  if (!ids || ids.length === 0) return;
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(OUTBOX_STORE, 'readwrite');
    const store = tx.objectStore(OUTBOX_STORE);
    ids.forEach(id => store.delete(id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Record a non-retryable 400 profile violation into the rejected list.
 */
export async function recordRejectedStatement(
  statement: any,
  reason: string,
  outboxKeyToRemove?: number
): Promise<void> {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([REJECTED_STORE, OUTBOX_STORE], 'readwrite');
    const rejectedStore = tx.objectStore(REJECTED_STORE);
    const outboxStore = tx.objectStore(OUTBOX_STORE);

    const rejectedItem: RejectedStatementItem = {
      statementId: statement.id,
      statement,
      reason,
      rejectedAt: new Date().toISOString()
    };
    rejectedStore.add(rejectedItem);

    if (outboxKeyToRemove !== undefined) {
      outboxStore.delete(outboxKeyToRemove);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/**
 * Fetch all rejected statements for review.
 */
export async function getRejectedStatements(): Promise<RejectedStatementItem[]> {
  try {
    const db = await openIdb();
    return new Promise((resolve) => {
      const tx = db.transaction(REJECTED_STORE, 'readonly');
      const store = tx.objectStore(REJECTED_STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}
