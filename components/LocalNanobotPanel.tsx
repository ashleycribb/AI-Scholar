
import React, { useState, useEffect } from 'react';
import { getVaultFiles, verifyPaperWithLogician } from '../services/localAgentService';
import { DatabaseIcon, FileTextIcon, PlayIcon, ShieldCheckIcon, TerminalIcon, AlertCircleIcon, CheckCircleIcon } from 'lucide-react';

export const LocalNanobotPanel: React.FC = () => {
    const [files, setFiles] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isVerifying, setIsVerifying] = useState<string | null>(null);
    const [results, setResults] = useState<Record<string, string>>({});
    const [error, setError] = useState<string | null>(null);

    const loadFiles = async () => {
        setIsLoading(true);
        const vaultFiles = await getVaultFiles();
        setFiles(vaultFiles);
        setIsLoading(false);
    };

    useEffect(() => {
        loadFiles();
    }, []);

    const handleVerify = async (fileName: string) => {
        setIsVerifying(fileName);
        try {
            const output = await verifyPaperWithLogician(fileName);
            setResults(prev => ({ ...prev, [fileName]: output }));
        } catch (e) {
            setError("Failed to run verification nanobot.");
        } finally {
            setIsVerifying(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <ShieldCheckIcon className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-lg font-bold">Logician Nanobot</h3>
                </div>
                <button 
                    onClick={loadFiles}
                    className="text-xs font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded"
                >
                    Refresh Vault
                </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
                The Logician Nanobot performs Neuro-Symbolic verification. It reads literature from your local 
                <code className="mx-1 bg-muted px-1 rounded">/vault</code>, checks it against the EdTech logic engine, 
                and writes a Trust Audit to your DuckDB Tensor LRS.
            </p>

            {isLoading ? (
                <div className="py-12 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                </div>
            ) : files.length === 0 ? (
                <div className="p-8 text-center bg-muted/20 border-2 border-dashed rounded-xl">
                    <FileTextIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                    <p className="text-sm text-muted-foreground">No papers found in vault.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {files.map(file => (
                        <div key={file} className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-200 transition-all shadow-sm group">
                            <div className="flex items-center justify-between gap-4">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <div className="p-2 bg-indigo-50 rounded-lg shrink-0">
                                        <FileTextIcon className="w-4 h-4 text-indigo-600" />
                                    </div>
                                    <span className="text-sm font-bold truncate text-slate-700">{file}</span>
                                </div>
                                <button 
                                    onClick={() => handleVerify(file)}
                                    disabled={!!isVerifying}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-tighter transition-all ${
                                        isVerifying === file 
                                        ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                        : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-md shadow-indigo-100'
                                    }`}
                                >
                                    {isVerifying === file ? (
                                        <>Running...</>
                                    ) : (
                                        <>
                                            <PlayIcon className="w-3 h-3 fill-current" />
                                            Verify
                                        </>
                                    )}
                                </button>
                            </div>

                            {results[file] && (
                                <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase text-indigo-600 mb-2 border-t pt-3">
                                        <TerminalIcon className="w-3 h-3" />
                                        <span>Agent Logs</span>
                                        {results[file].includes('Verified') && (
                                            <span className="ml-auto flex items-center gap-1 text-emerald-600">
                                                <CheckCircleIcon className="w-3 h-3" /> Trust Audit Passed
                                            </span>
                                        )}
                                        {results[file].includes('Disputed') && (
                                            <span className="ml-auto flex items-center gap-1 text-amber-600">
                                                <AlertCircleIcon className="w-3 h-3" /> Violation Detected
                                            </span>
                                        )}
                                    </div>
                                    <pre className="p-3 bg-slate-900 text-slate-300 text-[10px] font-mono rounded-lg overflow-x-auto whitespace-pre-wrap leading-relaxed border border-slate-800">
                                        {results[file]}
                                    </pre>
                                    <div className="mt-2 flex items-center gap-2">
                                        <DatabaseIcon className="w-3 h-3 text-slate-400" />
                                        <span className="text-[10px] text-slate-400 font-medium italic">Statement committed to DuckDB Tensor LRS</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
            
            {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg text-xs text-red-600 flex items-center gap-2">
                    <AlertCircleIcon className="w-4 h-4" />
                    {error}
                </div>
            )}
        </div>
    );
};
