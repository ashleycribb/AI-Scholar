import React, { useState, useEffect } from 'react';
import { 
    BookOpen, 
    User as UserIcon, 
    LogOut, 
    Download, 
    ChevronDown, 
    Globe, 
    Database, 
    HelpCircle, 
    Info,
    Server,
    ShieldCheck,
    GraduationCap
} from 'lucide-react';
import type { AppMode, User } from '../types';
import { 
    getLrsSyncState, 
    subscribeLrsSync, 
    type LrsSyncState 
} from '../services/s3aOutboxService';
import {
    getS3ASessionState,
    subscribeS3AState,
    flushBuffer,
    type S3ASessionState
} from '../services/s3aWasmService';

export type NavTab = 'search' | 'results' | 'detail' | 'queue' | 'export' | 'connections' | 'assistant' | 'marketplace';

interface HeaderProps {
    onOpenAbout: () => void;
    onOpenHelp: () => void;
    onOpenProxySettings: () => void;
    onOpenScholarBridge: () => void;
    onOpenLrsInspector?: () => void;
    onOpenDbFinder?: () => void;
    onOpenLibraryGuide?: () => void;
    onOpenS3AInspector?: () => void;
    onOpenDatabaseSettings?: () => void;
    onLoginClick: () => void;
    onLogoutClick: () => void;
    user: User | null;
    appMode: AppMode;
    onModeChange: (mode: AppMode) => void;
    workspacePapersCount?: number;
    papersCount?: number;
    activeNav?: NavTab;
    onNavigate?: (nav: NavTab) => void;
    projectName?: string;
    onUpdateProjectName?: (name: string) => void;
    lastSnapshotDate?: string | null;
    onOpenSnapshotModal?: () => void;
    onStartResearchProject?: () => void;
    userRoleMode?: 'explorer' | 'researcher';
    consentState?: 'none' | 'granted' | 'withdrawn';
}

export const Header: React.FC<HeaderProps> = ({ 
    onOpenAbout, 
    onOpenHelp, 
    onOpenProxySettings,
    onOpenScholarBridge,
    onOpenLrsInspector,
    onOpenS3AInspector,
    onOpenDbFinder,
    onOpenDatabaseSettings,
    onLoginClick,
    onLogoutClick,
    user,
    appMode,
    onModeChange,
    workspacePapersCount = 0,
    papersCount = 0,
    activeNav = 'search',
    onNavigate,
    onOpenSnapshotModal,
    onStartResearchProject,
    userRoleMode = 'explorer',
    consentState = 'none'
}) => {
    const isPrivileged = user?.role === 'pi_researcher' || user?.role === 'committee_member' || (user?.role as string) === 'researcher';
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [syncState, setSyncState] = useState<LrsSyncState>(getLrsSyncState());
    const [s3aState, setS3aState] = useState<S3ASessionState>(getS3ASessionState());

    useEffect(() => {
        const unsubLrs = subscribeLrsSync(setSyncState);
        const unsubS3a = subscribeS3AState(setS3aState);
        return () => {
            unsubLrs();
            unsubS3a();
        };
    }, []);

    // Only signed-in study participants see flush / LRS status. Signed-out users see nothing.
    const isSignedInStudyParticipant = Boolean(user) && (consentState === 'granted' || user?.role === 'participant');
    const totalQueued = (syncState.queuedCount || 0) + (s3aState.bufferedQueueCount || 0);

    // Status pill text and colors
    let pillText = 'Connected';
    let pillClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
    let dotClass = 'bg-emerald-500';

    if (s3aState.lastFlushError) {
        pillText = totalQueued > 0 ? `Flush retry queued (${totalQueued})` : 'Flush error (retry queued)';
        pillClass = 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100';
        dotClass = 'bg-amber-500';
    } else if (syncState.status === 'auth_error') {
        pillText = 'Auth error';
        pillClass = 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100';
        dotClass = 'bg-rose-500';
    } else if (syncState.status === 'offline') {
        pillText = totalQueued > 0 ? `Offline (${totalQueued} queued)` : 'Offline';
        pillClass = 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200';
        dotClass = 'bg-slate-400';
    } else if (totalQueued > 0) {
        pillText = `Connected (${totalQueued} queued)`;
        pillClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100';
        dotClass = 'bg-emerald-500';
    }

    return (
        <header className="sticky top-0 z-40 w-full bg-white/95 backdrop-blur-md border-b border-slate-200/80">
            <div className="max-w-6xl mx-auto flex h-14 items-center justify-between px-4 sm:px-6 gap-3">
                {/* Zone 1: Wordmark */}
                <div className="flex items-center gap-3 shrink-0">
                    <button 
                        onClick={() => onNavigate ? onNavigate('search') : onModeChange('search')}
                        className="flex items-center gap-2 hover:opacity-85 transition-opacity"
                    >
                        <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center text-white">
                            <BookOpen className="w-3.5 h-3.5" />
                        </div>
                        <span className="text-base font-semibold tracking-tight text-slate-900">
                            Scholar Explorer
                        </span>
                    </button>
                </div>

                {/* Zone 2: Navigation Links */}
                <nav className="flex items-center gap-1 sm:gap-1.5 text-xs">
                    <button
                        type="button"
                        onClick={() => onNavigate ? onNavigate('search') : onModeChange('search')}
                        className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
                            activeNav === 'search'
                                ? 'bg-slate-100 text-slate-900 font-semibold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        Search
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (papersCount > 0 && onNavigate) onNavigate('results');
                        }}
                        disabled={papersCount === 0}
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
                            papersCount === 0
                                ? 'opacity-35 cursor-not-allowed text-slate-400'
                                : activeNav === 'results'
                                    ? 'bg-slate-100 text-slate-900 font-semibold'
                                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        <span>Results</span>
                        {papersCount > 0 && (
                            <span className="text-[11px] text-slate-500 font-mono">({papersCount})</span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => onNavigate && onNavigate('queue')}
                        className={`flex items-center gap-1.5 px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
                            activeNav === 'queue'
                                ? 'bg-slate-100 text-slate-900 font-semibold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        <span>Workspace</span>
                        {workspacePapersCount > 0 && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900 text-white font-medium">
                                {workspacePapersCount}
                            </span>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={() => onNavigate && onNavigate('assistant')}
                        className={`px-3 py-1.5 font-medium rounded-lg transition-colors whitespace-nowrap ${
                            activeNav === 'assistant'
                                ? 'bg-slate-100 text-slate-900 font-semibold'
                                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                        }`}
                    >
                        Assistant
                    </button>

                    <button
                        type="button"
                        onClick={onOpenScholarBridge}
                        className="hidden sm:inline-flex px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap"
                    >
                        Bridges &amp; Sync
                    </button>

                    {isPrivileged && (
                        <button
                            type="button"
                            onClick={() => onModeChange('dashboard')}
                            className={`px-3 py-1.5 font-bold rounded-lg transition-colors whitespace-nowrap ${
                                appMode === 'dashboard'
                                    ? 'bg-slate-900 text-white shadow-2xs'
                                    : 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50'
                            }`}
                        >
                            <span>{user?.role === 'committee_member' ? 'Committee Dossier' : 'PI Dashboard'}</span>
                        </button>
                    )}
                </nav>

                {/* Zone 3: S3A LRS Status Pill & Actions */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Status Pill: shown ONLY to signed-in study participants; signed-out users see nothing */}
                    {isSignedInStudyParticipant && (
                        <button
                            type="button"
                            onClick={() => {
                                if (s3aState.lastFlushError) {
                                    flushBuffer().catch((err) => console.error('[Header] Manual flush retry failed:', err));
                                }
                                if (onOpenDatabaseSettings) onOpenDatabaseSettings();
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-full border transition-all select-none ${pillClass}`}
                            title={
                                s3aState.lastFlushError
                                    ? `Flush error: ${s3aState.lastFlushError} (${totalQueued} queued for retry). Click to retry.`
                                    : `S3A LRS Server: ${syncState.activeEndpoint}\nStatus: ${syncState.status}\nQueued: ${totalQueued}\nClick to configure LRS Database settings`
                            }
                        >
                            <span className={`w-2 h-2 rounded-full ${dotClass} ${syncState.status === 'connected' && !s3aState.lastFlushError ? 'animate-pulse' : ''}`}></span>
                            <span className="truncate max-w-[150px] sm:max-w-none">{pillText}</span>
                        </button>
                    )}

                    {/* Start a research project (visible in Explorer mode) */}
                    {onStartResearchProject && (
                        <button
                            type="button"
                            onClick={onStartResearchProject}
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition-colors whitespace-nowrap"
                            title="Switch to Researcher mode with a dedicated S3A session"
                        >
                            <span>Start a research project</span>
                        </button>
                    )}

                    {/* Export backup button (secondary to S3A LRS database of record) */}
                    {onOpenSnapshotModal && (
                        <div className="hidden md:inline-flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={onOpenSnapshotModal}
                                disabled={workspacePapersCount === 0}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 disabled:opacity-45 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                                title={workspacePapersCount === 0 ? "Stage at least one paper to export." : "Export offline backup (.s3a)"}
                            >
                                <Download className="w-3.5 h-3.5 text-slate-500" />
                                <span>Export backup</span>
                            </button>
                            {workspacePapersCount === 0 && (
                                <span className="hidden xl:inline text-[11px] text-slate-500 whitespace-nowrap">
                                    Stage at least one paper to export.
                                </span>
                            )}
                        </div>
                    )}

                    {!user ? (
                        <button
                            onClick={onLoginClick}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors whitespace-nowrap shadow-xs"
                        >
                            <UserIcon className="w-3.5 h-3.5" />
                            <span>Sign In</span>
                        </button>
                    ) : (
                        <div className="relative">
                            <button
                                onClick={() => setUserMenuOpen(!userMenuOpen)}
                                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-colors text-xs text-slate-800"
                            >
                                <span className="font-semibold truncate max-w-[120px]">
                                    {user.displayName || user.name}
                                </span>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                            </button>

                            {userMenuOpen && (
                                <div 
                                    className="absolute right-0 mt-1.5 w-56 bg-white border border-slate-200 rounded-xl shadow-lg py-1 z-50 text-xs font-medium text-slate-700 divide-y divide-slate-100"
                                    onMouseLeave={() => setUserMenuOpen(false)}
                                >
                                    <div className="px-3.5 py-2">
                                        <div className="font-semibold text-slate-900 truncate">{user.name}</div>
                                        <div className="text-[11px] text-slate-500 capitalize">{user.role}</div>
                                    </div>

                                    <div className="py-1">
                                        {isPrivileged && (
                                            <button
                                                onClick={() => { onModeChange('dashboard'); setUserMenuOpen(false); }}
                                                className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 text-indigo-700 font-bold flex items-center gap-2"
                                            >
                                                <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>{user.role === 'committee_member' ? 'Committee Dossier' : 'PI Dashboard'}</span>
                                            </button>
                                        )}
                                        {onStartResearchProject && (
                                            <button
                                                onClick={() => { onStartResearchProject(); setUserMenuOpen(false); }}
                                                className="w-full text-left px-3.5 py-1.5 hover:bg-indigo-50 text-indigo-700 font-semibold flex items-center gap-2"
                                            >
                                                <BookOpen className="w-3.5 h-3.5 text-indigo-600" />
                                                <span>Start a research project</span>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => { if (onOpenDatabaseSettings) onOpenDatabaseSettings(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center justify-between text-slate-700"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Database className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Database (S3A LRS)</span>
                                            </div>
                                            <span className={`w-2 h-2 rounded-full ${dotClass}`}></span>
                                        </button>
                                        <button
                                            onClick={() => { onOpenScholarBridge(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                        >
                                            <Server className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Bridges &amp; Sync</span>
                                        </button>
                                        <button
                                            onClick={() => { onOpenProxySettings(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                        >
                                            <Globe className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Proxy SSO</span>
                                        </button>
                                        {onOpenS3AInspector && (
                                            <button
                                                onClick={() => { onOpenS3AInspector(); setUserMenuOpen(false); }}
                                                className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                            >
                                                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                                <span>My Research Log</span>
                                            </button>
                                        )}
                                        {isPrivileged && onOpenLrsInspector && (
                                            <button
                                                onClick={() => { onOpenLrsInspector(); setUserMenuOpen(false); }}
                                                className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                            >
                                                <Database className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Telemetry Logs</span>
                                            </button>
                                        )}
                                        {onOpenSnapshotModal && (
                                            <button
                                                onClick={() => { onOpenSnapshotModal(); setUserMenuOpen(false); }}
                                                className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                            >
                                                <Download className="w-3.5 h-3.5 text-slate-400" />
                                                <span>Export backup</span>
                                            </button>
                                        )}
                                    </div>

                                    <div className="py-1">
                                        <button
                                            onClick={() => { onOpenHelp(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                        >
                                            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                                            <span>Help Guide</span>
                                        </button>
                                        <button
                                            onClick={() => { onOpenAbout(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-slate-50 flex items-center gap-2 text-slate-700"
                                        >
                                            <Info className="w-3.5 h-3.5 text-slate-400" />
                                            <span>About Scholar Explorer</span>
                                        </button>
                                    </div>

                                    <div className="py-1">
                                        <button
                                            onClick={() => { onLogoutClick(); setUserMenuOpen(false); }}
                                            className="w-full text-left px-3.5 py-1.5 hover:bg-rose-50 text-rose-600 flex items-center gap-2"
                                        >
                                            <LogOut className="w-3.5 h-3.5" />
                                            <span>Sign Out</span>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
