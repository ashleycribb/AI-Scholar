
import React, { useState } from 'react';
import type { UserSettings } from '../types';
import { Library } from 'lucide-react';
import * as scholarBridgeService from '../services/scholarBridgeService';
import { LoadingSpinner } from './LoadingSpinner';

interface ScholarConnectModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: UserSettings;
    onSave: (settings: UserSettings) => void;
}

export const ScholarConnectModal: React.FC<ScholarConnectModalProps> = ({ isOpen, onClose, settings, onSave }) => {
    const [scholarId, setScholarId] = useState(settings.scholarBridgeUserId || '');
    const [scholarKey, setScholarKey] = useState(settings.scholarBridgeApiKey || '');
    const [scholarEnabled, setScholarEnabled] = useState(settings.isScholarBridgeEnabled || false);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

    if (!isOpen) return null;

    const handleTest = async () => {
        if (!scholarId || !scholarKey) {
            setTestResult({ success: false, message: 'Please enter both User ID and API Key.' });
            return;
        }
        setIsTesting(true);
        setTestResult(null);
        try {
            const ok = await scholarBridgeService.validateScholarBridgeAuth(scholarId, scholarKey);
            if (ok) {
                setTestResult({ success: true, message: 'Successfully connected to Scholar Bridge Cloud!' });
                setScholarEnabled(true);
            } else {
                setTestResult({ success: false, message: 'Authentication failed. Check your credentials.' });
            }
        } catch (e) {
            setTestResult({ success: false, message: 'Network error. Could not reach Scholar Bridge API.' });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = () => {
        onSave({
            ...settings,
            scholarBridgeUserId: scholarId.trim(),
            scholarBridgeApiKey: scholarKey.trim(),
            isScholarBridgeEnabled: scholarEnabled
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-xl shadow-2xl w-full max-w-md border border-border flex flex-col overflow-hidden animate-fade-in">
                <header className="p-5 border-b border-border bg-indigo-50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                            <Library className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-indigo-900">Scholar Bridge Cloud</h2>
                            <p className="text-xs text-indigo-700 font-bold uppercase tracking-widest opacity-70">Connect Library</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-muted-foreground hover:bg-accent rounded-full">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>

                <main className="p-6 space-y-6">
                    <div className="bg-muted/40 p-4 rounded-lg border border-border">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Connecting your Scholar Bridge account allows you to push research directly to your cloud library and enables the AI to cross-reference your existing collection.
                        </p>
                        <a 
                            href="#" 
                            onClick={(e) => e.preventDefault()} 
                            className="text-xs text-indigo-600 font-bold hover:underline mt-2 inline-block"
                        >
                            Find your API Key & User ID →
                        </a>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">Library / User ID</label>
                            <input 
                                type="text"
                                value={scholarId}
                                onChange={(e) => setScholarId(e.target.value)}
                                className="w-full h-10 px-4 rounded-md border bg-background text-sm focus:ring-2 focus:ring-indigo-500 transition-all"
                                placeholder="Your Scholar Bridge User ID"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1.5 ml-1">API Private Key</label>
                            <input 
                                type="password"
                                value={scholarKey}
                                onChange={(e) => setScholarKey(e.target.value)}
                                className="w-full h-10 px-4 rounded-md border bg-background text-sm focus:ring-2 focus:ring-indigo-500 transition-all font-mono"
                                placeholder="Enter your Private Key"
                            />
                        </div>
                        
                        <div className="flex items-center justify-between pt-2">
                             <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    checked={scholarEnabled} 
                                    onChange={(e) => setScholarEnabled(e.target.checked)} 
                                    className="w-4 h-4 rounded border-input text-indigo-600 focus:ring-indigo-500" 
                                />
                                <span className="text-sm font-bold text-foreground">Enable Cloud Sync</span>
                            </label>
                            <button 
                                onClick={handleTest}
                                disabled={isTesting}
                                className="text-xs font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                            >
                                {isTesting ? 'Verifying...' : 'Test Connection'}
                            </button>
                        </div>

                        {testResult && (
                            <div className={`p-3 rounded-lg text-xs font-bold border ${testResult.success ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                                {testResult.message}
                            </div>
                        )}
                    </div>
                </main>

                <footer className="p-4 bg-muted/30 border-t border-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 h-10 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                    <button 
                        onClick={handleSave}
                        className="px-6 h-10 rounded-md bg-indigo-600 text-white font-bold text-sm hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                    >
                        Save Configuration
                    </button>
                </footer>
            </div>
        </div>
    );
};
