
import React from 'react';
import { BookOpen, Globe, User as UserIcon, LogOut, Database, GraduationCap } from 'lucide-react';
import { HelpButton } from './HelpButton';
import { AboutButton } from './AboutButton';
import type { AppMode, User } from '../types';

interface HeaderProps {
    onOpenAbout: () => void;
    onOpenHelp: () => void;
    onOpenProxySettings: () => void;
    onOpenScholarBridge: () => void;
    onOpenLrsInspector?: () => void;
    onOpenDbFinder?: () => void;
    onOpenLibraryGuide?: () => void;
    onLoginClick: () => void;
    onLogoutClick: () => void;
    user: User | null;
    appMode: AppMode;
    onModeChange: (mode: AppMode) => void;
}

export const Header: React.FC<HeaderProps> = ({ 
    onOpenAbout, 
    onOpenHelp, 
    onOpenProxySettings,
    onOpenScholarBridge,
    onOpenLrsInspector,
    onOpenDbFinder,
    onOpenLibraryGuide,
    onLoginClick,
    onLogoutClick,
    user,
    appMode,
    onModeChange
}) => {
    const isPrivileged = user?.role === 'pi_researcher' || user?.role === 'committee_member' || (user?.role as string) === 'researcher';

    const getRoleBadge = () => {
        if (!user) return null;
        switch (user.role) {
            case 'pi_researcher':
                return <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">PI Researcher</span>;
            case 'committee_member':
                return <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">Committee</span>;
            case 'participant':
                return (
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                        Participant {user.inviteCode ? `(${user.inviteCode})` : ''}
                    </span>
                );
            case 'guest':
                return <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Guest</span>;
            default:
                return <span className="micro-label">{(user as any).role}</span>;
        }
    };

    return (
        <header className="sticky top-0 z-40 w-full bg-white/80 backdrop-blur-md border-b border-slate-200">
            <div className="container mx-auto flex h-20 items-center justify-between px-4 sm:px-6 lg:px-8">
                <button 
                    onClick={() => {
                        if (user?.role !== 'participant') onModeChange('search');
                    }}
                    className="flex items-center gap-3 hover:opacity-80 transition-opacity"
                >
                    <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-xl font-bold tracking-tight text-slate-900">Scholar Explorer</span>
                </button>
                
                <nav className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 mr-4">
                        {onOpenLrsInspector && (
                            <button
                                onClick={onOpenLrsInspector}
                                className={`p-2.5 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs ${
                                    isPrivileged
                                        ? 'text-indigo-600 hover:text-indigo-900 hover:bg-indigo-50 border border-indigo-200/60'
                                        : 'text-emerald-700 hover:text-emerald-900 hover:bg-emerald-50 border border-emerald-200/60'
                                }`}
                                title={
                                    isPrivileged
                                        ? 'xAPI LRS System-Wide Telemetry & Traceability Inspector (Researcher Admin)'
                                        : 'My Personal xAPI Activity & AI Agent Logs (Privacy Protected)'
                                }
                            >
                                <Database className="w-4 h-4" />
                                <span className="hidden lg:inline text-[11px] font-black uppercase tracking-wider">
                                    {isPrivileged ? 'xAPI LRS (Admin)' : 'My xAPI Logs'}
                                </span>
                            </button>
                        )}
                        {onOpenDbFinder && (
                            <button
                                onClick={onOpenDbFinder}
                                className="p-2.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs border border-slate-200"
                                title="Open Scholarly Databases, Repository Harvester & University Library MCP Connector"
                            >
                                <BookOpen className="w-4 h-4 text-indigo-600" />
                                <span className="hidden xl:inline text-[11px] font-black uppercase tracking-wider">
                                    Databases & Library MCP
                                </span>
                            </button>
                        )}
                        {onOpenLibraryGuide && (
                            <button
                                onClick={onOpenLibraryGuide}
                                className="p-2.5 text-indigo-700 hover:text-indigo-900 hover:bg-indigo-50 rounded-xl transition-all flex items-center gap-1.5 font-bold text-xs border border-indigo-200/70"
                                title="Doctoral Student Guide: How to invite home university libraries to connect via MCP"
                            >
                                <GraduationCap className="w-4 h-4" />
                                <span className="hidden xl:inline text-[11px] font-black uppercase tracking-wider">
                                    Library Guide
                                </span>
                            </button>
                        )}
                        <button
                            onClick={onOpenProxySettings}
                            className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-50 rounded-xl transition-all"
                            title="Institutional SSO Integration (UNC Wilmington)"
                        >
                            <Globe className="w-5 h-5" />
                        </button>
                        <AboutButton onClick={onOpenAbout} />
                        <HelpButton onClick={onOpenHelp} />
                    </div>
                    
                    <div className="h-8 w-px bg-slate-200 mx-2 hidden md:block" />

                    {!user ? (
                        <button
                            onClick={onLoginClick}
                            className="flex items-center gap-2 px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-lg shadow-slate-900/10 active:scale-95 cursor-pointer"
                        >
                            <UserIcon className="w-4 h-4" />
                            <span>Sign In</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-4">
                            <div className="flex flex-col items-end">
                                <span className="text-xs font-black text-slate-900 tracking-tight">{user.displayName || user.name}</span>
                                {getRoleBadge()}
                            </div>
                            
                            <div className="flex items-center gap-2">
                                {isPrivileged && appMode === 'search' && (
                                    <button onClick={() => onModeChange('dashboard')} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">Dashboard</button>
                                )}
                                {isPrivileged && appMode === 'dashboard' && (
                                    <button onClick={() => onModeChange('search')} className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 transition-colors">Search</button>
                                )}
                                
                                <button
                                    onClick={onLogoutClick}
                                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                                    title="Logout"
                                >
                                    <LogOut className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    )}
                </nav>
            </div>
        </header>
    );
};
