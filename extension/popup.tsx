// Fix: Replaced triple-slash directive with a global declaration for 'chrome' to resolve type errors.
declare const chrome: any;

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import type { LocalPaper } from './lib/types';
import { scrapePageMetadata } from './lib/scraper';

const Popup: React.FC = () => {
    const [papers, setPapers] = useState<LocalPaper[]>([]);
    const [loading, setLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Settings state
    const [showSettings, setShowSettings] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [keySaved, setKeySaved] = useState(false);


    useEffect(() => {
        // Load stored API key
        chrome.storage.local.get(['geminiApiKey'], (result: any) => {
            if (result && result.geminiApiKey) {
                setApiKey(result.geminiApiKey);
            }
        });

        chrome.runtime.sendMessage({ action: 'getSavedPapers' }, (response) => {
            if (response?.success) {
                setPapers(response.papers);
            }
            setLoading(false);
        });
        
        const channel = new BroadcastChannel('ai_research_explorer_channel');
        const handleChannelMessage = (event: MessageEvent) => {
             if (event.data.type === 'paper_saved') {
                setIsSaving(false); // Stop saving indicator when paper is confirmed saved
                setPapers(prev => [event.data.paper, ...prev.filter(p => p.id !== event.data.paper.id)]);
             }
             if (event.data.type === 'paper_removed') {
                setPapers(prev => prev.filter(p => p.id !== event.data.paperId));
             }
        };
        channel.addEventListener('message', handleChannelMessage);
        
        return () => {
            channel.removeEventListener('message', handleChannelMessage);
            channel.close();
        };
    }, []);

    const handleGenericSave = () => {
        setIsSaving(true);
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.id) {
                chrome.scripting.executeScript(
                    {
                        target: { tabId: activeTab.id },
                        func: scrapePageMetadata,
                    },
                    (injectionResults) => {
                        if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                            console.error('Script injection failed:', chrome.runtime.lastError);
                            // Fallback to old method if injection fails (e.g., on protected pages)
                            const paper = {
                                title: activeTab.title || 'Untitled',
                                authors: 'N/A',
                                year: new Date().getFullYear(),
                                abstract: 'Could not automatically extract abstract.',
                                sourceURL: activeTab.url
                            };
                            chrome.runtime.sendMessage({ action: 'savePaper', paper });
                            return;
                        }
                        
                        const scrapedPaper = injectionResults[0].result;
                        chrome.runtime.sendMessage({ action: 'savePaper', paper: scrapedPaper });
                    }
                );
            } else {
                setIsSaving(false);
            }
        });
    };
    
    const handleDelete = (paperId: string) => {
        chrome.runtime.sendMessage({ action: 'deletePaper', paperId });
    };

    const handleSaveApiKey = () => {
        chrome.storage.local.set({ geminiApiKey: apiKey }, () => {
            setKeySaved(true);
            setTimeout(() => setKeySaved(false), 2000);
        });
    };

    return (
        <div className="p-4 w-80">
            <header className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-800 rounded-md"></div>
                    <h1 className="text-lg font-bold text-slate-800">AI Explorer</h1>
                </div>
                <button 
                    onClick={() => setShowSettings(!showSettings)}
                    className="text-slate-500 hover:text-slate-700 p-1 rounded hover:bg-slate-100 transition-colors"
                    title="Settings"
                >
                   <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                       <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                       <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                   </svg>
                </button>
            </header>

            {showSettings ? (
                <div className="mt-4 p-3 bg-slate-50 rounded-md border border-slate-200">
                    <h2 className="text-sm font-semibold text-slate-700 mb-2">Configuration</h2>
                    <div className="space-y-3">
                        <div>
                            <label htmlFor="apiKey" className="block text-xs font-medium text-slate-600 mb-1">Gemini API Key</label>
                            <input
                                id="apiKey"
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                className="w-full text-xs p-2 border border-slate-300 rounded focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="Enter your API Key"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Key is stored locally in your browser.</p>
                        </div>
                        <button
                            onClick={handleSaveApiKey}
                            className={`w-full py-1.5 text-xs font-semibold rounded transition-colors ${keySaved ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-slate-800 hover:bg-slate-900 text-white'}`}
                        >
                            {keySaved ? 'Saved!' : 'Save Key'}
                        </button>
                    </div>
                </div>
            ) : (
                <>
                    <div className="mt-4">
                        <button
                            onClick={handleGenericSave}
                            disabled={isSaving}
                            className="w-full text-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors disabled:bg-blue-400 disabled:cursor-wait"
                        >
                            {isSaving ? 'Saving...' : 'Save Current Page'}
                        </button>
                    </div>

                    <div className="mt-4">
                        <h2 className="text-sm font-semibold text-slate-600 mb-2">Recently Saved ({papers.length})</h2>
                        {loading ? <p className="text-sm text-slate-500">Loading...</p> : (
                            <ul className="space-y-2 max-h-64 overflow-y-auto">
                                {papers.length > 0 ? papers.map(paper => (
                                     <li key={paper.id} className="p-2 bg-white rounded-md border border-slate-200 text-sm group">
                                        <a href={paper.sourceURL} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-700 hover:text-blue-600 block truncate" title={paper.title}>
                                            {paper.title}
                                        </a>
                                        <div className="flex justify-between items-center">
                                            <p className="text-xs text-slate-500 truncate pr-2">{paper.authors}</p>
                                            <button
                                                onClick={() => handleDelete(paper.id)}
                                                className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity text-xs font-semibold"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </li>
                                )) : <p className="text-sm text-slate-500">No papers saved yet.</p>}
                            </ul>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);