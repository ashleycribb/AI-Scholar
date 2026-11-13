import { describe, expect, test } from 'bun:test';
import {
  REAL_LAB_SYNC_SUCCESS_TITLE,
  SIMULATED_LAB_SYNC_LABEL,
  isLabSyncDebugEnabled,
  labSyncSuccessTitle,
  resolveLabSyncAction,
} from './exportSnapshotLabSync';

describe('lab sync success state', () => {
  test('no success state without a real ingest response', () => {
    expect(labSyncSuccessTitle({ realIngestSucceeded: false, simulated: false })).toBeNull();
    expect(labSyncSuccessTitle({ realIngestSucceeded: false, simulated: true })).toBe(SIMULATED_LAB_SYNC_LABEL);
    expect(labSyncSuccessTitle({ realIngestSucceeded: false, simulated: true })).not.toBe(REAL_LAB_SYNC_SUCCESS_TITLE);
    expect(labSyncSuccessTitle({ realIngestSucceeded: false, simulated: true })).not.toContain('Synced to Local Research Lab');
    // Only a real ingest response may use the success title.
    expect(labSyncSuccessTitle({ realIngestSucceeded: true, simulated: false })).toBe(REAL_LAB_SYNC_SUCCESS_TITLE);
    // Even if the debug toggle is on, a real ingest still reports the real title.
    expect(labSyncSuccessTitle({ realIngestSucceeded: true, simulated: true })).toBe(REAL_LAB_SYNC_SUCCESS_TITLE);
  });

  test('the debug simulator is off unless the URL has ?debug=1', () => {
    expect(isLabSyncDebugEnabled('')).toBe(false);
    expect(isLabSyncDebugEnabled('?')).toBe(false);
    expect(isLabSyncDebugEnabled('?debug=0')).toBe(false);
    expect(isLabSyncDebugEnabled('?foo=1')).toBe(false);
    expect(isLabSyncDebugEnabled('?debug=1')).toBe(true);
    expect(isLabSyncDebugEnabled('?tab=export&debug=1')).toBe(true);
  });

  test('a simulated toggle never selects a real ingest when the daemon is offline', () => {
    expect(resolveLabSyncAction({ daemonOnline: false, debugEnabled: false, simulatedToggle: true })).toBe('download-fallback');
    expect(resolveLabSyncAction({ daemonOnline: false, debugEnabled: true, simulatedToggle: false })).toBe('download-fallback');
    expect(resolveLabSyncAction({ daemonOnline: false, debugEnabled: true, simulatedToggle: true })).toBe('simulated-preview');
    expect(resolveLabSyncAction({ daemonOnline: true, debugEnabled: true, simulatedToggle: true })).toBe('ingest-real');
    expect(resolveLabSyncAction({ daemonOnline: true, debugEnabled: false, simulatedToggle: false })).toBe('ingest-real');
  });
});

describe('ExportSnapshotModal production UI', () => {
  test('the modal cannot show the real success title without a real ingest response', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const modal = readFileSync(join(import.meta.dir, 'ExportSnapshotModal.tsx'), 'utf8');

    // No fabricated ingest payload, and no production "Simulate Online" control.
    expect(modal).not.toContain('Session streamed successfully into local S3A high-performance database.');
    expect(modal).not.toContain('Simulate Online');
    expect(modal).not.toContain('setSimulatedOnlineMode');

    // The real success title is not hardcoded in the banner; it comes from labSyncSuccessTitle,
    // which requires a real ingest response (syncResult !== null).
    expect(modal).toContain('labSyncSuccessTitle');
    expect(modal).toContain('realIngestSucceeded: syncResult !== null');
    expect(modal).toMatch(/if \(onSyncSuccess\) onSyncSuccess\(response\)/);
    expect(modal).toContain('action === \'simulated-preview\'');
    expect(modal).toContain('debugEnabled && (');
  });
});
