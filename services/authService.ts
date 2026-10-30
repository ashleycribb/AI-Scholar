
import { UserSession, UserRole, User } from '../types';

export const USER_STORAGE_KEY = 'are_current_user';
const STORAGE_KEY = USER_STORAGE_KEY;

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

class AuthService {
    private currentUser: UserSession | null = null;

    constructor() {
        this.loadUser();
    }

    private loadUser() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Normalize existing or legacy sessions
                const session: UserSession = {
                    userId: parsed.userId || parsed.id || `participant-uuid-${uuidv4()}`,
                    displayName: parsed.displayName || parsed.name || 'Participant',
                    role: parsed.role === 'researcher' ? 'pi_researcher' : (parsed.role || 'participant'),
                    sessionId: parsed.sessionId || generateUuidV7(),
                    actor_uuid: parsed.actor_uuid || generateUuidV7(),
                    agent_uuid: parsed.agent_uuid || generateUuidV7(),
                    inviteCode: parsed.inviteCode,
                    createdAt: parsed.createdAt || new Date().toISOString(),
                    id: parsed.id || parsed.userId,
                    name: parsed.name || parsed.displayName
                };
                this.currentUser = session;
            }
        } catch (e) {
            console.error("Failed to load user session", e);
        }
    }

    /**
     * Anonymous redemption logic for doctoral study invite codes
     */
    public redeemStudyInvite(inviteCode: string): { success: boolean; session: UserSession } {
        const cleanCode = inviteCode.trim().toUpperCase();
        const anonymousUserId = `participant-uuid-${uuidv4()}`;
        const randomSuffix = uuidv4().substring(0, 4).toUpperCase();
        
        const session: UserSession = {
            userId: anonymousUserId,
            displayName: `Participant #${randomSuffix}`,
            role: 'participant',
            sessionId: generateUuidV7(),
            actor_uuid: generateUuidV7(),
            agent_uuid: generateUuidV7(),
            inviteCode: cleanCode,
            createdAt: new Date().toISOString(),
            id: anonymousUserId,
            name: `Participant #${randomSuffix}`
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return { success: true, session };
    }

    public loginAsResearcher(name?: string, role: 'pi_researcher' | 'committee_member' = 'pi_researcher'): UserSession {
        const uId = `researcher-${uuidv4().substring(0, 8)}`;
        const displayName = name?.trim() || (role === 'pi_researcher' ? 'Dr. PI Researcher' : 'Committee Member');
        const session: UserSession = {
            userId: uId,
            displayName,
            role,
            sessionId: generateUuidV7(),
            actor_uuid: generateUuidV7(),
            agent_uuid: generateUuidV7(),
            createdAt: new Date().toISOString(),
            id: uId,
            name: displayName
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return session;
    }

    public loginAsCommitteeMember(name?: string): UserSession {
        const uId = `committee-${uuidv4().substring(0, 8)}`;
        const displayName = name?.trim() ? `${name.trim()} (Committee)` : 'Dr. Young Baek (Committee)';
        const session: UserSession = {
            userId: uId,
            displayName,
            role: 'committee_member',
            sessionId: generateUuidV7(),
            actor_uuid: generateUuidV7(),
            agent_uuid: generateUuidV7(),
            createdAt: new Date().toISOString(),
            id: uId,
            name: displayName
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return session;
    }

    public loginAsGuest(): UserSession {
        const uId = `guest-${uuidv4().substring(0, 8)}`;
        const session: UserSession = {
            userId: uId,
            displayName: 'Guest Scholar',
            role: 'guest',
            sessionId: generateUuidV7(),
            actor_uuid: generateUuidV7(),
            agent_uuid: generateUuidV7(),
            createdAt: new Date().toISOString(),
            id: uId,
            name: 'Guest Scholar'
        };
        this.currentUser = session;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
        return session;
    }

    public loginAsParticipant(participantId: string): UserSession {
        return this.redeemStudyInvite(participantId).session;
    }

    public logout() {
        this.currentUser = null;
        localStorage.removeItem(STORAGE_KEY);
    }

    public getUser(): UserSession | null {
        return this.currentUser;
    }

    public isAuthenticated(): boolean {
        return !!this.currentUser;
    }

    public isResearcher(): boolean {
        return this.currentUser?.role === 'pi_researcher' || 
               this.currentUser?.role === 'committee_member' || 
               (this.currentUser?.role as any) === 'researcher';
    }

    public isParticipant(): boolean {
        return this.currentUser?.role === 'participant';
    }

    public isCommitteeMember(): boolean {
        return this.currentUser?.role === 'committee_member';
    }
}

export const authService = new AuthService();
