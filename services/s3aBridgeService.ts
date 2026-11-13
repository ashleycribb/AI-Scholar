/**
 * S3A Local Research Lab Bridge Service
 *
 * Live streaming to the local daemon at http://127.0.0.1:8080 is used only when
 * Scholar Explorer itself is served on localhost over http (local dev).
 * From an https origin the browser would block those requests (mixed content),
 * so the portable .s3a download is the handoff.
 */

import { useState, useEffect, useCallback } from 'react';
import type { ResearchPaper } from '../types';
import { exportS3ASession, stageQueuePapersInSession } from './s3aWasmService';

export {
  S3A_LOCAL_BASE,
  DEFAULT_S3A_LOCAL_BASE,
  DEFAULT_TARGET_DB,
  HOSTED_LAB_DOWNLOAD_LABEL,
  HOSTED_LAB_HANDOFF_HINT,
  getPageOrigin,
  isLiveLabHandoffAvailable,
  getS3ABaseUrl,
  setS3ABaseUrl,
  getS3ATargetDb,
  setS3ATargetDb,
  checkS3ALocalHealth,
  syncToS3ALocalLab,
  lastKnownHealth,
  listeners,
} from './s3aLiveLabHandoff';
export type {
  S3APaperPayload,
  S3ASnapshotPayload,
  S3AHealthResponse,
  S3AIngestResponse,
  S3AHealthResult,
  PageOrigin,
} from './s3aLiveLabHandoff';

import {
  checkS3ALocalHealth,
  getLastKnownHealth,
  getS3ABaseUrl,
  getS3ATargetDb,
  isLiveLabHandoffAvailable,
  listeners,
  setLastKnownHealth,
  setS3ABaseUrl,
  setS3ATargetDb,
} from './s3aLiveLabHandoff';
import type { S3AHealthResult, S3ASnapshotPayload } from './s3aLiveLabHandoff';

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
 * Reconstructs ResearchPaper records from an S3A snapshot payload so a
 * download can be built from the current selection queue (including papers
 * that were restored into the queue but never restaged into the WASM session).
 */
export function researchPapersFromSnapshotPayload(payload: S3ASnapshotPayload): ResearchPaper[] {
  const ids = Array.isArray(payload.selected_work_ids) ? payload.selected_work_ids : [];
  return (payload.papers || []).map((p, i) => {
    const id = (ids[i] && String(ids[i]).trim()) || (p.doi ? String(p.doi) : '') || p.title;
    const authors = Array.isArray(p.authors)
      ? p.authors.join(', ')
      : (typeof p.authors === 'string' ? p.authors : '');
    const yearRaw = p.year;
    const year = typeof yearRaw === 'number' && Number.isFinite(yearRaw)
      ? Math.floor(yearRaw)
      : (typeof yearRaw === 'string' ? parseInt(yearRaw, 10) || 0 : 0);
    return {
      id,
      openalex_id: ids[i] || undefined,
      title: p.title,
      doi: p.doi,
      year,
      authors,
      abstract: p.abstract || '',
      pdfURL: p.open_access_pdf_url,
    };
  });
}

/**
 * Stages every paper in the payload into the WASM session (without recording
 * new inclusion statements) and exports a real .s3a snapshot. Used by the
 * portable download path so a restored queue is not omitted.
 */
export async function exportS3ASnapshotFromPayload(
  payload: S3ASnapshotPayload,
  fileName?: string
): Promise<{ filename: string; bytes: Uint8Array; warnings: string[] }> {
  const papers = researchPapersFromSnapshotPayload(payload);
  await stageQueuePapersInSession(papers, { recordInclusionStatement: false });
  const baseName = buildScholarExportBaseName(fileName || payload.query || 'research-session');
  return exportS3ASession({ projectOrSessionName: baseName });
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

  const result = await exportS3ASnapshotFromPayload(payload, fileName || payload.query || 'research-session');
  return result.filename;
}

/**
 * React hook to observe S3A daemon status in real-time across the app.
 */
export function useS3ABridgeStatus(checkIntervalMs: number = 20000) {
  const [status, setStatus] = useState<S3AHealthResult>(getLastKnownHealth());
  const [isChecking, setIsChecking] = useState(false);
  const [baseUrl, setBaseUrlState] = useState(getS3ABaseUrl());
  const [targetDb, setTargetDbState] = useState(getS3ATargetDb());

  const checkStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const isOnline = await checkS3ALocalHealth();
      setStatus({ ...getLastKnownHealth(), isOnline });
      return isOnline;
    } finally {
      setIsChecking(false);
    }
  }, []);

  useEffect(() => {
    const updateFromService = () => {
      setStatus(getLastKnownHealth());
      setBaseUrlState(getS3ABaseUrl());
      setTargetDbState(getS3ATargetDb());
    };

    listeners.add(updateFromService);

    if (!isLiveLabHandoffAvailable()) {
      const skipped = {
        isOnline: false,
        timestamp: new Date().toISOString()
      };
      setLastKnownHealth(skipped);
      setStatus(skipped);
      return () => {
        listeners.delete(updateFromService);
      };
    }

    checkStatus();

    const interval = setInterval(() => {
      checkStatus();
    }, checkIntervalMs);

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
