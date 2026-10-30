import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScholarIcon } from './icons/ScholarIcon';
import { authService, type MagicLinkRequestResult } from '../services/authService';
import type { UserSession } from '../types';
import { Mail, ShieldCheck, LogOut, RefreshCw } from 'lucide-react';

export type LoginRequestError = Extract<MagicLinkRequestResult, { ok: false }>['error'];

/** One short, plain sentence per failure. None of them says whether an address is allowed to sign in. */
export function describeLoginError(error: LoginRequestError, retryAfterSeconds?: number): string {
    switch (error) {
        case 'invalid_email':
            return 'Enter a valid email address, for example name@university.edu.';
        case 'rate_limited': {
            const mins = retryAfterSeconds ? Math.max(1, Math.ceil(retryAfterSeconds / 60)) : null;
            return mins ? `Too many sign-in requests. Try again in about ${mins} minute${mins === 1 ? '' : 's'}.` : 'Too many sign-in requests. Try again in a few minutes.';
        }
        case 'not_configured':
            return 'Sign-in is not available on this server yet. The server administrator needs to finish the email setup.';
        case 'origin_not_allowed':
            return 'Sign-in was refused because this page is not on the server\'s allowed list. Open the app from its main address and try again.';
        case 'network':
            return 'Could not reach the server. Check your connection and try again.';
        default:
            return 'Something went wrong sending the link. Try again in a moment.';
    }
}

export type LoginViewState =
    | { step: 'email'; email: string; busy: boolean; error?: LoginRequestError; retryAfterSeconds?: number }
    | { step: 'sent'; email: string; message: string; checking: boolean }
    | { step: 'signed_in'; user: Pick<UserSession, 'displayName' | 'email' | 'role' | 'serverRole'> };

const ROLE_LABEL: Record<string, string> = {
    participant: 'Participant',
    researcher: 'Researcher',
    committee: 'Committee member',
    admin: 'Administrator',
};

interface LoginViewProps {
    state: LoginViewState;
    onEmailChange: (value: string) => void;
    onSubmit: () => void;
    onUseDifferentEmail: () => void;
    onCheckNow: () => void;
    onLogout: () => void;
    onClose: () => void;
}

/** Pure view: every state of the sign-in dialog is a function of `state`, so each one can be rendered in a test. */
export const LoginView: React.FC<LoginViewProps> = ({ state, onEmailChange, onSubmit, onUseDifferentEmail, onCheckNow, onLogout, onClose }) => {
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="login-title"
                className="max-w-md w-full bg-white p-7 sm:p-8 rounded-3xl shadow-2xl border border-slate-200/80 relative animate-fade-in"
            >
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
                    aria-label="Close dialog"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>

                <div className="text-center mb-6">
                    <div className="mx-auto h-12 w-12 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-3.5 shadow-xs">
                        <ScholarIcon className="h-6 w-6" />
                    </div>
                    <h2 id="login-title" className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                        {state.step === 'signed_in' ? 'You are signed in' : state.step === 'sent' ? 'Check your email' : 'Sign in with email'}
                    </h2>
                </div>

                {state.step === 'email' && (
                    <form
                        onSubmit={(e) => { e.preventDefault(); if (!state.busy) onSubmit(); }}
                        className="space-y-4"
                        noValidate
                    >
                        <p className="text-xs text-slate-500 text-center max-w-sm mx-auto">
                            We email you a one-time link. There is no password. Researchers and committee members use the address the study team added.
                        </p>
                        <div>
                            <label htmlFor="login-email" className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
                                Email address
                            </label>
                            <input
                                id="login-email"
                                name="email"
                                type="email"
                                autoComplete="email"
                                inputMode="email"
                                required
                                autoFocus
                                maxLength={254}
                                aria-invalid={state.error === 'invalid_email' ? true : undefined}
                                aria-describedby={state.error ? 'login-error' : undefined}
                                className="block w-full px-3.5 py-3 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                                placeholder="name@university.edu"
                                value={state.email}
                                onChange={(e) => onEmailChange(e.target.value)}
                            />
                        </div>
                        {state.error && (
                            <p id="login-error" role="alert" className="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                {describeLoginError(state.error, state.retryAfterSeconds)}
                            </p>
                        )}
                        <button
                            type="submit"
                            disabled={state.busy}
                            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 transition-all"
                        >
                            <Mail className="w-4 h-4" />
                            <span>{state.busy ? 'Sending…' : 'Email me a sign-in link'}</span>
                        </button>
                        <div className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3 flex gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <p>
                                Signing in is optional. You can search and build a workspace without an account, and nothing is recorded for research unless you join a study and agree. Signing in lets you sync your workspace, see your own records, and delete your data from the server. Your address is never put in study records.
                            </p>
                        </div>
                    </form>
                )}

                {state.step === 'sent' && (
                    <div className="space-y-4" aria-live="polite">
                        <p className="text-sm text-slate-700 text-center">{state.message}</p>
                        <p className="text-xs text-slate-500 text-center">
                            Sent to <span className="font-semibold text-slate-700 break-all">{state.email}</span>. Open the link in the email and select the Sign in button on the page that opens. You can leave this window open.
                        </p>
                        <div className="flex gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={onUseDifferentEmail}
                                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Use a different email
                            </button>
                            <button
                                type="button"
                                onClick={onCheckNow}
                                disabled={state.checking}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${state.checking ? 'animate-spin' : ''}`} />
                                <span>{state.checking ? 'Checking…' : 'I clicked the link'}</span>
                            </button>
                        </div>
                    </div>
                )}

                {state.step === 'signed_in' && (
                    <div className="space-y-4" aria-live="polite">
                        <div className="text-center">
                            <div className="text-sm font-semibold text-slate-900 break-all">{state.user.email || state.user.displayName}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{ROLE_LABEL[state.user.serverRole || 'participant'] || 'Participant'}</div>
                        </div>
                        <div className="flex gap-2.5 pt-1">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-2.5 px-4 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                            >
                                Close
                            </button>
                            <button
                                type="button"
                                onClick={onLogout}
                                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-xs font-black uppercase tracking-wider text-white bg-slate-900 hover:bg-slate-800 transition-colors"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                <span>Sign out</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

interface LoginScreenProps {
    isOpen: boolean;
    onClose: () => void;
    /** Called when the server confirms a session while this dialog is open (the link was used in another tab). */
    onLogin: (user: UserSession) => void;
    /** Current session, from the server, or null. */
    user?: UserSession | null;
    onLogout?: () => void;
}

const POLL_MS = 4000;

export const LoginScreen: React.FC<LoginScreenProps> = ({ isOpen, onClose, onLogin, user, onLogout }) => {
    const [email, setEmail] = useState('');
    const [phase, setPhase] = useState<'email' | 'sending' | 'sent'>('email');
    const [error, setError] = useState<LoginRequestError | undefined>(undefined);
    const [retryAfter, setRetryAfter] = useState<number | undefined>(undefined);
    const [message, setMessage] = useState('');
    const [checking, setChecking] = useState(false);
    const onLoginRef = useRef(onLogin);
    onLoginRef.current = onLogin;

    useEffect(() => {
        if (!isOpen) return;
        setPhase('email');
        setError(undefined);
        setRetryAfter(undefined);
        setChecking(false);
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    const checkNow = useCallback(async () => {
        setChecking(true);
        try {
            const session = await authService.refresh();
            if (session) onLoginRef.current(session);
        } finally {
            setChecking(false);
        }
    }, []);

    // While a link is outstanding, notice when it gets used in another tab or window.
    useEffect(() => {
        if (!isOpen || phase !== 'sent') return;
        const timer = setInterval(() => { void authService.refresh().then(s => { if (s) onLoginRef.current(s); }); }, POLL_MS);
        return () => clearInterval(timer);
    }, [isOpen, phase]);

    if (!isOpen) return null;

    const submit = async () => {
        setPhase('sending');
        setError(undefined);
        const result = await authService.requestMagicLink(email);
        if ('message' in result) {
            setMessage(result.message);
            setPhase('sent');
        } else {
            setError(result.error);
            setRetryAfter(result.retryAfterSeconds);
            setPhase('email');
        }
    };

    let state: LoginViewState;
    if (user) state = { step: 'signed_in', user };
    else if (phase === 'sent') state = { step: 'sent', email: email.trim(), message, checking };
    else state = { step: 'email', email, busy: phase === 'sending', error, retryAfterSeconds: retryAfter };

    return (
        <LoginView
            state={state}
            onEmailChange={(v) => { setEmail(v); if (error) setError(undefined); }}
            onSubmit={submit}
            onUseDifferentEmail={() => { setPhase('email'); setError(undefined); }}
            onCheckNow={checkNow}
            onLogout={() => { onLogout?.(); onClose(); }}
            onClose={onClose}
        />
    );
};
