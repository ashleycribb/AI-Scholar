// Fix: Replaced triple-slash directive with a global declaration for 'chrome' to resolve type errors.
declare const chrome: any;

import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import type { LocalPaper } from './lib/types';

const Popup: React.FC = () => {
    const [papers, setPapers] = useState<LocalPaper[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        chrome.runtime.sendMessage({ action: 'getSavedPapers' }, (response) => {
            if (response?.success) {
                setPapers(response.papers);
            }
            setLoading(false);
        });
        
        const channel = new BroadcastChannel('ai_research_explorer_channel');
        channel.onmessage = (event) => {
             if (event.data.type === 'paper_saved') {
                setPapers(prev => [event.data.paper, ...prev]);
             }
             if (event.data.type === 'paper_removed') {
                setPapers(prev => prev.filter(p => p.id !== event.data.paperId));
             }
        };
        return () => channel.close();
    }, []);

    const handleGenericSave = () => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            const activeTab = tabs[0];
            if (activeTab?.title && activeTab.url) {
                const paper = {
                    title: activeTab.title,
                    authors: 'N/A',
                    year: new Date().getFullYear(),
                    abstract: 'No abstract captured. Saved from a generic page.',
                    sourceURL: activeTab.url
                };
                chrome.runtime.sendMessage({ action: 'savePaper', paper });
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
                    className="w-full text-center px-4 py-2 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700 transition-colors"
                >
                    Save Current Page
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