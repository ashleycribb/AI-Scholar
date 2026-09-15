
import { UserSession, UserRole, User } from '../types';

export const USER_STORAGE_KEY = 'are_current_user';
const STORAGE_KEY = USER_STORAGE_KEY;

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
                    sessionId: parsed.sessionId || uuidv4(),
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
            sessionId: uuidv4(),
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
            sessionId: uuidv4(),
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
            sessionId: uuidv4(),
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
            sessionId: uuidv4(),
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
