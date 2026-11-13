/**
 * Live localhost lab handoff (http://127.0.0.1:8080) and origin gating.
 * Kept free of the WASM export path so unit tests can import it without
 * loading the S3A wasm module.
 */
export interface S3APaperPayload {
  title: string;
  doi?: string;
  year?: number | string;
  authors?: string[] | string;
  abstract?: string;
  source_service?: string;
  open_access_pdf_url?: string;
}

export interface S3ASnapshotPayload {
  query: string;
  query_settings?: Record<string, any>;
  services?: string[];
  selected_work_ids?: string[];
  papers: S3APaperPayload[];
  retrieved_at?: string;
  provenance?: {
    app: string;
    version?: string;
    mode?: string;
  };
}

export interface S3AHealthResponse {
  status: string;
  service: string;
  version: string;
  capabilities: string[];
}

export interface S3AIngestResponse {
  status: 'success' | 'error';
  message: string;
  target_db: string;
  ingested_papers: number;
  query: string;
}

export const S3A_LOCAL_BASE = 'http://127.0.0.1:8080';
export const DEFAULT_S3A_LOCAL_BASE = S3A_LOCAL_BASE;
export const DEFAULT_TARGET_DB = 'scholar_live_lab.s3a';

export const HOSTED_LAB_DOWNLOAD_LABEL = 'Download for your local lab';
export const HOSTED_LAB_HANDOFF_HINT =
  'Download the .s3a file, then import it into your local lab (for example scholar_live_lab.s3a).';

export type PageOrigin = { protocol: string; hostname: string };

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);

/** Current page origin, or empty values when there is no window (tests, SSR). */
export function getPageOrigin(): PageOrigin {
  if (typeof window !== 'undefined' && window.location) {
    return { protocol: window.location.protocol, hostname: window.location.hostname };
  }
  return { protocol: '', hostname: '' };
}

/**
 * Live localhost ingest is allowed only when this app is served on
 * http://localhost, http://127.0.0.1, or http://[::1].
 * https origins (including https://localhost and scholar-explorer.ai.studio)
 * must not fetch http://127.0.0.1:8080.
 */
export function isLiveLabHandoffAvailable(origin: PageOrigin = getPageOrigin()): boolean {
  if (origin.protocol !== 'http:') return false;
  const host = (origin.hostname || '').replace(/^\[|\]$/g, '').toLowerCase();
  return LOOPBACK_HOSTS.has(host);
}

const STORAGE_KEY_BASE = 's3a_local_bridge_base_url';
const STORAGE_KEY_TARGET_DB = 's3a_local_bridge_target_db';

export function getS3ABaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_BASE);
    if (saved && saved.trim()) return saved.trim();
  }
  return S3A_LOCAL_BASE;
}

export function setS3ABaseUrl(url: string): void {
  if (typeof window !== 'undefined') {
    const cleaned = url.trim().replace(/\/+$/, '');
    localStorage.setItem(STORAGE_KEY_BASE, cleaned || S3A_LOCAL_BASE);
    notifyStatusChange();
  }
}

export function getS3ATargetDb(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY_TARGET_DB);
    if (saved && saved.trim()) return saved.trim();
  }
  return DEFAULT_TARGET_DB;
}

export function setS3ATargetDb(db: string): void {
  if (typeof window !== 'undefined') {
    const cleaned = db.trim() || DEFAULT_TARGET_DB;
    localStorage.setItem(STORAGE_KEY_TARGET_DB, cleaned);
    notifyStatusChange();
  }
}

export interface S3AHealthResult {
  isOnline: boolean;
  latencyMs?: number;
  info?: S3AHealthResponse;
  error?: string;
  timestamp: string;
}

export let lastKnownHealth: S3AHealthResult = {
  isOnline: false,
  timestamp: new Date().toISOString()
};

export const listeners = new Set<() => void>();

export function getLastKnownHealth(): S3AHealthResult {
  return lastKnownHealth;
}

export function setLastKnownHealth(next: S3AHealthResult): void {
  lastKnownHealth = next;
  notifyStatusChange();
}

function notifyStatusChange() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

/**
 * Checks if the S3A Local Lab daemon is running on localhost (timeout: 800ms).
 * Does not fetch when live handoff is unavailable (https / non-localhost origins).
 */
export async function checkS3ALocalHealth(origin: PageOrigin = getPageOrigin()): Promise<boolean> {
  if (!isLiveLabHandoffAvailable(origin)) {
    lastKnownHealth = {
      isOnline: false,
      timestamp: new Date().toISOString()
    };
    notifyStatusChange();
    return false;
  }

  const baseUrl = getS3ABaseUrl();
  const startTime = performance.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 800);

    const res = await fetch(`${baseUrl}/api/health`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const latencyMs = Math.round(performance.now() - startTime);

    if (!res.ok) {
      lastKnownHealth = {
        isOnline: false,
        latencyMs,
        error: `HTTP ${res.status}`,
        timestamp: new Date().toISOString()
      };
      notifyStatusChange();
      return false;
    }

    const data: S3AHealthResponse = await res.json();
    const isOnline = data.status === 'online' && data.service === 's3a-storage-engine';

    lastKnownHealth = {
      isOnline: Boolean(isOnline),
      latencyMs,
      info: data,
      timestamp: new Date().toISOString()
    };
    notifyStatusChange();
    return isOnline;
  } catch (err: any) {
    lastKnownHealth = {
      isOnline: false,
      latencyMs: Math.round(performance.now() - startTime),
      error: err.name === 'AbortError' ? 'Connection timed out (800ms)' : (err.message || 'Offline'),
      timestamp: new Date().toISOString()
    };
    notifyStatusChange();
    return false;
  }
}

/**
 * Streams research papers and query context directly into the local S3A engine.
 */
export async function syncToS3ALocalLab(
  payload: S3ASnapshotPayload,
  targetDb: string = 'scholar_live_lab.s3a',
  origin: PageOrigin = getPageOrigin()
): Promise<S3AIngestResponse> {
  if (!isLiveLabHandoffAvailable(origin)) {
    throw new Error('Live lab ingest is only available when Scholar Explorer runs on http://localhost');
  }

  const baseUrl = getS3ABaseUrl();
  const url = `${baseUrl}/api/snapshot/ingest?target_db=${encodeURIComponent(targetDb)}`;
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload),
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    throw new Error(`S3A Ingest failed with HTTP ${res.status}`);
  }

  return await res.json();
}

