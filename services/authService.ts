
import type { UserSession, UserRole } from '../types';
import { getCsrfToken, resetCsrfToken, setCsrfToken } from './csrf';

/**
 * Old key. Before server sign-in the browser stored a whole "session" here, role included, with no proof of who
 * the person was. It is never trusted again: only its pseudonymous ids are carried over, then the key is removed.
 */
export const USER_STORAGE_KEY = 'are_current_user';
/** Pseudonymous, per-browser ids used for S3A / xAPI telemetry. Holds no role, no name and no email. */
export const IDENTITY_STORAGE_KEY = 'scholar_local_identity';
/** Set when a sign-in link was requested, so the first load after the emailed link can land the person sensibly. */
export const SIGNIN_REQUESTED_KEY = 'scholar_signin_requested';
const SIGNIN_REQUESTED_MAX_AGE_MS = 30 * 60_000;
const S3A_DUAL_SESSION_KEY = 's3a_dual_session';

export function generateUuidV7(): string {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  
  const rand = new Uint8Array(10);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(rand);
  } else {
    for (let i = 0; i < 10; i++) rand[i] = Math.floor(Math.random() * 256);
  }
  
  const rand12 = ((rand[0] << 8) | rand[1]) & 0x0fff;
  const versionAndRand = (0x7000 | rand12).toString(16).padStart(4, '0');
  
  const rand14 = ((rand[2] << 8) | rand[3]) & 0x3fff;
  const variantAndRand = (0x8000 | rand14).toString(16).padStart(4, '0');
  
  let node = '';
  for (let i = 4; i < 10; i++) {
    node += rand[i].toString(16).padStart(2, '0');
  }
  
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-${versionAndRand}-${variantAndRand}-${node}`.toLowerCase();
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type ServerRole = 'participant' | 'researcher' | 'committee' | 'admin';
export type AuthStatus = 'unknown' | 'signed_out' | 'signed_in';

/** The only places a role can come from: the server's session answer. */
export function clientRoleFor(serverRole: ServerRole): UserRole {
    switch (serverRole) {
        case 'researcher':
        case 'admin':
            return 'pi_researcher';
        case 'committee':
            return 'committee_member';
        default:
            return 'participant';
    }
}

export type MagicLinkRequestResult =
    | { ok: true; message: string }
    | { ok: false; error: 'invalid_email' | 'rate_limited' | 'not_configured' | 'origin_not_allowed' | 'network' | 'error'; retryAfterSeconds?: number };

export type MagicLinkVerifyResult =
    | { ok: true; user: UserSession }
    | { ok: false; error: 'invalid_or_expired_token' | 'rate_limited' | 'not_configured' | 'network' | 'error' };

interface LocalIdentity {
    userId: string;
    sessionId: string;
    actor_uuid: string;
    agent_uuid: string;
    inviteCode?: string;
    createdAt: string;
}

interface ServerSessionBody {
    authenticated?: boolean;
    user?: { email?: string; role?: string };
    csrfToken?: string;
    expiresAt?: number;
}

const SERVER_ROLES: readonly string[] = ['participant', 'researcher', 'committee', 'admin'];
const PARTICIPANT_PREFIX = 'participant-uuid-';

function safeStorage(): Storage | null {
    try {
        return typeof localStorage !== 'undefined' ? localStorage : null;
    } catch {
        return null;
    }
}

function readJson(key: string): any | null {
    const st = safeStorage();
    if (!st) return null;
    try {
        const raw = st.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function isUuidLike(v: unknown): v is string {
    return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

/**
 * Loads (or creates) the pseudonymous ids for this browser.
 *  - Ids from an earlier anonymous participant session (`participant-uuid-...`) and from the S3A dual session are
 *    reused, so telemetry already collected on this device stays linked to it.
 *  - Anything else in the old stored "session" (role, name, researcher/guest ids) is dropped.
 */
export function loadLocalIdentity(): LocalIdentity {
    const st = safeStorage();
    const stored = readJson(IDENTITY_STORAGE_KEY);
    if (stored && typeof stored.userId === 'string' && isUuidLike(stored.actor_uuid) && isUuidLike(stored.agent_uuid) && isUuidLike(stored.sessionId)) {
        if (st) { try { st.removeItem(USER_STORAGE_KEY); } catch { /* ignore */ } }
        return stored as LocalIdentity;
    }

    const legacy = readJson(USER_STORAGE_KEY);
    const dual = readJson(S3A_DUAL_SESSION_KEY);
    const legacyIsParticipant = legacy && legacy.role === 'participant' && typeof legacy.userId === 'string' && legacy.userId.startsWith(PARTICIPANT_PREFIX);

    const identity: LocalIdentity = {
        userId: legacyIsParticipant ? legacy.userId : `${PARTICIPANT_PREFIX}${uuidv4()}`,
        sessionId: (legacyIsParticipant && isUuidLike(legacy.sessionId) && legacy.sessionId)
            || (isUuidLike(dual?.session_id) && dual.session_id) || generateUuidV7(),
        actor_uuid: (legacyIsParticipant && isUuidLike(legacy.actor_uuid) && legacy.actor_uuid)
            || (isUuidLike(dual?.actor_uuid) && dual.actor_uuid) || generateUuidV7(),
        agent_uuid: (legacyIsParticipant && isUuidLike(legacy.agent_uuid) && legacy.agent_uuid)
            || (isUuidLike(dual?.agent_uuid) && dual.agent_uuid) || generateUuidV7(),
        inviteCode: legacyIsParticipant && typeof legacy.inviteCode === 'string' ? legacy.inviteCode : undefined,
        createdAt: new Date().toISOString(),
    };
    if (st) {
        try {
            st.setItem(IDENTITY_STORAGE_KEY, JSON.stringify(identity));
            st.removeItem(USER_STORAGE_KEY);
        } catch { /* storage full or blocked: ids last for this page only */ }
    }
    return identity;
}

/** What the rest of the app sees. Role and email come only from `server`. */
export function buildSession(server: { email: string; role: ServerRole; expiresAt?: number }, identity: LocalIdentity): UserSession {
    const role = clientRoleFor(server.role);
    // Participants stay de-identified in telemetry: the display name is a pseudonym, never the address.
    const displayName = role === 'participant'
        ? `Participant #${identity.userId.replace(/[^0-9a-z]/gi, '').slice(-4).toUpperCase() || 'ANON'}`
        : server.email;
    return {
        userId: identity.userId,
        displayName,
        role,
        serverRole: server.role,
        email: server.email,
        expiresAt: server.expiresAt,
        sessionId: identity.sessionId,
        actor_uuid: identity.actor_uuid,
        agent_uuid: identity.agent_uuid,
        inviteCode: identity.inviteCode,
        createdAt: identity.createdAt,
        id: identity.userId,
        name: displayName,
    };
}

type Listener = (user: UserSession | null) => void;

class AuthService {
    private currentUser: UserSession | null = null;
    private status: AuthStatus = 'unknown';
    private listeners = new Set<Listener>();
    private inflight: Promise<UserSession | null> | null = null;

    constructor() {
        // Drop the old credential-less "session" right away; ids are carried over by loadLocalIdentity().
        loadLocalIdentity();
    }

    private setUser(next: UserSession | null, status: AuthStatus) {
        const changed = (this.currentUser?.email ?? null) !== (next?.email ?? null)
            || this.currentUser?.serverRole !== next?.serverRole
            || this.status !== status;
        this.currentUser = next;
        this.status = status;
        if (changed) for (const l of [...this.listeners]) { try { l(next); } catch (e) { console.error(e); } }
    }

    private applyServerSession(body: ServerSessionBody | null | undefined): UserSession | null {
        const email = body?.user?.email;
        const role = body?.user?.role;
        if (!body?.authenticated || typeof email !== 'string' || !email || typeof role !== 'string' || !SERVER_ROLES.includes(role)) {
            resetCsrfToken();
            this.setUser(null, 'signed_out');
            return null;
        }
        setCsrfToken(typeof body.csrfToken === 'string' ? body.csrfToken : null);
        const session = buildSession({ email, role: role as ServerRole, expiresAt: body.expiresAt }, loadLocalIdentity());
        this.setUser(session, 'signed_in');
        return session;
    }

    /**
     * Asks the server who this browser is (GET /api/auth/session). A network failure leaves the current state alone
     * rather than signing the person out. Concurrent calls share one request.
     */
    public refresh(): Promise<UserSession | null> {
        if (this.inflight) return this.inflight;
        this.inflight = (async () => {
            try {
                const res = await fetch('/api/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
                if (res.status >= 500) {
                    // The server is struggling; that says nothing about who is signed in. Same as a network failure.
                    if (this.status === 'unknown') this.setUser(null, 'signed_out');
                    return this.currentUser;
                }
                if (!res.ok) {
                    resetCsrfToken();
                    this.setUser(null, 'signed_out');
                    return null;
                }
                return this.applyServerSession(await res.json().catch(() => null));
            } catch {
                if (this.status === 'unknown') this.setUser(null, 'signed_out');
                return this.currentUser;
            } finally {
                this.inflight = null;
            }
        })();
        return this.inflight;
    }

    /** POST /api/auth/magic-link/request. The server answers the same way for every well-formed address. */
    public async requestMagicLink(email: string): Promise<MagicLinkRequestResult> {
        const trimmed = (email || '').trim();
        if (!trimmed || trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return { ok: false, error: 'invalid_email' };
        let res: Response;
        try {
            res = await fetch('/api/auth/magic-link/request', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ email: trimmed }),
            });
        } catch {
            return { ok: false, error: 'network' };
        }
        const body: any = await res.json().catch(() => ({}));
        if (res.status === 202 || (res.ok && body?.ok)) {
            const st = safeStorage();
            if (st) { try { st.setItem(SIGNIN_REQUESTED_KEY, String(Date.now())); } catch { /* ignore */ } }
            return { ok: true, message: typeof body?.message === 'string' ? body.message : 'If this address can sign in, a sign-in link has been emailed.' };
        }
        if (res.status === 400 && body?.error === 'invalid_email') return { ok: false, error: 'invalid_email' };
        if (res.status === 429) {
            const ra = Number.parseInt(res.headers.get('Retry-After') || '', 10);
            return { ok: false, error: 'rate_limited', retryAfterSeconds: Number.isFinite(ra) ? ra : undefined };
        }
        if (res.status === 503) return { ok: false, error: 'not_configured' };
        if (res.status === 403 && body?.error === 'origin_not_allowed') return { ok: false, error: 'origin_not_allowed' };
        return { ok: false, error: 'error' };
    }

    /**
     * POST /api/auth/magic-link/verify with a token (JSON form). The emailed link normally goes to the server's own
     * confirmation page, which does this itself; this is for a pasted token.
     */
    public async verifyMagicLink(token: string): Promise<MagicLinkVerifyResult> {
        let res: Response;
        try {
            res = await fetch('/api/auth/magic-link/verify', {
                method: 'POST',
                credentials: 'same-origin',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ token: (token || '').trim() }),
            });
        } catch {
            return { ok: false, error: 'network' };
        }
        const body: any = await res.json().catch(() => ({}));
        if (res.ok && body?.ok) {
            const user = this.applyServerSession({ authenticated: true, user: body.user, csrfToken: body.csrfToken, expiresAt: body.expiresAt });
            return user ? { ok: true, user } : { ok: false, error: 'error' };
        }
        if (res.status === 400) return { ok: false, error: 'invalid_or_expired_token' };
        if (res.status === 429) return { ok: false, error: 'rate_limited' };
        if (res.status === 503) return { ok: false, error: 'not_configured' };
        return { ok: false, error: 'error' };
    }

    /** True once, shortly after a link was requested; used to greet the person after the emailed link brings them back. */
    public consumeSignInRequested(now: number = Date.now()): boolean {
        const st = safeStorage();
        if (!st) return false;
        try {
            const raw = st.getItem(SIGNIN_REQUESTED_KEY);
            if (!raw) return false;
            st.removeItem(SIGNIN_REQUESTED_KEY);
            const at = Number.parseInt(raw, 10);
            return Number.isFinite(at) && now - at >= 0 && now - at <= SIGNIN_REQUESTED_MAX_AGE_MS;
        } catch {
            return false;
        }
    }

    /**
     * POST /api/auth/logout (with the CSRF header). The browser is signed out locally even if the request fails,
     * and the return value says whether the server confirmed it.
     */
    public async logout(): Promise<boolean> {
        let serverOk = false;
        try {
            const headers: Record<string, string> = { Accept: 'application/json' };
            const token = await getCsrfToken();
            if (token) headers['X-CSRF-Token'] = token;
            const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin', headers });
            serverOk = res.ok;
        } catch {
            serverOk = false;
        }
        resetCsrfToken();
        this.setUser(null, 'signed_out');
        return serverOk;
    }

    /** Re-checks the session when the tab regains focus and every few minutes. Returns a stop function. */
    public startAutoRefresh(intervalMs: number = 5 * 60_000): () => void {
        if (typeof window === 'undefined') return () => {};
        const onFocus = () => { void this.refresh(); };
        const onVisible = () => { if (document.visibilityState === 'visible') onFocus(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onVisible);
        const timer = setInterval(onFocus, intervalMs);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onVisible);
            clearInterval(timer);
        };
    }

    public subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => { this.listeners.delete(listener); };
    }

    public getUser(): UserSession | null {
        return this.currentUser;
    }

    public getStatus(): AuthStatus {
        return this.status;
    }

    public isAuthenticated(): boolean {
        return !!this.currentUser;
    }

    /** Researcher or admin (the server's `pi_researcher` tier) or committee: may see research dashboards. */
    public isResearcher(): boolean {
        return this.currentUser?.role === 'pi_researcher' || this.currentUser?.role === 'committee_member';
    }

    public isParticipant(): boolean {
        return this.currentUser?.role === 'participant';
    }

    public isCommitteeMember(): boolean {
        return this.currentUser?.role === 'committee_member';
    }

    public isAdmin(): boolean {
        return this.currentUser?.serverRole === 'admin';
    }
}

export const authService = new AuthService();

/** Test hook: a fresh instance that has not touched the page's session. */
export const __createAuthServiceForTests = () => new AuthService();
