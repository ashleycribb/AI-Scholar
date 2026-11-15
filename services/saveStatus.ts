/**
 * Save status for every place Explorer writes research data (fix 2: no silent saves).
 *
 * A channel only becomes 'saved' after the write it tracks has confirmed. Any failure becomes 'error' with a
 * Retry action, and the UI shows "Not saved" for it until a retry succeeds. Nothing here guesses or assumes.
 */
export type SaveChannel = 'local-queue' | 'local-decisions' | 'server-copy' | 'session-cache';
export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface ChannelStatus {
  state: SaveState;
  /** Plain-language reason, shown next to "Not saved". */
  message?: string;
  retry?: () => void;
  /** UTC ISO time of the last change. */
  at?: string;
}

export const CHANNEL_LABELS: Record<SaveChannel, string> = {
  'local-queue': 'Selection queue on this computer',
  'local-decisions': 'Your keep/drop decision on this computer',
  'server-copy': 'Copy in your account (server)',
  'session-cache': 'S3A session copy on this computer',
};

type Snapshot = Readonly<Record<SaveChannel, ChannelStatus>>;

const initial = (): Snapshot => ({
  'local-queue': { state: 'idle' },
  'local-decisions': { state: 'idle' },
  'server-copy': { state: 'idle' },
  'session-cache': { state: 'idle' },
});

let snapshot: Snapshot = initial();
const listeners = new Set<() => void>();

function set(channel: SaveChannel, status: ChannelStatus): void {
  snapshot = { ...snapshot, [channel]: { ...status, at: new Date().toISOString() } };
  listeners.forEach(l => l());
}

export function getSaveStatus(): Snapshot {
  return snapshot;
}

export function subscribeSaveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reportSaving(channel: SaveChannel): void {
  // Keep an existing error visible while a retry is running; it clears only when the write confirms.
  if (snapshot[channel].state === 'error') return;
  set(channel, { state: 'saving' });
}

export function reportSaved(channel: SaveChannel): void {
  set(channel, { state: 'saved' });
}

export function reportFailed(channel: SaveChannel, message: string, retry?: () => void): void {
  set(channel, { state: 'error', message, retry });
}

/** Back to 'idle', e.g. when a write was skipped on purpose (signed out: there is no account copy to save). */
export function reportIdle(channel: SaveChannel): void {
  set(channel, { state: 'idle' });
}

/** Channels currently failing, in a stable order. */
export function failedChannels(s: Snapshot = snapshot): Array<{ channel: SaveChannel; status: ChannelStatus }> {
  return (Object.keys(s) as SaveChannel[]).filter(c => s[c].state === 'error').map(c => ({ channel: c, status: s[c] }));
}

/** Test seam: forget all status. */
export function resetSaveStatus(): void {
  snapshot = initial();
  listeners.forEach(l => l());
}
