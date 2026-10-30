/**
 * services/lrsClient.ts
 * 
 * Strict xAPI 1.0.3 Client for S3A LRS server.
 * Handles:
 * - Authorization: Basic base64(user:pass)
 * - X-Experience-API-Version: 1.0.3
 * - Content-Type: application/json
 * - postStatements with stored IDs return
 * - getStatements with automatic 'more' link pagination
 * - getState / putState with ETag and If-Match concurrency control
 * - Non-retryable 400/401/403/409 error handling
 * - Exponential backoff for network and 5xx errors
 */

import { csrfHeaders, isSameOrigin, isUnsafeMethod } from './csrf';
import { getLrsCredentials, type LrsCredentials, normalizeLrsEndpoint, hasConfiguredLrsCredentials } from './lrsCredentialsService';

export class LrsError extends Error {
  status: number;
  serverMessage: string;
  isRetryable: boolean;

  constructor(status: number, serverMessage: string) {
    super(`LRS Error [${status}]: ${serverMessage}`);
    this.name = 'LrsError';
    this.status = status;
    this.serverMessage = serverMessage;
    // 400 (Bad Request / Profile Violation), 401 (Auth Error), 403 (Policy Forbidden), 409 (Conflict) are NON-RETRYABLE
    this.isRetryable = !(status === 400 || status === 401 || status === 403 || status === 409);
  }
}

export interface StatementQueryParams {
  registration?: string;
  agent?: any;
  verb?: string;
  since?: string;
  limit?: number;
}

export interface WorkspaceStateDocument {
  papers: any[];
  projects?: any[];
  lastModified: string;
  sessionUuid?: string;
  version?: string;
}

export const SCHOLAR_WORKSPACE_ACTIVITY_ID = 'https://ashecribb.dev/xapi/activities/scholar-workspace';
export const SCHOLAR_WORKSPACE_STATE_ID = 'workspace';

/**
 * Builds standard xAPI 1.0.3 request headers.
 * Sends Authorization only when valid credentials or auth tokens are configured.
 */
function buildHeaders(creds: LrsCredentials, extraHeaders: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Experience-API-Version': '1.0.3',
    'Content-Type': 'application/json',
    ...extraHeaders
  };

  const authHeader = (creds as any).authHeader;
  if (authHeader && typeof authHeader === 'string') {
    headers['Authorization'] = authHeader;
  } else if (creds.username && creds.password) {
    const raw = `${creds.username}:${creds.password}`;
    try {
      headers['Authorization'] = `Basic ${btoa(unescape(encodeURIComponent(raw)))}`;
    } catch {
      headers['Authorization'] = `Basic ${btoa(raw)}`;
    }
  }

  return headers;
}

/**
 * Helper to parse server error text or JSON response safely
 */
async function parseErrorResponse(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return res.statusText || `HTTP ${res.status}`;
    try {
      const json = JSON.parse(text);
      return json.message || json.error || json.description || text;
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return res.statusText || `HTTP ${res.status}`;
  }
}

/**
 * Executes an HTTP fetch operation with exponential backoff for network and 5xx errors.
 * 400, 401, 403, 409 throw immediately without retry.
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let attempt = 0;
  let delay = 1000;

  // A same-origin unsafe request (PUT state, POST statements, DELETE by actor) to this app's own server
  // needs the CSRF token of the signed-in session. Cross-origin LRS hosts authenticate with Basic credentials instead.
  if (isUnsafeMethod(options.method) && isSameOrigin(url)) {
    options = { ...options, headers: { ...(options.headers as Record<string, string>), ...(await csrfHeaders()) } };
  }

  while (true) {
    try {
      const res = await fetch(url, options);

      // Handle non-2xx status codes
      if (!res.ok) {
        const errorMsg = await parseErrorResponse(res);
        const lrsError = new LrsError(res.status, errorMsg);

        // If non-retryable (400, 401, 403, 409), fail fast
        if (!lrsError.isRetryable || attempt >= maxRetries) {
          throw lrsError;
        }

        // Retry 5xx errors
        attempt++;
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        continue;
      }

      return res;
    } catch (err: any) {
      if (err instanceof LrsError && !err.isRetryable) {
        throw err;
      }

      // Network errors (Failed to fetch, connection refused)
      if (attempt >= maxRetries) {
        if (err instanceof LrsError) throw err;
        throw new LrsError(0, err?.message || 'Network error: S3A LRS server unreachable');
      }

      attempt++;
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
    }
  }
}

/**
 * Test LRS connection via GET {endpoint}about with header X-Experience-API-Version: 1.0.3.
 * Returns the supported version string or throws LrsError.
 */
export async function testLrsConnection(
  endpoint?: string,
  username?: string,
  password?: string
): Promise<{ version: string; data?: any }> {
  const creds = endpoint 
    ? { endpoint: normalizeLrsEndpoint(endpoint), username: username || '', password: password || '' }
    : await getLrsCredentials();

  const url = `${normalizeLrsEndpoint(creds.endpoint)}about`;
  const headers = buildHeaders(creds, { 'Accept': 'application/json' });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers
    });

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      const err = new LrsError(res.status, errorMsg);
      console.error(`[LRS Test Connection Failed] URL: ${url} | Error: HTTP ${res.status} - ${errorMsg}`, {
        url,
        status: res.status,
        error: errorMsg,
        headers: Object.fromEntries(res.headers.entries())
      });
      throw err;
    }

    const data = await res.json();
    let versionStr = '1.0.3';
    if (data.version) {
      versionStr = Array.isArray(data.version) ? data.version.join(', ') : String(data.version);
    }

    return { version: versionStr, data };
  } catch (err: any) {
    const errorMsg = err instanceof LrsError ? err.serverMessage : (err?.message || 'Connection refused');
    console.error(`[LRS Test Connection Failed] URL: ${url} | Error: ${errorMsg}`, {
      url,
      error: errorMsg,
      cause: err
    });
    if (err instanceof LrsError) throw err;
    throw new LrsError(0, `Cannot connect to LRS at ${url}: ${errorMsg}`);
  }
}

/**
 * Post an array of xAPI statements to the LRS.
 * POST {endpoint}statements
 * Returns stored statement IDs.
 */
export async function postStatements(
  statements: any[],
  customCreds?: LrsCredentials
): Promise<string[]> {
  if (!statements || statements.length === 0) return [];

  const creds = customCreds || await getLrsCredentials();
  if (!hasConfiguredLrsCredentials(creds)) {
    // Skip LRS sync quietly when no credentials are configured
    return [];
  }
  const url = `${normalizeLrsEndpoint(creds.endpoint)}statements`;
  const headers = buildHeaders(creds);

  try {
    const res = await fetchWithRetry(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(statements)
    });

    console.log(`[LRS Sync Attempt] URL: ${url} | Status: ${res.status} | Count: ${statements.length}`);

    if (res.status !== 200 && res.status !== 204) {
      const errorMsg = await parseErrorResponse(res);
      throw new LrsError(res.status, errorMsg);
    }

    try {
      const text = await res.text();
      if (!text) {
        return statements.map(s => s.id);
      }
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data;
      }
      if (data.statements && Array.isArray(data.statements)) {
        return data.statements.map((s: any) => s.id || s);
      }
      return statements.map(s => s.id);
    } catch {
      return statements.map(s => s.id);
    }
  } catch (err: any) {
    const status = err instanceof LrsError ? err.status : (err?.status || 0);
    console.log(`[LRS Sync Attempt] URL: ${url} | Status: ${status} | Count: ${statements.length} | Error: ${err?.message || err}`);
    throw err;
  }
}

/**
 * Query statements from the LRS.
 * Follows 'more' pagination links until all statements are retrieved.
 */
export async function getStatements(
  query: StatementQueryParams = {},
  customCreds?: LrsCredentials
): Promise<any[]> {
  const creds = customCreds || await getLrsCredentials();
  if (!hasConfiguredLrsCredentials(creds)) {
    // Skip LRS sync quietly when no credentials are configured
    return [];
  }
  const baseEndpoint = normalizeLrsEndpoint(creds.endpoint);

  const params = new URLSearchParams();
  if (query.registration) params.append('registration', query.registration);
  if (query.verb) params.append('verb', query.verb);
  if (query.since) params.append('since', query.since);
  if (query.limit) params.append('limit', String(query.limit));
  if (query.agent) {
    params.append('agent', typeof query.agent === 'string' ? query.agent : JSON.stringify(query.agent));
  }

  let nextUrl = `${baseEndpoint}statements?${params.toString()}`;
  const allStatements: any[] = [];
  const visitedUrls = new Set<string>();

  while (nextUrl && !visitedUrls.has(nextUrl)) {
    visitedUrls.add(nextUrl);
    const headers = buildHeaders(creds, { 'Accept': 'application/json' });

    const res = await fetchWithRetry(nextUrl, {
      method: 'GET',
      headers
    });

    const data = await res.json();
    if (Array.isArray(data)) {
      allStatements.push(...data);
      break;
    } else if (data.statements && Array.isArray(data.statements)) {
      allStatements.push(...data.statements);
      if (data.more && typeof data.more === 'string') {
        const moreVal = data.more.trim();
        if (moreVal.startsWith('http://') || moreVal.startsWith('https://')) {
          nextUrl = moreVal;
        } else if (moreVal.startsWith('/')) {
          const parsed = new URL(baseEndpoint);
          nextUrl = `${parsed.origin}${moreVal}`;
        } else {
          nextUrl = `${baseEndpoint}${moreVal}`;
        }
      } else {
        nextUrl = '';
      }
    } else {
      break;
    }
  }

  return allStatements;
}

/**
 * Retrieve a State document for an activity from the LRS.
 * GET {endpoint}activities/state?activityId=...&stateId=...
 * Uses ETag for concurrency tracking.
 */
export async function getState(
  activityId = SCHOLAR_WORKSPACE_ACTIVITY_ID,
  stateId = SCHOLAR_WORKSPACE_STATE_ID,
  customCreds?: LrsCredentials
): Promise<{ data: any; etag: string | null } | null> {
  const creds = customCreds || await getLrsCredentials();
  if (!hasConfiguredLrsCredentials(creds)) {
    // Skip LRS sync quietly when no credentials are configured
    return null;
  }
  const baseEndpoint = normalizeLrsEndpoint(creds.endpoint);

  const params = new URLSearchParams({
    activityId,
    stateId
  });

  const url = `${baseEndpoint}activities/state?${params.toString()}`;
  const headers = buildHeaders(creds, { 'Accept': 'application/json' });

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers
    });

    if (res.status === 404 || res.status === 401) {
      return null;
    }

    if (!res.ok) {
      const errorMsg = await parseErrorResponse(res);
      throw new LrsError(res.status, errorMsg);
    }

    const etag = res.headers.get('ETag');
    const data = await res.json();
    return { data, etag };
  } catch (err: any) {
    if (err instanceof LrsError && (err.status === 404 || err.status === 401)) {
      return null;
    }
    if (err?.status === 401 || err?.message?.includes('401')) {
      return null;
    }
    throw err;
  }
}

/**
 * Save a State document to the LRS.
 * PUT {endpoint}activities/state?activityId=...&stateId=...
 * Passes If-Match header if ETag is provided.
 */
export async function putState(
  activityId = SCHOLAR_WORKSPACE_ACTIVITY_ID,
  stateId = SCHOLAR_WORKSPACE_STATE_ID,
  data: any,
  etag?: string | null,
  customCreds?: LrsCredentials
): Promise<{ etag: string | null }> {
  const creds = customCreds || await getLrsCredentials();
  if (!hasConfiguredLrsCredentials(creds)) {
    // Skip LRS sync quietly when no credentials are configured
    return { etag: null };
  }
  const baseEndpoint = normalizeLrsEndpoint(creds.endpoint);

  const params = new URLSearchParams({
    activityId,
    stateId
  });

  const url = `${baseEndpoint}activities/state?${params.toString()}`;
  const extraHeaders: Record<string, string> = {};
  if (etag) {
    extraHeaders['If-Match'] = etag;
  }

  const headers = buildHeaders(creds, extraHeaders);

  try {
    const res = await fetchWithRetry(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data)
    });

    const newEtag = res.headers.get('ETag');
    return { etag: newEtag };
  } catch (err: any) {
    if (err instanceof LrsError && (err.status === 401 || err.status === 403)) {
      return { etag: null };
    }
    if (err?.status === 401 || err?.message?.includes('401')) {
      return { etag: null };
    }
    throw err;
  }
}

/**
 * Calls the server's delete-by-actor endpoint for an actor / device ID.
 */
export async function deleteStatementsByActor(
  actorId: string,
  customCreds?: LrsCredentials
): Promise<{ success: boolean; deletedCount?: number }> {
  const creds = customCreds || await getLrsCredentials();
  const baseEndpoint = normalizeLrsEndpoint(creds.endpoint);
  const url = `${baseEndpoint}statements/by-actor?actor=${encodeURIComponent(actorId)}`;
  const headers = buildHeaders(creds);

  try {
    const res = await fetchWithRetry(url, {
      method: 'DELETE',
      headers
    });
    const data = await res.json().catch(() => ({ success: true }));
    return { success: true, deletedCount: data.deletedCount };
  } catch {
    // Fallback: try POST /statements/delete-by-actor
    try {
      const postUrl = `${baseEndpoint}statements/delete-by-actor`;
      const res = await fetchWithRetry(postUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ actor: actorId })
      });
      const data = await res.json().catch(() => ({ success: true }));
      return { success: true, deletedCount: data.deletedCount };
    } catch (e2: any) {
      console.error('[LRS Client] Failed to delete statements by actor:', e2);
      throw e2;
    }
  }
}
