import React, { useState, useEffect } from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';
import { BookOpen, ArrowUpDown, Download, Check, RefreshCw } from 'lucide-react';
import { downloadMetadataExport } from '../services/citationService';
import { trackExplorerExport } from '../services/explorerTrackingService';
import { isArxivUnavailable } from '../services/arxivService';

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
  searchQuery?: string;
  sourceNotice?: string | null;
  onRetryScoring?: () => void;
  onRetrySynthesis?: () => void;
}

const sortOptions: { key: SortKey; label: string }[] = [
    { key: 'relevance', label: 'Relevance' },
    { key: 'year', label: 'Year (Newest)' },
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
    onGenerateLaymanSummary,
    searchQuery,
    sourceNotice,
    onRetryScoring,
    onRetrySynthesis
}) => {
    // Check if we are still waiting for semantic scores for any paper
    const isCalculatingRelevance = papers.length > 0 && papers.some(p => p.semanticScore === undefined);
    const isAnyAiTaskRunning = isCalculatingRelevance || isAnalysisLoading || isSummaryLoading;

    const [isRelevanceTakingLong, setIsRelevanceTakingLong] = useState(false);
    const [isSummaryTakingLong, setIsSummaryTakingLong] = useState(false);

    useEffect(() => {
        if (!isCalculatingRelevance) {
            setIsRelevanceTakingLong(false);
            return;
        }
        const timer = setTimeout(() => {
            setIsRelevanceTakingLong(true);
        }, 30000);
        return () => clearTimeout(timer);
    }, [isCalculatingRelevance]);

    useEffect(() => {
        if (!isSummaryLoading) {
            setIsSummaryTakingLong(false);
            return;
        }
        const timer = setTimeout(() => {
            setIsSummaryTakingLong(true);
        }, 30000);
        return () => clearTimeout(timer);
    }, [isSummaryLoading]);

    const showArxivNotice = sourceNotice === 'arXiv unavailable' || isArxivUnavailable();

    if (papers.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-20 text-center bg-white rounded-2xl border border-slate-200/80 shadow-2xs">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mb-3 text-slate-400">
                    <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-base font-semibold text-slate-900">No Scholarly Works Found</h3>
                <p className="text-xs text-slate-500 max-w-sm mt-1">Try broadening your research question, removing specific year limits, or searching by DOI.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-200/80">
                <div>
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-xl font-bold text-slate-900">
                            Found {papers.length} Scholarly Works
                        </h3>
                        {selectedDomain && selectedDomain !== 'all' && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs font-medium rounded-md border border-slate-200">
                                {selectedDomain.replace('_', ' ')}
                            </span>
                        )}
                        <span className="text-[11px] text-slate-400 font-medium">
                            Sources: OpenAlex · Crossref · Semantic Scholar
                            {showArxivNotice ? (
                                <span className="ml-1.5 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                                    arXiv unavailable
                                </span>
                            ) : (
                                ' · arXiv'
                            )}
                        </span>
                    </div>
                    {isAnyAiTaskRunning && (
                        <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-500">
                            {isCalculatingRelevance && (
                                <div className="flex items-center gap-1.5 text-slate-600">
                                    {isRelevanceTakingLong ? (
                                        <>
                                            <span className="text-amber-700 font-medium">Taking longer than usual</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsRelevanceTakingLong(false);
                                                    if (onRetryScoring) {
                                                        onRetryScoring();
                                                    } else if (typeof window !== 'undefined') {
                                                        window.dispatchEvent(new CustomEvent('scholar:retry-scoring'));
                                                    }
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold transition-colors"
                                            >
                                                <RefreshCw className="w-2.5 h-2.5" />
                                                <span>Retry</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-ping" />
                                            <span>Analyzing…</span>
                                        </>
                                    )}
                                </div>
                            )}
                            {isSummaryLoading && (
                                <div className="flex items-center gap-1.5 text-indigo-600">
                                    {isSummaryTakingLong ? (
                                        <>
                                            <span className="text-amber-700 font-medium">Taking longer than usual</span>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsSummaryTakingLong(false);
                                                    if (onRetrySynthesis) {
                                                        onRetrySynthesis();
                                                    } else if (typeof window !== 'undefined') {
                                                        window.dispatchEvent(new CustomEvent('scholar:retry-synthesis'));
                                                    }
                                                }}
                                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-semibold transition-colors"
                                            >
                                                <RefreshCw className="w-2.5 h-2.5" />
                                                <span>Retry</span>
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping" />
                                            <span>Synthesizing…</span>
                                        </>
                                    )}
                                </div>
                            )}
                            {isAnalysisLoading && (
                                <div className="flex items-center gap-1.5 text-emerald-600">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                                    <span>Extracting thematic patterns...</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                
                {/* Action Toolbar: Export Metadata (BibTeX/RIS/CSV) & Sort Controls */}
                <div className="flex flex-wrap items-center gap-2">
                    {/* Export Metadata */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs text-xs">
                        <span className="text-slate-400 px-2 flex items-center gap-1">
                            <Download className="w-3 h-3 text-slate-500" />
                            <span className="font-semibold text-slate-700">Export:</span>
                        </span>
                        <button
                            type="button"
                            onClick={() => {
                                downloadMetadataExport(papers, 'bibtex', 'scholar-explorer-works');
                                trackExplorerExport('bibtex', papers.map(p => ({ id: p.openalex_id || p.id, title: p.title })));
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Export all current results as BibTeX (.bib)"
                        >
                            BibTeX
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                downloadMetadataExport(papers, 'ris', 'scholar-explorer-works');
                                trackExplorerExport('ris', papers.map(p => ({ id: p.openalex_id || p.id, title: p.title })));
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Export all current results as RIS (.ris)"
                        >
                            RIS
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                downloadMetadataExport(papers, 'csv', 'scholar-explorer-works');
                                trackExplorerExport('csv', papers.map(p => ({ id: p.openalex_id || p.id, title: p.title })));
                            }}
                            className="px-2 py-1 text-xs font-semibold rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                            title="Export all current results as CSV (.csv)"
                        >
                            CSV
                        </button>
                    </div>

                    {/* Sort controls */}
                    <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                        <span className="text-xs text-slate-400 px-2 flex items-center gap-1">
                            <ArrowUpDown className="w-3 h-3" />
                            <span className="hidden sm:inline">Sort:</span>
                        </span>
                        {sortOptions.map((option) => (
                            <button
                                key={option.key}
                                onClick={() => onSortChange(option.key)}
                                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors ${
                                    sortConfig.key === option.key 
                                        ? 'bg-slate-900 text-white' 
                                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                                }`}
                            >
                                {option.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {papers.map((paper, index) => {
                    const paperKey = (typeof paper.id === 'string' && paper.id && !paper.id.includes('[object Object]'))
                        ? `${paper.id}-${index}`
                        : `paper-${paper.doi || index}-${index}`;
                    return (
                        <PaperCard 
                            key={paperKey} 
                            paper={paper} 
                            isSelected={paper.id === selectedPaperId}
                            onSelect={() => onSelectPaper(paper)}
                            isInWorkspace={workspacePaperIds.has(paper.id)}
                            onToggleWorkspace={() => onToggleWorkspace(paper)}
                            onGenerateLaymanSummary={onGenerateLaymanSummary}
                            searchQuery={searchQuery}
                        />
                    );
                })}
            </div>

            {hasMore && (
                <div className="flex justify-center pt-4 pb-2">
                    <button
                        onClick={onLoadMore}
                        disabled={isLoadingMore}
                        className="px-5 py-2 text-xs font-semibold bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs disabled:opacity-50 flex items-center gap-2"
                    >
                        {isLoadingMore ? (
                            <>
                                <div className="w-3.5 h-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
                                <span>Loading more works...</span>
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
