/**
 * The calls route lockdown (#139) left unreachable from the browser, now that a session can be obtained:
 * xAPI statements and state sync, "Delete my data", LRS dashboards, source discovery actions, the Nanobot panel and the MCP bridge.
 * Each test says what the server needs to see (session cookie, CSRF header, or a service token) and checks that.
 */
import { test, expect, describe, beforeEach, afterEach } from 'bun:test';
import axios from 'axios';
import { resetCsrfToken, setCsrfToken } from './csrf';
import { postStatements, getState, putState, getStatements, deleteStatementsByActor, lrsAuthAvailable, LrsError } from './lrsClient';
import { planServerDelete, skippedDeleteMessage, deletedMessage, deleteErrorMessage } from './deleteMyData';
import { fetchLrsStatus, fetchUserSqlLrsStatements, fetchAgentDuckDbStatements, mergeById } from './lrsService';
import { getVaultFilesResult, verifyPaperWithLogician } from './localAgentService';
import { testSourceEndpoint, proposeSourceByEmail, approveSource, rejectSource, addCustomDiscoveredSource } from './sourceDiscoveryService';
import { mcpService } from './mcpService';
import { accessMessage, friendlyApiError } from './apiErrors';

const g = globalThis as any;
const realFetch = globalThis.fetch;
const ORIGIN = 'https://app.example';

interface Call { url: string; method: string; headers: Headers; body?: string }
let calls: Call[] = [];
let signedIn = true;
let respond: (c: Call) => Response;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  g.window = { location: { origin: ORIGIN, host: 'app.example' } };
  resetCsrfToken();
  calls = [];
  signedIn = true;
  respond = () => json({});
  g.fetch = async (input: any, init: RequestInit = {}) => {
    const c: Call = { url: String(input), method: (init.method || 'GET').toUpperCase(), headers: new Headers(init.headers || {}), body: init.body as string | undefined };
    calls.push(c);
    if (c.url.endsWith('/api/auth/session')) {
      return signedIn ? json({ authenticated: true, user: { email: 'pi@uni.edu', role: 'researcher' }, csrfToken: 'csrf-7' }) : json({ authenticated: false });
    }
    return respond(c);
  };
});
afterEach(() => { g.fetch = realFetch; delete g.window; });

const own = { endpoint: `${ORIGIN}/xapi/`, username: '', password: '' };
const hosted = { endpoint: 'https://lrs.example/xapi/', username: '', password: '' };
const hostedWithToken = { endpoint: 'https://lrs.example/xapi/', username: 'lrs-sync', password: 'x'.repeat(40) };
const apiCalls = () => calls.filter(c => !c.url.endsWith('/api/auth/session'));

describe('xAPI statements and state sync (same origin)', () => {
  test('with a session, statements are POSTed with the CSRF header and no stored credentials', async () => {
    respond = () => json(['s1']);
    const ids = await postStatements([{ id: 's1', actor: {}, verb: {}, object: {} }], own);
    expect(ids).toEqual(['s1']);
    const c = apiCalls()[0];
    expect(c.url).toBe(`${ORIGIN}/xapi/statements`);
    expect(c.method).toBe('POST');
    expect(c.headers.get('x-csrf-token')).toBe('csrf-7');
    expect(c.headers.get('authorization')).toBeNull();
    expect(c.headers.get('x-experience-api-version')).toBe('1.0.3');
  });

  test('without a session nothing is sent (statements stay queued) instead of a refused 401', async () => {
    signedIn = false;
    expect(await postStatements([{ id: 's1' }], own)).toEqual([]);
    expect(await getStatements({}, own)).toEqual([]);
    expect(await getState(undefined, undefined, own)).toBeNull();
    expect((await putState(undefined, undefined, { papers: [] }, null, own)).etag).toBeNull();
    expect(apiCalls().length).toBe(0);
  });

  test('state: GET uses the session cookie, PUT carries the CSRF header and If-Match', async () => {
    respond = (c) => c.method === 'GET' ? new Response(JSON.stringify({ papers: [] }), { status: 200, headers: { ETag: '"e1"' } }) : new Response(null, { status: 204, headers: { ETag: '"e2"' } });
    const got = await getState(undefined, undefined, own);
    expect(got?.etag).toBe('"e1"');
    const put = await putState(undefined, undefined, { papers: [] }, '"e1"', own);
    expect(put.etag).toBe('"e2"');
    const [get, putCall] = apiCalls();
    expect(get.headers.get('x-csrf-token')).toBeNull(); // safe method
    expect(putCall.method).toBe('PUT');
    expect(putCall.headers.get('x-csrf-token')).toBe('csrf-7');
    expect(putCall.headers.get('if-match')).toBe('"e1"');
  });

  test('a stale CSRF token is refreshed once and the request retried', async () => {
    let first = true;
    respond = (c) => {
      if (first) { first = false; return json({ error: 'csrf_check_failed' }, 403); }
      return json(['s1']);
    };
    expect(await postStatements([{ id: 's1' }], own)).toEqual(['s1']);
    expect(apiCalls().length).toBe(2);
  });

  test('a CSRF failure that persists surfaces as one non-retryable LrsError, not a loop', async () => {
    respond = () => json({ error: 'csrf_check_failed' }, 403);
    await expect(postStatements([{ id: 's1' }], own)).rejects.toBeInstanceOf(LrsError);
    expect(apiCalls().length).toBe(2); // original + one retry with a fresh token
  });
});

describe('the hosted (cross-origin) LRS uses a service token, not the session', () => {
  test('no configured credentials: skipped, even when signed in here', async () => {
    expect(await lrsAuthAvailable(hosted)).toBe(false);
    expect(await postStatements([{ id: 's1' }], hosted)).toEqual([]);
    expect(apiCalls().length).toBe(0);
  });

  test('with a token as the Basic password: Authorization is sent and no CSRF header (CSRF does not apply)', async () => {
    respond = () => json(['s1']);
    await postStatements([{ id: 's1' }], hostedWithToken);
    const c = apiCalls()[0];
    expect(c.url).toBe('https://lrs.example/xapi/statements');
    expect(c.headers.get('authorization')).toBe(`Basic ${btoa('lrs-sync:' + 'x'.repeat(40))}`);
    expect(c.headers.get('x-csrf-token')).toBeNull();
  });

  test('lrsAuthAvailable: own server needs a session; cross-origin needs credentials', async () => {
    expect(await lrsAuthAvailable(own)).toBe(true);
    resetCsrfToken(); signedIn = false;
    expect(await lrsAuthAvailable(own)).toBe(false);
    expect(await lrsAuthAvailable(hostedWithToken)).toBe(true);
  });
});

describe('Delete my data', () => {
  test('a participant\'s request names no actor: the server binds it to the session address', async () => {
    respond = () => json({ success: true, deletedCount: 3 });
    const r = await deleteStatementsByActor(null, own);
    expect(r.deletedCount).toBe(3);
    const c = apiCalls()[0];
    expect(c.method).toBe('DELETE');
    expect(c.url).toBe(`${ORIGIN}/xapi/statements/by-actor`);
    expect(c.url).not.toContain('actor=');
    expect(c.headers.get('x-csrf-token')).toBe('csrf-7');
  });

  test('a researcher names the exact actor', async () => {
    await deleteStatementsByActor('participant-uuid-1111', own);
    expect(apiCalls()[0].url).toBe(`${ORIGIN}/xapi/statements/by-actor?actor=participant-uuid-1111`);
  });

  test('401 / 403 are final: the POST fallback is not tried and the error keeps its status', async () => {
    respond = () => json({ message: 'participants_may_delete_only_their_own_data' }, 403);
    await expect(deleteStatementsByActor('someone-else', own)).rejects.toMatchObject({ status: 403 });
    expect(apiCalls().length).toBe(1);
  });

  test('plan: who calls the server with what', () => {
    const participant = { role: 'participant' as const, serverRole: 'participant' as const };
    const researcher = { role: 'pi_researcher' as const, serverRole: 'researcher' as const };
    const committee = { role: 'committee_member' as const, serverRole: 'committee' as const };
    expect(planServerDelete({ sameOrigin: true, user: participant, deviceId: 'dev-1' })).toEqual({ kind: 'call', actorId: null });
    expect(planServerDelete({ sameOrigin: true, user: researcher, deviceId: 'dev-1' })).toEqual({ kind: 'call', actorId: 'dev-1' });
    expect(planServerDelete({ sameOrigin: true, user: committee, deviceId: 'dev-1' })).toEqual({ kind: 'skip', reason: 'committee' });
    expect(planServerDelete({ sameOrigin: true, user: null, deviceId: 'dev-1' })).toEqual({ kind: 'skip', reason: 'signed_out' });
    // Hosted LRS: unchanged behaviour, device id + configured credentials.
    expect(planServerDelete({ sameOrigin: false, user: null, deviceId: 'dev-1' })).toEqual({ kind: 'call', actorId: 'dev-1' });
  });

  test('messages are honest about what was and was not deleted', () => {
    expect(skippedDeleteMessage('signed_out')).toContain('not touched because you are not signed in');
    expect(skippedDeleteMessage('committee')).toContain('Committee accounts cannot delete');
    expect(deletedMessage(2)).toContain('Deleted 2 statement(s)');
    expect(deletedMessage(undefined)).toContain('Deleted 0');
    expect(deleteErrorMessage({ status: 401 })).toContain('sign in and try again');
    expect(deleteErrorMessage({ status: 403 })).toContain('only the records tied to their own');
  });
});

describe('LRS dashboards', () => {
  test('requests go with the session cookie and no role or user name in the query', async () => {
    respond = (c) => c.url.includes('/status') ? json({ yetSqlLrs: {} }) : json({ statements: [] });
    await fetchLrsStatus();
    await fetchUserSqlLrsStatements('researcher', 'someone');
    await fetchAgentDuckDbStatements('0190aaaa', 'participant', 'someone');
    const urls = apiCalls().map(c => c.url);
    expect(urls).toEqual(['/api/lrs/status', '/api/lrs/sql-lrs/statements', '/api/lrs/duckdb-lrs/statements?sessionUuid=0190aaaa']);
    for (const u of urls) expect(u).not.toMatch(/role=|userName=/);
  });

  test('signed out (401): falls back to what this tab recorded instead of failing', async () => {
    respond = () => json({ error: 'authentication_required' }, 401);
    expect(await fetchUserSqlLrsStatements('participant', 'nobody')).toEqual([]);
    const status = await fetchLrsStatus();
    expect(status.yetSqlLrs.status).toBe('active'); // local fallback shape
  });

  test('server rows and this tab\'s own statements are merged without duplicates', () => {
    const a: any = { id: 'a' }, b: any = { id: 'b' }, a2: any = { id: 'a' };
    expect(mergeById([a], [a2, b]).map(s => s.id)).toEqual(['a', 'b']);
  });
});

describe('Local Nanobot panel', () => {
  test('lists the vault and tells signed-out / forbidden / error apart', async () => {
    respond = () => json(['paper.md']);
    expect(await getVaultFilesResult()).toEqual({ files: ['paper.md'], access: 'ok' });
    respond = () => json({}, 401);
    expect(await getVaultFilesResult()).toEqual({ files: [], access: 'signed_out' });
    respond = () => json({}, 403);
    expect(await getVaultFilesResult()).toEqual({ files: [], access: 'forbidden' });
    respond = () => json({}, 500);
    expect((await getVaultFilesResult()).access).toBe('error');
  });

  test('verify POSTs the file with the CSRF header; a refusal comes back as a readable message', async () => {
    respond = () => json({ output: 'Verified' });
    expect(await verifyPaperWithLogician('p.md')).toBe('Verified');
    const c = apiCalls()[0];
    expect(c.method).toBe('POST');
    expect(c.url).toBe('/api/local/verify');
    expect(c.headers.get('x-csrf-token')).toBe('csrf-7');
    expect(JSON.parse(c.body!)).toEqual({ filePath: 'p.md' });
    respond = () => json({}, 403);
    expect(await verifyPaperWithLogician('p.md')).toContain('researcher account');
  });
});

describe('source discovery POST actions', () => {
  const realAdapter = axios.defaults.adapter;
  let seen: { url: string; method: string; headers: any; data: any }[] = [];
  beforeEach(() => {
    seen = [];
    axios.defaults.adapter = (async (config: any) => {
      seen.push({ url: config.url, method: config.method, headers: config.headers, data: config.data });
      return { data: { ok: true }, status: 200, statusText: 'OK', headers: {}, config };
    }) as any;
  });
  afterEach(() => { axios.defaults.adapter = realAdapter; });

  test('every action carries the CSRF header of the session', async () => {
    await testSourceEndpoint('s1');
    await proposeSourceByEmail('s1', 'a@b.edu');
    await approveSource('s1');
    await rejectSource('s1');
    await addCustomDiscoveredSource({ name: 'x' });
    expect(seen.map(s => `${s.method} ${s.url}`)).toEqual([
      'post /api/sources/test-endpoint', 'post /api/sources/propose', 'post /api/sources/approve/s1', 'post /api/sources/reject/s1', 'post /api/sources/custom',
    ]);
    for (const s of seen) expect(s.headers.get ? s.headers.get('X-CSRF-Token') : s.headers['X-CSRF-Token']).toBe('csrf-7');
  });

  test('refusals read as an instruction, not "status code 401"', () => {
    expect(friendlyApiError({ response: { status: 401 } })).toBe('Sign in with a researcher or committee account to use this.');
    expect(friendlyApiError({ response: { status: 403 } })).toContain('does not have access');
    expect(friendlyApiError({ message: 'boom' })).toBe('boom');
    expect(accessMessage(200)).toBeNull();
  });
});

describe('MCP bridge', () => {
  test('without a session it does not try to connect and says why', async () => {
    signedIn = false;
    resetCsrfToken();
    const status = await mcpService.connect('/mcp');
    expect(status).toMatchObject({ isConnected: false, authRequired: true, serverUrl: '/mcp' });
    expect(apiCalls().length).toBe(0); // no /mcp request
  });

  test('with a session the connection attempt is made (and reports a plain failure when the server is not there)', async () => {
    setCsrfToken('csrf-7');
    respond = () => json({}, 404);
    const status = await mcpService.connect('/mcp');
    expect(status.authRequired).toBe(false);
    expect(status.isConnected).toBe(false);
    expect(calls.some(c => c.url.endsWith('/mcp'))).toBe(true);
  });
});
