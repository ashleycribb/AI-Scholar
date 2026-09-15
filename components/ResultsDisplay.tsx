
import React from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';
import { SparklesIcon } from './icons/SparklesIcon';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaperId: string | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (key: SortKey) => void;
  workspacePaperIds: Set<string>;
  onToggleWorkspace: (paper: ResearchPaper) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  isAnalysisLoading?: boolean;
  isSummaryLoading?: boolean;
  selectedDomain?: string;
  onGenerateLaymanSummary?: (paper: ResearchPaper) => void;
}

const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'relevance', label: 'AI Relevance' },
    { key: 'year', label: 'Recent' },
    { key: 'citations', label: 'Citations' },
];

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ 
    papers = [], 
    selectedPaperId, 
    onSelectPaper,
    sortConfig,
    onSortChange,
    workspacePaperIds,
    onToggleWorkspace,
    hasMore,
    onLoadMore,
    isLoadingMore,
    isAnalysisLoading,
    isSummaryLoading,
    selectedDomain,
    onGenerateLaymanSummary
}) => {
    // Check if we are still waiting for semantic scores for any paper
    const isCalculatingRelevance = papers.length > 0 && papers.some(p => p.semanticScore === undefined);
    const isAnyAiTaskRunning = isCalculatingRelevance || isAnalysisLoading || isSummaryLoading;

    if (papers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-xl border border-dashed border-slate-200">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                    </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-700">No Research Papers Found</h3>
                <p className="text-sm text-slate-400 max-w-xs mt-1">Try adjusting your filters or expanding your research question.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-end gap-6 pb-6 border-b border-slate-200">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                        <span className="micro-label">Search Results</span>
                        {selectedDomain && selectedDomain !== 'all' && (
                            <span className="ml-2 px-2 py-0.5 bg-indigo-50 text-indigo-600 text-[9px] font-black uppercase tracking-widest rounded-md border border-indigo-100 italic">
                                {selectedDomain.replace('_', ' ')}
                            </span>
                        )}
                    </div>
                    <h2 className="text-4xl font-extrabold tracking-tight text-slate-900">Found {papers.length} Articles</h2>
                    {isAnyAiTaskRunning && (
                        <div className="flex flex-col gap-1 mt-3">
                            {isCalculatingRelevance && (
                                <div className="flex items-center gap-2 text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">
                                    <div className="w-1 h-1 bg-slate-400 rounded-full animate-ping" />
                                    <span>Calculating Semantic Relevance...</span>
                                </div>
                            )}
                            {isSummaryLoading && (
                                <div className="flex items-center gap-2 text-[10px] font-black text-indigo-500 uppercase tracking-widest animate-pulse">
                                    <div className="w-1 h-1 bg-indigo-400 rounded-full animate-ping" />
                                    <span>Synthesizing AI Summary...</span>
                                </div>
                            )}
                            {isAnalysisLoading && (
                                <div className="flex items-center gap-2 text-[10px] font-black text-emerald-500 uppercase tracking-widest animate-pulse">
                                    <div className="w-1 h-1 bg-emerald-400 rounded-full animate-ping" />
                                    <span>Generating Thematic Analysis...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 w-full sm:w-auto">
                    {sortOptions.map((option) => (
                        <button
                            key={option.key}
                            onClick={() => onSortChange(option.key)}
                            className={`flex-grow sm:flex-grow-0 px-4 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${
                                sortConfig.key === option.key 
                                    ? 'bg-white text-slate-900 shadow-sm' 
                                    : 'text-slate-400 hover:text-slate-600'
                            }`}
                        >
                            {option.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
                {papers.map((paper) => (
                    <PaperCard 
                        key={paper.id} 
                        paper={paper} 
                        isSelected={paper.id === selectedPaperId}
                        onSelect={() => onSelectPaper(paper)}
                        isInWorkspace={workspacePaperIds.has(paper.id)}
                        onToggleWorkspace={() => onToggleWorkspace(paper)}
                        onGenerateLaymanSummary={onGenerateLaymanSummary}
                    />
                ))}
            </div>

            {hasMore && (
                <div className="flex justify-center pt-6 pb-2">
                    <button
                        onClick={onLoadMore}
                        disabled={isLoadingMore}
                        className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-full shadow-sm hover:bg-slate-50 hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isLoadingMore ? (
                            <>
                                <div className="w-4 h-4 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" />
                                <span>Loading...</span>
                            </>
                        ) : (
                            <span>Load More Results</span>
                        )}
                    </button>
                </div>
            )}
        </div>
    );
};
