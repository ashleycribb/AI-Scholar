/**
 * Plain-language messages for the two ways the server refuses a signed-in feature:
 * 401 (no session) and 403 (a session whose role may not do this, or a failed CSRF/origin check).
 */
export function statusOf(err: any): number | undefined {
  const s = err?.response?.status ?? err?.status;
  return typeof s === 'number' ? s : undefined;
}

export function accessMessage(status: number | undefined, need: 'researcher' | 'staff' = 'staff'): string | null {
  const who = need === 'researcher' ? 'a researcher account' : 'a researcher or committee account';
  if (status === 401) return `Sign in with ${who} to use this.`;
  if (status === 403) return `Your account does not have access to this. It needs ${who}.`;
  return null;
}

/** Message for a failed call: the access message when the server refused, otherwise the error's own text. */
export function friendlyApiError(err: any, need: 'researcher' | 'staff' = 'staff'): string {
  return accessMessage(statusOf(err), need) || err?.response?.data?.error || err?.message || 'Request failed';
}
