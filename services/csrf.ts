/**
 * Minimal client support for the server's session + CSRF protection (server/auth).
 *
 * Unsafe requests (POST/PUT/PATCH/DELETE) to this app's own server must carry the `X-CSRF-Token` that
 * `GET /api/auth/session` returns for the signed-in user. Without a session there is no token, the header
 * is simply left off and the server answers 401, which callers already treat as a failed request.
 * The full login screen arrives in the next PR; until then there is no way to obtain a session in the UI.
 */

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
let cached: string | null | undefined; // undefined = not fetched yet, null = no session

export function isSameOrigin(url: string): boolean {
  if (typeof window === 'undefined' || !window.location) return true;
  try {
    return new URL(url, window.location.origin).origin === window.location.origin;
  } catch {
    return false;
  }
}

export function isUnsafeMethod(method?: string): boolean {
  return UNSAFE.has((method || 'GET').toUpperCase());
}

export function resetCsrfToken(): void {
  cached = undefined;
}

export async function getCsrfToken(force = false): Promise<string | null> {
  if (!force && cached !== undefined) return cached;
  try {
    const res = await fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (!res.ok) { cached = null; return null; }
    const data = await res.json();
    cached = data?.authenticated && typeof data.csrfToken === 'string' ? data.csrfToken : null;
  } catch {
    cached = null;
  }
  return cached;
}

/** Headers to merge into an unsafe same-origin request ({} when there is no session). */
export async function csrfHeaders(): Promise<Record<string, string>> {
  const token = await getCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}

/** fetch() that adds the CSRF header to unsafe same-origin requests and retries once if the token went stale. */
export async function csrfFetch(input: string, init: RequestInit = {}): Promise<Response> {
  if (!isUnsafeMethod(init.method) || !isSameOrigin(input)) return fetch(input, init);
  const send = async (force: boolean) => {
    const token = await getCsrfToken(force);
    const headers = new Headers(init.headers || {});
    if (token) headers.set('X-CSRF-Token', token);
    return fetch(input, { ...init, headers });
  };
  const res = await send(false);
  if (res.status === 403) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error === 'csrf_check_failed') return send(true);
  }
  return res;
}
