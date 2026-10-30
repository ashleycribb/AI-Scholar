/**
 * Study invite links (?studyId=... or ?study=...).
 *
 * An invite link only CAPTURES the study id. It must never open the consent
 * modal and never turn tracing on: the participant opts in later through an
 * explicit control (the "Join study" banner or the "Join a study" button).
 *
 * `captureStudyInviteOnLoad` is deliberately given a single callback that
 * receives the id. It has no way to open a modal, so a future edit cannot
 * make the load path open consent without changing this signature.
 */

const MAX_STUDY_ID_LENGTH = 128;

/** Returns a cleaned study id from a query string, or null when none is usable. */
export function readStudyInviteId(search: string): string | null {
  try {
    const params = new URLSearchParams(search);
    const raw = params.get('studyId') || params.get('study');
    if (!raw) return null;
    const id = raw.trim();
    if (!id || id.length > MAX_STUDY_ID_LENGTH) return null;
    // Control characters have no place in an id that is shown back to the user.
    if (/[\u0000-\u001f\u007f]/.test(id)) return null;
    return id;
  } catch {
    return null;
  }
}

/**
 * Runs on app load. Captures the invite id (if any) and hands it to
 * `onInvite`. Returns the id that was captured, or null.
 */
export function captureStudyInviteOnLoad(
  search: string,
  onInvite: (studyId: string) => void
): string | null {
  const id = readStudyInviteId(search);
  if (id) onInvite(id);
  return id;
}
