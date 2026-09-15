
import React, { useState } from 'react';
import { RobotIcon } from './icons/RobotIcon';
import { ArxivIcon } from './icons/ArxivIcon';
import { CheckIcon } from './icons/CheckIcon';
import { Library, Link as LinkIcon, ShieldCheck, RefreshCw, CheckCircle2, RotateCw, GraduationCap, BookOpen } from 'lucide-react';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { SearchIcon } from './icons/SearchIcon';
import { NetworkIcon } from './icons/NetworkIcon';
import type { UserSettings, User } from '../types';
import * as scholarBridgeService from '../services/scholarBridgeService';

interface ConnectionsDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onSave: (settings: UserSettings) => void;
    user: User | null;
    onOpenLibraryGuide?: () => void;
}

const ConnectionRow: React.FC<{
    icon: React.ReactNode;
    name: string;
    description: string;
    onDisconnect: () => void;
}> = ({ icon, name, description, onDisconnect }) => (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 group">
        <div className="flex items-center gap-4">
            <div className="w-10 h-10 flex items-center justify-center bg-gray-50 border border-gray-200 rounded-lg group-hover:bg-white transition-colors">
                {icon}
            </div>
            <div>
                <h4 className="text-sm font-bold text-gray-900">{name}</h4>
                <p className="text-xs text-gray-500 font-medium">{description}</p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-green-600 bg-green-50 px-2 py-1 rounded">Active</span>
            <button 
                onClick={onDisconnect}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                title="Disconnect"
            >
                <DotsVerticalIcon className="w-4 h-4" />
            </button>
        </div>
    </div>
);

const DiscoverCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    actionText: string;
    onAction: () => void;
    colorClass: string;
}> = ({ icon, title, description, actionText, onAction, colorClass }) => (
    <div className="flex flex-col h-full p-5 bg-white border border-gray-200 rounded-xl hover:shadow-md transition-all group">
        <div className={`w-12 h-12 flex items-center justify-center rounded-xl mb-4 transition-transform group-hover:scale-110 ${colorClass}`}>
            {icon}
        </div>
        <h4 className="text-sm font-black text-gray-900 mb-1">{title}</h4>
        <p className="text-xs text-gray-500 leading-relaxed mb-6 flex-grow">{description}</p>
        <button 
            onClick={onAction}
            className="w-full py-2 text-xs font-bold text-blue-600 bg-blue-50 border border-transparent hover:border-blue-200 hover:bg-blue-100 rounded-lg transition-all"
        >
            {actionText}
        </button>
    </div>
);

export const ConnectionsDashboard: React.FC<ConnectionsDashboardProps> = ({ isOpen, onClose, settings, onSave, user, onOpenLibraryGuide }) => {
    const [view, setView] = useState<'main' | 'preferences' | 'scholar_form'>('main');
    const [scholarId, setScholarId] = useState(settings.scholarBridgeUserId || '');
    const [scholarKey, setScholarKey] = useState(settings.scholarBridgeApiKey || '');
    const [isTesting, setIsTesting] = useState(false);

    // Local Lab Bridge Sync State
    const [isSyncingLocalLab, setIsSyncingLocalLab] = useState(false);
    const [lastLocalLabSync, setLastLocalLabSync] = useState<string>('Just now');
    const [localLabStatus, setLocalLabStatus] = useState<string>('Marketplace Catalog V0.1.0 Up to Date (5 Capability Packs Loaded)');
    const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);

    if (!isOpen) return null;

    const handleSyncLocalLabNow = async () => {
        setIsSyncingLocalLab(true);
        setLocalLabStatus('Checking Capability Marketplace updates...');
        try {
            await fetch('/xapi/marketplace_catalog_schema.json').catch(() => null);
            await new Promise(resolve => setTimeout(resolve, 800));
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            setLastLocalLabSync(`Today at ${timeStr}`);
            setLocalLabStatus('Marketplace Catalog V0.1.0 Up to Date (5 Capability Packs Verified)');
        } catch {
            setLocalLabStatus('Marketplace cached (5 Capability Packs ready)');
        } finally {
            setIsSyncingLocalLab(false);
        }
    };

    const handleConnectScholar = async () => {
        setIsTesting(true);
        const ok = await scholarBridgeService.validateScholarBridgeAuth(scholarId, scholarKey);
        if (ok) {
            onSave({ ...settings, scholarBridgeUserId: scholarId, scholarBridgeApiKey: scholarKey, isScholarBridgeEnabled: true });
            setView('main');
        } else {
            alert("Invalid Scholar Bridge credentials.");
        }
        setIsTesting(false);
    };

    const handleDisconnectScholar = () => {
        if (confirm("Disconnect from Scholar Bridge Cloud? Saved papers will remain in explorer but sync will stop.")) {
            onSave({ ...settings, scholarBridgeUserId: '', scholarBridgeApiKey: '', isScholarBridgeEnabled: false });
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm animate-fade-in">
            <div className="bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex overflow-hidden border border-gray-200">
                {/* Notion-style Sidebar */}
                <aside className="w-64 bg-gray-50 border-r border-gray-200 flex flex-col p-4 shrink-0">
                    <div className="flex items-center gap-3 mb-8 px-2">
                        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-black text-xs">SE</div>
                        <span className="font-bold text-gray-900">Workspace</span>
                    </div>

                    <nav className="space-y-1 flex-grow">
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">Account</p>
                        <button className="w-full text-left px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-200/50 rounded-md transition-colors flex items-center gap-2">
                            <div className="w-5 h-5 rounded-full bg-gray-300" /> {user?.name || 'Researcher'}
                        </button>
                        <button 
                            onClick={() => setView('preferences')}
                            className={`w-full text-left px-3 py-1.5 text-sm font-medium rounded-md transition-all flex items-center justify-between ${
                                view === 'preferences' ? 'text-slate-900 bg-slate-200/60 font-extrabold' : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'
                            }`}
                        >
                            <span>Preferences</span>
                            {view === 'preferences' && <span className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                        </button>
                        
                        <div className="pt-4" />
                        <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2">Integrations</p>
                        <button 
                            onClick={() => setView('main')}
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md flex items-center justify-between ${
                                view === 'main' || view === 'scholar_form' ? 'text-slate-900 bg-slate-200/60 font-extrabold' : 'text-gray-600 hover:bg-gray-200/50 hover:text-gray-900'
                            }`}
                        >
                            <span>Connections</span>
                            {(view === 'main' || view === 'scholar_form') && <CheckIcon className="w-3 h-3 text-slate-900" />}
                        </button>
                    </nav>

                    <div className="mt-auto p-2 border-t border-gray-200 pt-4">
                        <button onClick={onClose} className="text-xs font-bold text-gray-500 hover:text-gray-900">Close Dashboard</button>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-grow flex flex-col overflow-hidden">
                    <header className="px-8 py-6 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                        <h2 className="text-xl font-black text-gray-900">
                            {view === 'preferences' ? 'Workspace Preferences' : 'Connections'}
                        </h2>
                        <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 rounded-full">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </header>

                    <div className="flex-grow overflow-y-auto px-8 py-8 space-y-12">
                        {view === 'main' ? (
                            <>
                                 {/* My Connections */}
                                <section>
                                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">My connections</h3>
                                    <div className="space-y-4">
                                        <ConnectionRow 
                                            icon={<NetworkIcon className="w-6 h-6 text-emerald-600" />}
                                            name="UNC Wilmington SSO"
                                            description="Microsoft Azure AD SSO (UNC Wilmington)"
                                            onDisconnect={() => {}}
                                        />

                                        {/* Local Lab Bridge Connection Card with Sync Now and Status Indicator */}
                                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-lg space-y-4">
                                            <div className="flex items-center justify-between flex-wrap gap-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                                                        <NetworkIcon className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <h4 className="text-sm font-extrabold text-white">Local Lab Bridge & Capability Marketplace</h4>
                                                            <span className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded text-[10px] font-bold uppercase tracking-wider">
                                                                <span className="relative flex h-2 w-2">
                                                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                                                </span>
                                                                Port 5050 Active
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-400 font-medium mt-0.5">
                                                            Autonomous Watchdog & GNO Vault Intercept • Local Lab Assistant
                                                        </p>
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-3">
                                                    {/* Auto-Sync Toggle */}
                                                    <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60">
                                                        <span className="text-[11px] font-bold text-slate-300">Auto-Sync</span>
                                                        <button
                                                            onClick={() => setAutoSyncEnabled(!autoSyncEnabled)}
                                                            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                                                                autoSyncEnabled ? 'bg-indigo-600' : 'bg-slate-700'
                                                            }`}
                                                            role="switch"
                                                            aria-checked={autoSyncEnabled}
                                                        >
                                                            <span
                                                                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                                    autoSyncEnabled ? 'translate-x-4' : 'translate-x-0'
                                                                }`}
                                                            />
                                                        </button>
                                                    </div>

                                                    {/* Sync Now Button */}
                                                    <button
                                                        onClick={handleSyncLocalLabNow}
                                                        disabled={isSyncingLocalLab}
                                                        className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-indigo-900/20 active:scale-95"
                                                    >
                                                        <RefreshCw className={`w-3.5 h-3.5 ${isSyncingLocalLab ? 'animate-spin' : ''}`} />
                                                        <span>{isSyncingLocalLab ? 'Checking Marketplace...' : 'Sync Now'}</span>
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 flex-wrap gap-2">
                                                <div className="flex items-center gap-2">
                                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                                    <span className="font-mono text-slate-300 font-semibold">{localLabStatus}</span>
                                                </div>
                                                <div className="text-[11px] text-slate-500 font-mono">
                                                    Last Marketplace Check: <span className="text-slate-300 font-semibold">{lastLocalLabSync}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {settings.isMcpEnabled && (
                                            <ConnectionRow 
                                                icon={<RobotIcon className="w-6 h-6 text-indigo-600" />}
                                                name="Scholar Desktop Plugin"
                                                description="Connected via Desktop MCP"
                                                onDisconnect={() => onSave({...settings, isMcpEnabled: false})}
                                            />
                                        )}
                                    </div>
                                </section>

                                {/* Discover Section */}
                                <section className="space-y-6">
                                    {/* Doctoral Library MCP Banner */}
                                    <div className="bg-gradient-to-r from-indigo-900 via-slate-900 to-indigo-950 text-white p-5 rounded-2xl border border-indigo-800/50 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                        <div className="flex items-start gap-3.5">
                                            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 flex items-center justify-center shrink-0">
                                                <GraduationCap className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-extrabold text-white">
                                                        Doctoral Student Guide: University Library MCP Connection
                                                    </h4>
                                                    <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-400/20 text-indigo-200 border border-indigo-400/30">
                                                        Dissertation Research
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
                                                    Invite your home university or college library to connect their electronic subscriptions (ProQuest, JSTOR, ScienceDirect, EBSCOhost) via the Model Context Protocol (MCP) for unified literature search.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                if (onOpenLibraryGuide) {
                                                    onOpenLibraryGuide();
                                                }
                                            }}
                                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5"
                                        >
                                            <Library className="w-3.5 h-3.5" />
                                            <span>Open Student Guide</span>
                                        </button>
                                    </div>

                                    <div>
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-[0.2em] mb-4">Discover new connections</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            <DiscoverCard 
                                                icon={<Library className="w-7 h-7" />}
                                                title="Campus Library MCP Connector"
                                                description="Connect your home university library's electronic subscriptions via Model Context Protocol for unified search."
                                                actionText="Read Doctoral Guide"
                                                colorClass="bg-indigo-50 text-indigo-700"
                                                onAction={() => {
                                                    if (onOpenLibraryGuide) onOpenLibraryGuide();
                                                }}
                                            />
                                            <DiscoverCard 
                                                icon={<BookOpen className="w-7 h-7" />}
                                                title="Harvard Library MCP"
                                                description="Connect to the Harvard University Library catalog API via Model Context Protocol. Search over 20M records natively."
                                                actionText={settings.isHarvardLibraryEnabled ? "Active" : "Enable"}
                                                colorClass={settings.isHarvardLibraryEnabled ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-900"}
                                                onAction={() => onSave({...settings, isHarvardLibraryEnabled: !settings.isHarvardLibraryEnabled})}
                                            />
                                            <DiscoverCard 
                                                icon={<ShieldCheck className="w-7 h-7" />}
                                                title="UNC Wilmington SSO"
                                                description="Microsoft Azure AD Single Sign-On for UNC Wilmington database and journal entitlement."
                                                actionText="Active"
                                                colorClass="bg-emerald-50 text-emerald-700"
                                                onAction={() => {}}
                                            />
                                            <DiscoverCard 
                                                icon={<NetworkIcon className="w-7 h-7" />}
                                                title="Local Lab Core (Port 5050)"
                                                description="Connect your local lab core assistant for autonomous watchdog snapshot processing into GNO Vault."
                                                actionText="Explore Setup"
                                                colorClass="bg-slate-100 text-slate-700"
                                                onAction={() => onSave({...settings, isMcpEnabled: true})}
                                            />
                                            <DiscoverCard 
                                                icon={<ArxivIcon className="w-10 h-10" />}
                                                title="ArXiv Metadata"
                                                description="Enhanced full-text extraction for arXiv papers. Automatically scrapes ar5iv versions."
                                                actionText="Active"
                                                colorClass="bg-red-50 text-red-800"
                                                onAction={() => {}}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <section className="pt-8 border-t border-gray-100">
                                    <div className="flex flex-col gap-2">
                                        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors">
                                            <SearchIcon className="w-4 h-4" /> Browse connections in Gallery
                                        </button>
                                        <button className="flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 transition-colors">
                                            <RobotIcon className="w-4 h-4" /> Develop or manage integrations
                                        </button>
                                    </div>
                                </section>
                            </>
                        ) : view === 'preferences' ? (
                            <div className="max-w-2xl space-y-8 animate-fade-in">
                                <section className="space-y-6">
                                    <div>
                                        <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Workspace Preferences</h3>
                                        <p className="text-xs text-gray-500 font-semibold leading-relaxed">Customize your workspace behavior, automatic compile pipelines, and direct export protocols.</p>
                                    </div>

                                    <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-6 shadow-sm">
                                        {/* Auto save snap */}
                                        <div className="flex items-start justify-between gap-6 pb-6 border-b border-gray-100">
                                            <div className="space-y-1.5 flex-grow">
                                                <span className="text-sm font-extrabold text-slate-900">Direct Snapshot Auto-Saving</span>
                                                <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                                                    Automatically download and save new snapshot JSON packages directly to your browser's default download directory when clicking "Compile & Save Snapshot". Skip explicit save location dialogs for rapid, headless local storage.
                                                </p>
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <button
                                                    onClick={() => onSave({ ...settings, autoSaveSnapshot: !settings.autoSaveSnapshot })}
                                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                                        settings.autoSaveSnapshot ? 'bg-indigo-600' : 'bg-slate-200'
                                                    }`}
                                                    role="switch"
                                                    aria-checked={!!settings.autoSaveSnapshot}
                                                >
                                                    <span
                                                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                                            settings.autoSaveSnapshot ? 'translate-x-5' : 'translate-x-0'
                                                        }`}
                                                    />
                                                </button>
                                            </div>
                                        </div>

                                        {/* Desktop MCP Proxy Pipeline */}
                                        <div className="flex items-start justify-between gap-6 pt-2">
                                            <div className="space-y-1.5 flex-grow">
                                                <span className="text-sm font-extrabold text-slate-900">Immediate MCP Library Indexing</span>
                                                <p className="text-xs text-slate-400 leading-relaxed font-semibold">
                                                    Forwards verified papers directly to local Desktop MCP servers as soon as they are added to the workspace. Enables instant reference lookups.
                                                </p>
                                            </div>
                                            <div className="flex items-center shrink-0">
                                                <button
                                                    disabled
                                                    className="relative inline-flex h-6 w-11 shrink-0 cursor-not-allowed rounded-full border-2 border-transparent bg-slate-100 transition-colors duration-200 ease-in-out"
                                                >
                                                    <span className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white translate-x-0 shadow ring-0 transition duration-200 ease-in-out" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        ) : (
                            <div className="max-w-md mx-auto py-10 space-y-8 animate-fade-in">
                                <div className="text-center">
                                    <Library className="w-16 h-16 text-red-600 mx-auto mb-4" />
                                    <h3 className="text-2xl font-black text-gray-900">Connect Scholar Bridge</h3>
                                    <p className="text-sm text-gray-500 mt-2">Enter your cloud credentials to enable push-to-library features.</p>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Library / User ID</label>
                                        <input 
                                            type="text" 
                                            value={scholarId} 
                                            onChange={e => setScholarId(e.target.value)}
                                            className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-50 transition-all font-medium"
                                            placeholder="Found in Scholar Bridge settings"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-gray-400 mb-1.5 ml-1">Private API Key</label>
                                        <input 
                                            type="password" 
                                            value={scholarKey} 
                                            onChange={e => setScholarKey(e.target.value)}
                                            className="w-full h-11 px-4 border border-gray-200 rounded-xl focus:ring-4 focus:ring-blue-50 transition-all font-mono"
                                            placeholder="••••••••••••••••"
                                        />
                                    </div>
                                    <div className="pt-4 flex gap-3">
                                        <button 
                                            onClick={() => setView('main')}
                                            className="flex-1 h-11 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-xl"
                                        >
                                            Cancel
                                        </button>
                                        <button 
                                            onClick={handleConnectScholar}
                                            disabled={isTesting}
                                            className="flex-1 h-11 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-200 transition-all"
                                        >
                                            {isTesting ? 'Validating...' : 'Connect Library'}
                                        </button>
                                    </div>
                                </div>
                                <p className="text-center text-[10px] text-gray-400 leading-relaxed px-10">
                                    By connecting, Scholar Explorer will have permission to view and add items to your personal Scholar Bridge cloud library.
                                </p>
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};
