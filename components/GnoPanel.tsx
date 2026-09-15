import React, { useState, useEffect } from 'react';
import { gnoService, GnoSearchResult, GnoAskResponse } from '../services/gnoService';
import { UserSettings } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { SparklesIcon, DatabaseIcon, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface GnoPanelProps {
    userSettings: UserSettings;
}

export const GnoPanel: React.FC<GnoPanelProps> = ({ userSettings }) => {
    const [status, setStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
    const [mode, setMode] = useState<'search' | 'ask'>('search');
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [searchResults, setSearchResults] = useState<GnoSearchResult[]>([]);
    const [askResponse, setAskResponse] = useState<GnoAskResponse | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkConnection();
    }, [userSettings.gnoBaseUrl]);

    const checkConnection = async () => {
        if (!userSettings.isGnoEnabled) {
            setStatus('disconnected');
            return;
        }
        
        setStatus('checking');
        if (userSettings.gnoBaseUrl) {
            gnoService.setBaseUrl(userSettings.gnoBaseUrl);
        }
        
        const isConnected = await gnoService.checkStatus();
        setStatus(isConnected ? 'connected' : 'disconnected');
    };

    const handleSearch = async () => {
        if (!query.trim()) return;
        
        setIsLoading(true);
        setError(null);
        setSearchResults([]);
        setAskResponse(null);

        try {
            if (mode === 'search') {
                const results = await gnoService.query(query);
                setSearchResults(results);
            } else {
                const response = await gnoService.ask(query);
                setAskResponse(response);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to fetch results from GNO. Ensure the service is running.');
        } finally {
            setIsLoading(false);
        }
    };

    if (!userSettings.isGnoEnabled) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                <div className="p-4 bg-muted rounded-full">
                    <DatabaseIcon className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-lg font-semibold">GNO Integration Disabled</h3>
                <p className="text-muted-foreground max-w-md">
                    Enable GNO in settings to access local document processing and retrieval.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Status Bar */}
            <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-border">
                <div className="flex items-center gap-2">
                    <DatabaseIcon className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-medium">Local GNO Service</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                    {status === 'checking' && <span className="text-muted-foreground">Checking...</span>}
                    {status === 'connected' && (
                        <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                            <CheckCircle2 className="w-4 h-4" /> Connected
                        </span>
                    )}
                    {status === 'disconnected' && (
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1.5 text-red-500 font-medium">
                                <XCircle className="w-4 h-4" /> Disconnected
                            </span>
                            <button onClick={checkConnection} className="text-xs underline text-muted-foreground hover:text-foreground">
                                Retry
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {status === 'disconnected' && (
                <div className="p-4 bg-red-50 border border-red-100 rounded-lg text-sm text-red-800">
                    <p className="font-semibold mb-1">Could not connect to GNO</p>
                    <p>Make sure GNO is running locally on <code>{userSettings.gnoBaseUrl || 'http://localhost:3000/api'}</code>.</p>
                    <p className="mt-2 text-xs opacity-80">Run <code>gno server</code> in your terminal.</p>
                </div>
            )}

            {/* Search Input */}
            <div className="space-y-4">
                <div className="flex gap-2">
                    <button
                        onClick={() => setMode('search')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'search' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                    >
                        Search
                    </button>
                    <button
                        onClick={() => setMode('ask')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-2 ${mode === 'ask' ? 'bg-primary text-primary-foreground' : 'bg-muted hover:bg-muted/80'}`}
                    >
                        <SparklesIcon className="w-4 h-4" /> Ask AI
                    </button>
                </div>

                <div className="relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        placeholder={mode === 'search' ? "Search local documents..." : "Ask a question about your documents..."}
                        className="w-full h-12 pl-4 pr-12 rounded-lg border bg-background focus:ring-2 focus:ring-primary/20 transition-all"
                        disabled={status !== 'connected'}
                    />
                    <button
                        onClick={handleSearch}
                        disabled={isLoading || status !== 'connected'}
                        className="absolute right-2 top-2 p-2 text-muted-foreground hover:text-primary disabled:opacity-50"
                    >
                        <SearchIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Results */}
            {isLoading && (
                <div className="py-12 flex justify-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
            )}

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {!isLoading && mode === 'search' && searchResults.length > 0 && (
                <div className="space-y-4">
                    {searchResults.map((result) => (
                        <div key={result.id} className="p-4 bg-card border rounded-lg hover:shadow-md transition-shadow">
                            <div className="flex justify-between items-start mb-2">
                                <h4 className="font-medium text-primary truncate pr-4">{result.id}</h4>
                                <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                                    {Math.round(result.score * 100)}%
                                </span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-3">{result.content}</p>
                        </div>
                    ))}
                </div>
            )}

            {!isLoading && mode === 'ask' && askResponse && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                    <div className="p-6 bg-muted/30 rounded-xl border">
                        <div className="markdown-body text-sm leading-relaxed">
                            <ReactMarkdown>{askResponse.answer}</ReactMarkdown>
                        </div>
                    </div>
                    
                    {askResponse.citations && askResponse.citations.length > 0 && (
                        <div>
                            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Sources</h4>
                            <div className="grid gap-2">
                                {askResponse.citations.map((cite, i) => (
                                    <div key={i} className="text-xs p-2 bg-muted rounded border truncate">
                                        {cite}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
