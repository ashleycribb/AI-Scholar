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


    useEffect(() => {
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

    return (
        <div className="p-4">
            <header className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-blue-800 rounded-md"></div>
                    <h1 className="text-lg font-bold text-slate-800">AI Research Explorer</h1>
                </div>
            </header>
            
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
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<Popup />);