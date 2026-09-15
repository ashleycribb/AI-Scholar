
import React, { useState } from 'react';
import type { UserSettings } from '../types';
import { ProxyIcon } from './icons/ProxyIcon';
import { Library, Database as DatabaseIcon, ShieldCheck } from 'lucide-react';

interface ProxySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onSave: (settings: UserSettings) => void;
}

export const ProxySettingsModal: React.FC<ProxySettingsModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [proxyUrl, setProxyUrl] = useState(settings.institutionalProxy || '');
    const [instName, setInstName] = useState(settings.institutionName || '');
    const [oaiUrl, setOaiUrl] = useState(settings.oaiEndpoint || '');
    const [oaiEnabled, setOaiEnabled] = useState(settings.isOaiEnabled || false);
    
    // Scholar Bridge State
    const [scholarId, setScholarId] = useState(settings.scholarBridgeUserId || '');
    const [scholarKey, setScholarKey] = useState(settings.scholarBridgeApiKey || '');
    const [scholarEnabled, setScholarEnabled] = useState(settings.isScholarBridgeEnabled || false);

    // GNO State
    const [gnoEnabled, setGnoEnabled] = useState(settings.isGnoEnabled || false);
    const [gnoUrl, setGnoUrl] = useState(settings.gnoBaseUrl || 'http://localhost:3000/api');

    // SerpApi State
    const [serpApiEnabled, setSerpApiEnabled] = useState(settings.isSerpApiEnabled || false);
    const [serpApiKey, setSerpApiKey] = useState(settings.serpApiKey || '');

    if (!isOpen) return null;

    const handleSave = () => {
        onSave({
            ...settings,
            institutionalProxy: proxyUrl.trim(),
            institutionName: instName.trim(),
            oaiEndpoint: oaiUrl.trim(),
            isOaiEnabled: oaiEnabled,
            scholarBridgeUserId: scholarId.trim(),
            scholarBridgeApiKey: scholarKey.trim(),
            isScholarBridgeEnabled: scholarEnabled,
            isGnoEnabled: gnoEnabled,
            gnoBaseUrl: gnoUrl.trim(),
            isSerpApiEnabled: serpApiEnabled,
            serpApiKey: serpApiKey.trim()
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-lg shadow-2xl w-full max-w-lg border border-border flex flex-col overflow-hidden animate-fade-in">
                <header className="p-5 border-b border-border bg-muted/30 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-2 rounded-lg">
                            <ProxyIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Institutional SSO & Advanced Config</h2>
                            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">UNC Wilmington & Local Integration</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-accent rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <main className="p-6 space-y-8 overflow-y-auto max-h-[70vh]">
                    {/* GNO Local Integration */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-emerald-600 flex items-center gap-2">
                                <DatabaseIcon className="w-4 h-4" /> GNO Local Processing
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={gnoEnabled} onChange={(e) => setGnoEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                            </label>
                        </div>
                        
                        <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-lg">
                            <p className="text-xs text-emerald-800 leading-relaxed">
                                Connect to a local GNO instance for private, offline document processing and retrieval.
                            </p>
                        </div>

                        <div className={`grid grid-cols-1 gap-4 transition-opacity ${gnoEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">GNO API URL</label>
                                <input 
                                    type="text"
                                    value={gnoUrl}
                                    onChange={(e) => setGnoUrl(e.target.value)}
                                    className="w-full h-10 px-4 rounded-md border bg-background text-sm focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
                                    placeholder="http://localhost:3000/api"
                                />
                                <p className="text-[10px] text-muted-foreground mt-1 ml-1">
                                    Ensure GNO is running locally. If running on the same machine, use a different port than this app (default 3000).
                                </p>
                            </div>
                        </div>
                    </div>

                    <hr className="border-border" />

                    {/* Google Scholar (SerpApi) Settings */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-blue-600 flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg> Google Scholar (SerpApi)
                            </h3>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input type="checkbox" checked={serpApiEnabled} onChange={(e) => setSerpApiEnabled(e.target.checked)} className="sr-only peer" />
                                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            </label>
                        </div>
                        
                        <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg">
                            <p className="text-xs text-blue-800 leading-relaxed">
                                Enable Google Scholar search integration. Requires a free API key from <a href="https://serpapi.com" target="_blank" rel="noreferrer" className="underline font-bold">SerpApi</a>.
                            </p>
                        </div>

                        <div className={`grid grid-cols-1 gap-4 transition-opacity ${serpApiEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">SerpApi Key</label>
                                <input 
                                    type="password"
                                    value={serpApiKey}
                                    onChange={(e) => setSerpApiKey(e.target.value)}
                                    className="w-full h-10 px-4 rounded-md border bg-background text-sm focus:ring-2 focus:ring-blue-500 transition-all font-mono"
                                    placeholder="Enter your SerpApi Key"
                                />
                            </div>
                        </div>
                    </div>

                    <hr className="border-border" />

                    {/* Microsoft SSO Integration (UNC Wilmington) */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-black uppercase tracking-[0.1em] text-indigo-600">
                                Microsoft SSO Integration
                            </h3>
                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                UNCW Active
                            </span>
                        </div>
                        
                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg">
                            <p className="text-xs text-indigo-900 leading-relaxed font-medium">
                                Scholar Explorer connects via <strong>UNC Wilmington (UNCW) Microsoft Single Sign-On (SSO)</strong> to verify credentials and provide direct access to institutional databases.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">Institution Name</label>
                                <input 
                                    type="text"
                                    value={instName || 'UNC Wilmington'}
                                    onChange={(e) => setInstName(e.target.value)}
                                    className="w-full h-10 px-4 rounded-md border bg-background text-sm font-semibold"
                                    placeholder="UNC Wilmington"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">SSO Tenant / Login Endpoint</label>
                                <input 
                                    type="text"
                                    value={proxyUrl || 'https://login.microsoftonline.com/uncw.edu'}
                                    onChange={(e) => setProxyUrl(e.target.value)}
                                    className="w-full h-10 px-4 rounded-md border bg-background text-sm font-mono"
                                    placeholder="https://login.microsoftonline.com/uncw.edu"
                                />
                            </div>
                        </div>
                    </div>
                </main>

                <footer className="p-4 bg-muted/30 border-t border-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 h-10 text-sm font-semibold text-muted-foreground hover:text-foreground">Cancel</button>
                    <button 
                        onClick={handleSave}
                        className="px-6 h-10 rounded-md bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                    >
                        Save & Apply
                    </button>
                </footer>
            </div>
        </div>
    );
};
