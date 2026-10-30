/**
 * "Delete my data": what to ask the server for, given who is signed in and where the LRS is.
 *
 * - This app's own server decides the target from the session (see server/lrsAccess.ts `resolveDeleteTargets`):
 *   a participant's request names no actor and is bound to their sign-in address; naming another actor is refused.
 *   Researchers and admins name the exact actor (here: this device's id). Committee members cannot delete.
 * - A cross-origin LRS (the hosted one) is still called with this device's id and the configured credentials.
 *
 * Old pseudonymous device and study ids cannot be proven to belong to a signed-in person, so a participant's
 * request never carries them. Rows stored under an old id are deleted by a researcher or admin on request
 * (they can name the exact id). The local copy (search history, device id) is always cleared.
 */
import type { UserSession } from '../types';

export type DeletePlan =
  | { kind: 'call'; actorId: string | null }
  | { kind: 'skip'; reason: 'signed_out' | 'committee' };

export function planServerDelete(opts: { sameOrigin: boolean; user: Pick<UserSession, 'role' | 'serverRole'> | null; deviceId: string }): DeletePlan {
  if (!opts.sameOrigin) return { kind: 'call', actorId: opts.deviceId };
  const u = opts.user;
  if (!u) return { kind: 'skip', reason: 'signed_out' };
  if (u.role === 'participant') return { kind: 'call', actorId: null };
  if (u.role === 'committee_member') return { kind: 'skip', reason: 'committee' };
  return { kind: 'call', actorId: opts.deviceId };
}

export function skippedDeleteMessage(reason: 'signed_out' | 'committee'): string {
  return reason === 'signed_out'
    ? 'Your local history and device ID were cleared. Records already on the server were not touched because you are not signed in. Sign in, then use Delete My Data again to remove them.'
    : 'Your local history and device ID were cleared. Committee accounts cannot delete server records; ask the study team to remove them.';
}

export function deletedMessage(count: number | undefined): string {
  return `Deleted ${count ?? 0} statement(s) from the server. Generated new anonymous device ID.`;
}

/** Plain-language reason for a refused delete. */
export function deleteErrorMessage(err: { status?: number; serverMessage?: string; message?: string } | null | undefined): string {
  const status = err?.status;
  if (status === 401) return 'The server did not accept the request as signed in. On this app\'s own server, sign in and try again; for a hosted LRS, check its credentials (a service token cannot delete).';
  if (status === 403) return 'The server did not allow this delete. Participants can delete only the records tied to their own sign-in address.';
  return err?.serverMessage || err?.message || 'Server unreachable';
}
