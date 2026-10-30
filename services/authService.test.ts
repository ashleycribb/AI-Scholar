import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import {
  __createAuthServiceForTests,
  buildSession,
  clientRoleFor,
  loadLocalIdentity,
  IDENTITY_STORAGE_KEY,
  SIGNIN_REQUESTED_KEY,
  USER_STORAGE_KEY,
} from './authService';
import { csrfHeaders, resetCsrfToken } from './csrf';

const g = globalThis as any;
const realFetch = globalThis.fetch;

class MemoryStorage {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, String(v)); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
  key(i: number) { return [...this.m.keys()][i] ?? null; }
}

interface Call { url: string; init: RequestInit }
let calls: Call[] = [];
let handler: (url: string, init: RequestInit) => Response | Promise<Response>;
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

beforeEach(() => {
  g.localStorage = new MemoryStorage();
  g.window = { location: { origin: 'https://app.example' } };
  resetCsrfToken();
  calls = [];
  handler = () => json({ authenticated: false });
  g.fetch = async (input: any, init: RequestInit = {}) => {
    calls.push({ url: String(input), init });
    return handler(String(input), init);
  };
});
afterEach(() => { g.fetch = realFetch; delete g.window; delete g.localStorage; });

const sessionBody = (email: string, role: string, csrfToken = 'csrf-1') =>
  ({ authenticated: true, user: { email, role }, csrfToken, expiresAt: 1_900_000_000_000 });

describe('role comes only from the server session', () => {
  test('server roles map to the client tiers', () => {
    expect(clientRoleFor('participant')).toBe('participant');
    expect(clientRoleFor('researcher')).toBe('pi_researcher');
    expect(clientRoleFor('admin')).toBe('pi_researcher');
    expect(clientRoleFor('committee')).toBe('committee_member');
  });

  test('refresh builds the user from the server answer and keeps the address in memory only', async () => {
    handler = () => json(sessionBody('Pi@Uni.edu'.toLowerCase(), 'researcher'));
    const auth = __createAuthServiceForTests();
    const user = await auth.refresh();
    expect(user?.role).toBe('pi_researcher');
    expect(user?.serverRole).toBe('researcher');
    expect(user?.email).toBe('pi@uni.edu');
    expect(auth.getStatus()).toBe('signed_in');
    expect(auth.isResearcher()).toBe(true);
    expect(auth.isParticipant()).toBe(false);
    // Nothing the browser stores contains the address, a role or a name.
    const stored = JSON.stringify([...Array(g.localStorage.length).keys()].map(i => g.localStorage.getItem(g.localStorage.key(i))));
    expect(stored).not.toContain('pi@uni.edu');
    expect(stored).not.toContain('pi_researcher');
    expect(calls[0].url).toBe('/api/auth/session');
    expect((calls[0].init as any).credentials).toBe('same-origin');
  });

  test('a participant is shown under a pseudonym, never the address', async () => {
    handler = () => json(sessionBody('student@uni.edu', 'participant'));
    const user = await __createAuthServiceForTests().refresh();
    expect(user?.role).toBe('participant');
    expect(user?.displayName).toMatch(/^Participant #[0-9A-Z]{4}$/);
    expect(user?.name).toBe(user?.displayName);
    expect(JSON.stringify({ ...user, email: undefined })).not.toContain('student@uni.edu');
  });

  test('a stored "researcher" session from the old login is ignored; only participant ids are carried over', async () => {
    g.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
      userId: 'researcher-abcd1234', displayName: 'Dr. PI Researcher', role: 'pi_researcher',
      sessionId: '0190aaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', actor_uuid: '0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb', agent_uuid: '0190cccc-cccc-7ccc-8ccc-cccccccccccc',
    }));
    const auth = __createAuthServiceForTests();
    expect(auth.getUser()).toBeNull(); // nothing is trusted before the server answers
    expect(g.localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    const id = JSON.parse(g.localStorage.getItem(IDENTITY_STORAGE_KEY));
    expect(id.userId.startsWith('participant-uuid-')).toBe(true);
    expect(id.actor_uuid).not.toBe('0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb');

    handler = () => json({ authenticated: false });
    expect(await auth.refresh()).toBeNull();
    expect(auth.isResearcher()).toBe(false);
  });

  test('ids from an earlier anonymous participant session are kept so local telemetry stays linked', () => {
    g.localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({
      userId: 'participant-uuid-1111', role: 'participant', inviteCode: 'COHORT-A',
      sessionId: '0190aaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', actor_uuid: '0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb', agent_uuid: '0190cccc-cccc-7ccc-8ccc-cccccccccccc',
    }));
    const id = loadLocalIdentity();
    expect(id.userId).toBe('participant-uuid-1111');
    expect(id.actor_uuid).toBe('0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb');
    expect(id.inviteCode).toBe('COHORT-A');
    expect(g.localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  test('the existing S3A dual-session ids are adopted so a signed-in user keeps the same actor', () => {
    g.localStorage.setItem('s3a_dual_session', JSON.stringify({
      session_id: '0190aaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa', actor_uuid: '0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb', agent_uuid: '0190cccc-cccc-7ccc-8ccc-cccccccccccc',
    }));
    const id = loadLocalIdentity();
    expect(id.actor_uuid).toBe('0190bbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb');
    expect(id.sessionId).toBe('0190aaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa');
  });

  test('an unknown or malformed role from the server is treated as signed out', async () => {
    for (const body of [sessionBody('x@y.edu', 'root'), { authenticated: true }, { authenticated: true, user: { email: 'x@y.edu' } }, null]) {
      handler = () => json(body);
      const auth = __createAuthServiceForTests();
      expect(await auth.refresh()).toBeNull();
      expect(auth.getStatus()).toBe('signed_out');
    }
  });

  test('buildSession gives staff their address as the display name', () => {
    const s = buildSession({ email: 'chair@uni.edu', role: 'committee' }, loadLocalIdentity());
    expect(s.role).toBe('committee_member');
    expect(s.displayName).toBe('chair@uni.edu');
  });
});

describe('session refresh', () => {
  test('signed out, server errors and 503 (auth not configured) all end as signed out without throwing', async () => {
    for (const res of [() => json({ authenticated: false }), () => json({ error: 'auth_not_configured' }, 503), () => new Response('nope', { status: 500 })]) {
      handler = res;
      const auth = __createAuthServiceForTests();
      expect(await auth.refresh()).toBeNull();
      expect(auth.getStatus()).toBe('signed_out');
    }
  });

  test('a 5xx from /session keeps the current user, like a network failure', async () => {
    handler = () => json(sessionBody('pi@uni.edu', 'researcher'));
    const auth = __createAuthServiceForTests();
    await auth.refresh();
    handler = () => json({ error: 'boom' }, 503);
    expect((await auth.refresh())?.email).toBe('pi@uni.edu');
    handler = () => json({ error: 'authentication_required' }, 401);
    expect(await auth.refresh()).toBeNull();
  });

  test('a network failure keeps the current user instead of signing them out', async () => {
    handler = () => json(sessionBody('pi@uni.edu', 'researcher'));
    const auth = __createAuthServiceForTests();
    await auth.refresh();
    g.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const again = await auth.refresh();
    expect(again?.email).toBe('pi@uni.edu');
    expect(auth.getStatus()).toBe('signed_in');
  });

  test('an expired session (server now says unauthenticated) signs the user out and notifies listeners once', async () => {
    handler = () => json(sessionBody('pi@uni.edu', 'researcher'));
    const auth = __createAuthServiceForTests();
    const seen: (string | null)[] = [];
    auth.subscribe(u => seen.push(u?.email ?? null));
    await auth.refresh();
    await auth.refresh(); // unchanged: no second notification
    handler = () => json({ authenticated: false });
    await auth.refresh();
    expect(seen).toEqual(['pi@uni.edu', null]);
    expect(auth.getUser()).toBeNull();
  });

  test('refresh primes the CSRF token, so unsafe calls need no extra /session round trip', async () => {
    handler = () => json(sessionBody('pi@uni.edu', 'researcher', 'tok-xyz'));
    await __createAuthServiceForTests().refresh();
    const before = calls.length;
    expect(await csrfHeaders()).toEqual({ 'X-CSRF-Token': 'tok-xyz' });
    expect(calls.length).toBe(before);
  });

  test('concurrent refreshes share one request', async () => {
    handler = () => json({ authenticated: false });
    const auth = __createAuthServiceForTests();
    await Promise.all([auth.refresh(), auth.refresh(), auth.refresh()]);
    expect(calls.filter(c => c.url === '/api/auth/session').length).toBe(1);
  });
});

describe('requesting a sign-in link', () => {
  test('202: reports the server message and remembers that a link was requested', async () => {
    handler = () => json({ ok: true, message: 'If this address can sign in, a sign-in link has been emailed.' }, 202);
    const r: any = await __createAuthServiceForTests().requestMagicLink('  Student@Uni.edu ');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('emailed');
    expect(calls[0].url).toBe('/api/auth/magic-link/request');
    expect(calls[0].init.method).toBe('POST');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ email: 'Student@Uni.edu' });
    expect(g.localStorage.getItem(SIGNIN_REQUESTED_KEY)).not.toBeNull();
  });

  test('each failure maps to one state and nothing is stored', async () => {
    const auth = __createAuthServiceForTests();
    const cases: [() => Response, string, number?][] = [
      [() => json({ error: 'invalid_email' }, 400), 'invalid_email'],
      [() => json({ error: 'rate_limited' }, 429, { 'Retry-After': '120' }), 'rate_limited', 120],
      [() => json({ error: 'auth_not_configured' }, 503), 'not_configured'],
      [() => json({ error: 'origin_not_allowed' }, 403), 'origin_not_allowed'],
      [() => json({}, 500), 'error'],
    ];
    for (const [make, error, retry] of cases) {
      handler = make;
      const r: any = await auth.requestMagicLink('a@b.edu');
      expect(r.ok).toBe(false);
      expect(r.error).toBe(error);
      if (retry) expect(r.retryAfterSeconds).toBe(retry);
    }
    g.fetch = async () => { throw new TypeError('Failed to fetch'); };
    expect(((await auth.requestMagicLink('a@b.edu')) as any).error).toBe('network');
    expect(g.localStorage.getItem(SIGNIN_REQUESTED_KEY)).toBeNull();
  });

  test('obviously malformed addresses are rejected without calling the server', async () => {
    const auth = __createAuthServiceForTests();
    for (const bad of ['', '   ', 'no-at-sign', 'a@b', 'a b@c.edu', 'x'.repeat(300) + '@a.edu']) {
      expect(((await auth.requestMagicLink(bad)) as any).error).toBe('invalid_email');
    }
    expect(calls.length).toBe(0);
  });

  test('the "link requested" mark is used once and expires', () => {
    const auth = __createAuthServiceForTests();
    g.localStorage.setItem(SIGNIN_REQUESTED_KEY, String(1_000));
    expect(auth.consumeSignInRequested(1_000 + 60_000)).toBe(true);
    expect(auth.consumeSignInRequested(1_000 + 60_000)).toBe(false);
    g.localStorage.setItem(SIGNIN_REQUESTED_KEY, String(1_000));
    expect(auth.consumeSignInRequested(1_000 + 31 * 60_000)).toBe(false);
  });
});

describe('verifying a pasted token', () => {
  test('success starts a session from the JSON answer', async () => {
    handler = () => json({ ok: true, user: { email: 'pi@uni.edu', role: 'admin' }, csrfToken: 'c1', expiresAt: 1 });
    const auth = __createAuthServiceForTests();
    const r: any = await auth.verifyMagicLink(' tok ');
    expect(r.ok).toBe(true);
    expect(r.user.serverRole).toBe('admin');
    expect(auth.isAuthenticated()).toBe(true);
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: 'tok' });
  });

  test('invalid / expired / reused tokens all read the same, and leave the user signed out', async () => {
    handler = () => json({ error: 'invalid_or_expired_token' }, 400);
    const auth = __createAuthServiceForTests();
    expect(((await auth.verifyMagicLink('nope')) as any).error).toBe('invalid_or_expired_token');
    expect(auth.isAuthenticated()).toBe(false);
  });
});

describe('sign out', () => {
  test('POSTs /api/auth/logout with the CSRF header and clears the user', async () => {
    handler = (url) => url.endsWith('/logout') ? json({ ok: true }) : json(sessionBody('pi@uni.edu', 'researcher', 'tok-9'));
    const auth = __createAuthServiceForTests();
    await auth.refresh();
    const ok = await auth.logout();
    const logout = calls.find(c => c.url === '/api/auth/logout')!;
    expect(ok).toBe(true);
    expect(logout.init.method).toBe('POST');
    expect(new Headers(logout.init.headers).get('x-csrf-token')).toBe('tok-9');
    expect(auth.getUser()).toBeNull();
    expect(auth.getStatus()).toBe('signed_out');
  });

  test('the browser is signed out even when the server cannot be reached', async () => {
    handler = () => json(sessionBody('pi@uni.edu', 'researcher'));
    const auth = __createAuthServiceForTests();
    await auth.refresh();
    g.fetch = async () => { throw new TypeError('Failed to fetch'); };
    expect(await auth.logout()).toBe(false);
    expect(auth.getUser()).toBeNull();
  });
});
