
import React, { useState, useEffect } from 'react';
import { mcpService } from '../services/mcpService';
import * as scholarBridgeService from '../services/scholarBridgeService';
import type { McpStatus, LocalLibraryMetadata, UserSettings } from '../types';
import { Library } from 'lucide-react';
import { LoadingSpinner } from './LoadingSpinner';
import { CheckIcon } from './icons/CheckIcon';
import { WarningIcon } from './icons/WarningIcon';
import { RobotIcon } from './icons/RobotIcon';

interface LocalLibraryPanelProps {
    userSettings: UserSettings;
    onUpdateSettings: (s: UserSettings) => void;
}

export const LocalLibraryPanel: React.FC<LocalLibraryPanelProps> = ({ userSettings, onUpdateSettings }) => {
    const [status, setStatus] = useState<McpStatus>(mcpService.getStatus());
    const [libraryStats, setLibraryStats] = useState<LocalLibraryMetadata | null>(null);
    const [isConnecting, setIsConnecting] = useState(false);
    const [scholarCloudOk, setScholarCloudOk] = useState<boolean | null>(null);

    const refreshConnection = async () => {
        setIsConnecting(true);
        const newStatus = await mcpService.connect(userSettings.mcpServerUrl);
        setStatus(newStatus);
        if (newStatus.isConnected) {
            const stats = await mcpService.getLocalLibraryStats();
            setLibraryStats(stats);
        }
        
        // Also check Scholar Bridge Cloud
        if (userSettings.scholarBridgeUserId && userSettings.scholarBridgeApiKey) {
            const ok = await scholarBridgeService.validateScholarBridgeAuth(userSettings.scholarBridgeUserId, userSettings.scholarBridgeApiKey);
            setScholarCloudOk(ok);
        }
        
        setIsConnecting(false);
    };

    useEffect(() => {
        if (userSettings.isMcpEnabled || userSettings.isScholarBridgeEnabled) {
            refreshConnection();
        }
    }, [userSettings.isMcpEnabled, userSettings.isScholarBridgeEnabled, userSettings.mcpServerUrl]);

    return (
        <div className="space-y-6">
            <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
                <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 bg-indigo-600 text-white rounded-lg shadow-sm">
                        <Library className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-black text-indigo-900 leading-tight">Scholar Bridge</h3>
                        <p className="text-xs text-indigo-700 font-bold uppercase tracking-wider opacity-70">Research Intelligence Hub</p>
                    </div>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between p-3 bg-white/80 rounded-lg border border-indigo-200">
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${status.isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-300'}`} />
                            <span className="text-sm font-bold text-indigo-950">
                                Local Plugin (MCP): {status.isConnected ? 'Connected' : 'Offline'}
                            </span>
                        </div>
                        {status.isConnected && <CheckIcon className="w-4 h-4 text-green-600" />}
                    </div>

                    <div className="flex items-center justify-between p-3 bg-white/80 rounded-lg border border-indigo-200">
                        <div className="flex items-center gap-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${scholarCloudOk ? 'bg-green-500' : 'bg-slate-300'}`} />
                            <span className="text-sm font-bold text-indigo-950">
                                Cloud Library: {scholarCloudOk ? 'Authenticated' : 'Not Connected'}
                            </span>
                        </div>
                        {scholarCloudOk && <CheckIcon className="w-4 h-4 text-green-600" />}
                    </div>

                    <button 
                        onClick={refreshConnection}
                        disabled={isConnecting}
                        className="w-full mt-2 py-2 text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:bg-indigo-100/50 rounded transition-all"
                    >
                        {isConnecting ? 'Verifying Connections...' : 'Refresh Connections'}
                    </button>
                </div>
            </div>

            {status.isConnected && libraryStats ? (
                <div className="space-y-4 animate-fade-in">
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 bg-muted/40 rounded-xl border border-border text-center">
                            <span className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Local Papers</span>
                            <span className="text-2xl font-black text-foreground">{libraryStats.paperCount}</span>
                        </div>
                        <div className="p-4 bg-muted/40 rounded-xl border border-border text-center">
                            <span className="text-[10px] font-black uppercase text-muted-foreground block mb-1">Library Collections</span>
                            <span className="text-2xl font-black text-foreground">{libraryStats.collectionCount}</span>
                        </div>
                    </div>
                    
                    <div className="bg-primary/5 p-4 rounded-xl border border-dashed border-primary/20">
                        <h4 className="text-sm font-bold text-foreground flex items-center gap-2 mb-2">
                            <RobotIcon className="w-4 h-4 text-primary" />
                            Library Intelligence Enabled
                        </h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Scholar Plugin Template detected. AI can now map citation trails between your local library and new search results.
                        </p>
                    </div>
                </div>
            ) : !isConnecting && !status.isConnected && (
                <div className="space-y-4 text-center py-6 px-4">
                    <WarningIcon className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                    <h4 className="font-bold text-slate-700">Scholar Bridge Sync</h4>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        To enable direct push and library context, ensure your Scholar Bridge plugin is running or enter your <strong>Cloud API credentials</strong> in settings.
                    </p>
                </div>
            )}
        </div>
    );
};
