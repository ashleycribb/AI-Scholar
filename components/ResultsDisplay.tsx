




import React, { useMemo } from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaperId: string | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (key: SortKey) => void;
  isScreeningMode: boolean;
  onSetScreeningMode: (enabled: boolean) => void;
  onScreenPaper: (paperId: string, status: 'include' | 'exclude' | 'none') => void;
  onAiRerank: () => void;
  isReranking: boolean;
}

const sortOptions: { key: SortKey; label: string; available: (papers: ResearchPaper[]) => boolean }[] = [
    { key: 'relevance', label: 'Relevance', available: (papers) => papers.some(p => p.combinedScore !== undefined) },
    { key: 'year', label: 'Year', available: () => true },
    { key: 'citations', label: 'Citations', available: (papers) => papers.some(p => p.citations !== undefined) },
    { key: 'validationScore', label: 'Validation', available: (papers) => papers.some(p => p.validation !== undefined) },
    { key: 'screeningFitScore', label: 'Screening Fit', available: (papers) => papers.some(p => p.screeningFitScore !== undefined) },
];

const SortArrow: React.FC<{ direction: 'asc' | 'desc' }> = ({ direction }) => {
    const isAsc = direction === 'asc';
    return <ChevronDownIcon className={`w-3.5 h-3.5 ml-1 transition-transform ${isAsc ? 'rotate-0' : 'rotate-180'}`} />;
};

export const ResultsDisplay: React.FC<ResultsDisplayProps> = (props) => {
    const { papers, selectedPaperId, onSelectPaper, sortConfig, onSortChange, isScreeningMode, onSetScreeningMode, onScreenPaper, onAiRerank, isReranking } = props;

    const screeningStats = useMemo(() => {
        if (!isScreeningMode) return { included: 0, excluded: 0, none: 0 };
        return papers.reduce((acc, p) => {
            acc[p.screeningStatus || 'none']++;
            return acc;
        }, { include: 0, exclude: 0, none: 0 });
    }, [papers, isScreeningMode]);

    if (papers.length === 0) {
        return <p className="text-center text-muted-foreground py-10">No results found.</p>;
    }

    const screenedCount = screeningStats.include + screeningStats.exclude;

    return (
        <div className="space-y-4 text-left">
            {!isScreeningMode ? (
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
                    <h2 className="text-xl font-bold text-foreground">Search Results ({papers.length})</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={() => onSetScreeningMode(true)} className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent">Start Screening Session</button>
                        <div className="flex items-center flex-wrap gap-2">
                            <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
                            <div className="flex items-center bg-muted p-1 rounded-md">
                                {sortOptions.filter(opt => opt.available(papers)).map(opt => (
                                    <button
                                        key={opt.key}
                                        onClick={() => onSortChange(opt.key)}
                                        aria-pressed={sortConfig.key === opt.key}
                                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${sortConfig.key === opt.key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:bg-background/50'}`}
                                    >
                                        {opt.label}
                                        {sortConfig.key === opt.key && <SortArrow direction={sortConfig.direction} />}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-3">
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-primary">Screening Mode</h2>
                        <button onClick={() => onSetScreeningMode(false)} className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent">Exit Screening</button>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                        <p><strong className="text-green-600">{screeningStats.include}</strong> Included</p>
                        <p><strong className="text-red-600">{screeningStats.exclude}</strong> Excluded</p>
                        <p><strong>{screeningStats.none}</strong> Unscreened</p>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            onClick={onAiRerank}
                            disabled={isReranking || screenedCount < 3}
                            className="h-9 px-4 text-sm font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            {isReranking ? 'Re-ranking...' : 'AI Re-rank Unscreened'}
                        </button>
                        {screenedCount < 3 && <p className="text-xs text-muted-foreground">Screen at least 3 papers to enable AI re-ranking.</p>}
                    </div>
                </div>
            )}
            <div className="space-y-3">
                {papers.map((paper) => (
                    <PaperCard
                        key={paper.id}
                        paper={paper}
                        isSelected={paper.id === selectedPaperId}
                        onSelect={() => onSelectPaper(paper)}
                        isScreeningMode={isScreeningMode}
                        onScreenPaper={onScreenPaper}
                    />
                ))}
            </div>
        </div>
    );
};
