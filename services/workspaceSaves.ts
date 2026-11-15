/**
 * The two queue writes App.tsx makes, with honest status (fix 2: no silent saves).
 *  - saveQueueChanges: append queue changes to the local IndexedDB log (source of truth).
 *  - saveAccountCopy: PUT the server copy of the workspace (signed-in users only).
 * Each reports to services/saveStatus.ts: 'saved' only after the write confirmed, otherwise "Not saved" + Retry.
 */
import type { ResearchPaper } from '../types';
import { appendWorkspaceRecords, diffQueue } from './localWorkspaceLog';
import { getState, putState, SCHOLAR_WORKSPACE_ACTIVITY_ID, SCHOLAR_WORKSPACE_STATE_ID } from './lrsClient';
import { reportFailed, reportIdle, reportSaved, reportSaving } from './saveStatus';
import { paperFacts, PAPER_FACTS_SCHEMA_VERSION } from './paperFacts';

/** Version of the server copy document. History in docs/data/MIGRATIONS.md. */
export const ACCOUNT_COPY_SCHEMA_VERSION = 1 as const;

/** The server copy document: fact-only papers (no AI scores or summaries), the projects, and a UTC timestamp. */
export function accountCopyDocument(payload: { papers: ResearchPaper[]; projects: unknown[] }, now: Date = new Date()) {
  return {
    schemaVersion: ACCOUNT_COPY_SCHEMA_VERSION,
    paperFactsSchemaVersion: PAPER_FACTS_SCHEMA_VERSION,
    papers: payload.papers.map(p => paperFacts(p)),
    projects: payload.projects,
    lastModified: now.toISOString(),
  };
}

export interface QueueSaveDeps {
  append?: typeof appendWorkspaceRecords;
}

/** Returns the number of records written (0 when nothing changed), or null when the write failed. */
export async function saveQueueChanges(
  recorded: ResearchPaper[],
  target: ResearchPaper[],
  retry: () => void,
  deps: QueueSaveDeps = {},
): Promise<number | null> {
  const entries = diffQueue(recorded, target);
  if (entries.length === 0) return 0;
  reportSaving('local-queue');
  try {
    await (deps.append ?? appendWorkspaceRecords)(entries);
    reportSaved('local-queue');
    return entries.length;
  } catch (err) {
    console.warn('[Local queue] Save failed:', err);
    reportFailed('local-queue', 'The latest selection queue change could not be written to this browser\'s storage.', retry);
    return null;
  }
}

export interface AccountCopyDeps {
  put?: typeof putState;
  get?: typeof getState;
}

export type AccountCopyResult =
  | { state: 'saved'; etag: string | null }
  | { state: 'skipped' }
  | { state: 'error'; status?: number };

/**
 * Saves the server copy. A refusal, conflict or server error is "Not saved"; Retry after a conflict re-reads the
 * current ETag first (this computer's queue is the source of truth, the server keeps a copy of it).
 */
export async function saveAccountCopy(
  payload: { papers: ResearchPaper[]; projects: unknown[] },
  etag: string | null,
  opts: { refreshEtag?: boolean; onRetry: (refreshEtag: boolean) => void },
  deps: AccountCopyDeps = {},
): Promise<AccountCopyResult> {
  const put = deps.put ?? putState;
  const get = deps.get ?? getState;
  reportSaving('server-copy');
  try {
    let ifMatch = etag;
    if (opts.refreshEtag) ifMatch = (await get(SCHOLAR_WORKSPACE_ACTIVITY_ID, SCHOLAR_WORKSPACE_STATE_ID))?.etag ?? null;
    const res = await put(SCHOLAR_WORKSPACE_ACTIVITY_ID, SCHOLAR_WORKSPACE_STATE_ID, accountCopyDocument(payload), ifMatch);
    if (res.skipped) {
      // No server session (local identity only): there is no account copy, which is not a failure.
      reportIdle('server-copy');
      return { state: 'skipped' };
    }
    reportSaved('server-copy');
    return { state: 'saved', etag: res.etag ?? ifMatch };
  } catch (err: any) {
    console.warn('[Workspace LRS State] Save failed:', err);
    const status: number | undefined = typeof err?.status === 'number' ? err.status : undefined;
    const message = status === 401 || status === 403
      ? 'Your sign-in has expired or was refused. Sign in again, then retry.'
      : status === 409
        ? 'The account copy changed elsewhere. Retry saves this computer\'s queue over it.'
        : 'The server did not confirm the save.';
    reportFailed('server-copy', message, () => opts.onRetry(status === 409));
    return { state: 'error', status };
  }
}
