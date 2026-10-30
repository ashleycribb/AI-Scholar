/**
 * S3A Local Research Lab Bridge Service
 * 
 * Provides Zotero-Connector-style direct streaming to the researcher's local
 * S3A high-performance database daemon running at http://127.0.0.1:8080.
 * Falls back gracefully to portable .snapshot.s3a or .json files when the local daemon is offline.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ResearchPaper } from '../types';
import { exportS3ASession } from './s3aWasmService';

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

let lastKnownHealth: S3AHealthResult = {
  isOnline: false,
  timestamp: new Date().toISOString()
};

const listeners = new Set<() => void>();

function notifyStatusChange() {
  listeners.forEach(fn => {
    try { fn(); } catch { /* ignore */ }
  });
}

/**
 * Checks if the S3A Local Lab daemon is running on localhost (timeout: 800ms).
 */
export async function checkS3ALocalHealth(): Promise<boolean> {
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
  targetDb: string = 'scholar_live_lab.s3a'
): Promise<S3AIngestResponse> {
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

/**
 * Converts Scholar Explorer ResearchPaper models to the S3A Snapshot specification.
 */
export function convertPapersToS3APayload(
  papers: ResearchPaper[],
  query: string = '',
  settings?: Record<string, any>,
  services?: string[]
): S3ASnapshotPayload {
  return {
    query: query || 'Scholarly Research Session',
    query_settings: settings || {},
    services: services || ['openalex', 'semantic_scholar', 'crossref'],
    selected_work_ids: papers.map(p => p.id),
    papers: papers.map(p => ({
      title: p.title,
      doi: p.doi || undefined,
      year: p.year || undefined,
      authors: p.authors ? (typeof p.authors === 'string' ? p.authors.split(',').map(a => a.trim()) : p.authors) : undefined,
      abstract: p.abstract || undefined,
      source_service: p.enrichmentSource || 'Scholar Explorer',
      open_access_pdf_url: p.pdfURL || undefined
    })),
    retrieved_at: new Date().toISOString(),
    provenance: {
      app: 'Scholar Explorer Research OS',
      version: '2.4.0',
      mode: 's3a-connector'
    }
  };
}

/**
 * Builds the standard export base filename `scholar-<name>-<YYYY-MM-DD>`
 * where `<name>` is a slug of the project name or search query and `<YYYY-MM-DD>` is the local date.
 */
export function buildScholarExportBaseName(rawName?: string): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const dateStr = `${yyyy}-${mm}-${dd}`;

  const raw = (rawName || 'research-session').trim();
  const stripped = raw
    .replace(/(\.snapshot)?\.(s3a|json)$/i, '')
    .replace(/^scholar[-_]+/i, '')
    .replace(/[-_]+\d{4}-\d{2}-\d{2}$/, '');
  const slug = stripped
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'research-session';

  return `scholar-${slug}-${dateStr}`;
}

/**
 * Generates and triggers download of a genuine binary S3A snapshot (.s3a)
 * produced by the S3A engine (export_bytes), checked with from_bytes, and saved as application/octet-stream,
 * or downloads the JSON contract (.json) using the same `scholar-<name>-<YYYY-MM-DD>` base name.
 */
export async function downloadFallbackSnapshot(
  payload: S3ASnapshotPayload,
  fileName: string = 'research-session',
  format: 's3a' | 'json' = 's3a'
): Promise<string> {
  const baseName = buildScholarExportBaseName(fileName || payload.query || 'research-session');
  if (format === 'json') {
    const jsonFilename = `${baseName}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = jsonFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return jsonFilename;
  }

  const result = await exportS3ASession({
    projectOrSessionName: baseName
  });
  return result.filename;
}

/**
 * React hook to observe S3A daemon status in real-time across the app.
 */
export function useS3ABridgeStatus(checkIntervalMs: number = 20000) {
  const [status, setStatus] = useState<S3AHealthResult>(lastKnownHealth);
  const [isChecking, setIsChecking] = useState(false);
  const [baseUrl, setBaseUrlState] = useState(getS3ABaseUrl());
  const [targetDb, setTargetDbState] = useState(getS3ATargetDb());

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const isOnline = await checkS3ALocalHealth();
      setStatus({ ...lastKnownHealth, isOnline });
      return isOnline;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    // Initial check
    checkStatus();

    const updateFromService = () => {
      setStatus(lastKnownHealth);
      setBaseUrlState(getS3ABaseUrl());
      setTargetDbState(getS3ATargetDb());
    };

    listeners.add(updateFromService);

    // Periodic check
    const interval = setInterval(() => {
      checkStatus();
    }, checkIntervalMs);

    // Check on window focus
    const onFocus = () => checkStatus();
    window.addEventListener('focus', onFocus);

    return () => {
      listeners.delete(updateFromService);
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [checkIntervalMs, checkStatus]);

  const updateBaseUrl = useCallback((url: string) => {
    setS3ABaseUrl(url);
    setBaseUrlState(url);
    checkStatus();
  }, [checkStatus]);

  const updateTargetDb = useCallback((db: string) => {
    setS3ATargetDb(db);
    setTargetDbState(db);
  }, []);

  return {
    isOnline: status.isOnline,
    isChecking,
    latencyMs: status.latencyMs,
    info: status.info,
    error: status.error,
    lastChecked: status.timestamp,
    baseUrl,
    targetDb,
    updateBaseUrl,
    updateTargetDb,
    checkStatus
  };
}
