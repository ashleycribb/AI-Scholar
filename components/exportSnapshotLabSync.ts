/**
 * Lab-sync success copy and debug-simulator gating for ExportSnapshotModal.
 * The real success title is used only when a real ingest response was received.
 */

export const REAL_LAB_SYNC_SUCCESS_TITLE = 'Synced to Local Research Lab';
export const SIMULATED_LAB_SYNC_LABEL = 'Simulated';

/** True only when the page URL includes ?debug=1. */
export function isLabSyncDebugEnabled(
  search: string = typeof window !== 'undefined' ? window.location.search : ''
): boolean {
  try {
    return new URLSearchParams(search).get('debug') === '1';
  } catch {
    return false;
  }
}

/**
 * Title for the post-sync banner.
 * Returns the real success title only when a real ingest succeeded.
 * A debug preview is labelled "Simulated" and never uses the real title.
 */
export function labSyncSuccessTitle(opts: {
  realIngestSucceeded: boolean;
  simulated: boolean;
}): string | null {
  if (opts.realIngestSucceeded) return REAL_LAB_SYNC_SUCCESS_TITLE;
  if (opts.simulated) return SIMULATED_LAB_SYNC_LABEL;
  return null;
}

export type LabSyncAction = 'ingest-real' | 'simulated-preview' | 'download-fallback';

/**
 * Decides the primary save action.
 * A debug simulator never triggers a real ingest or a real success state.
 */
export function resolveLabSyncAction(opts: {
  daemonOnline: boolean;
  debugEnabled: boolean;
  simulatedToggle: boolean;
}): LabSyncAction {
  if (opts.daemonOnline) return 'ingest-real';
  if (opts.debugEnabled && opts.simulatedToggle) return 'simulated-preview';
  return 'download-fallback';
}
