
import React from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaperId: string | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (key: SortKey) => void;
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

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ papers, selectedPaperId, onSelectPaper, sortConfig, onSortChange }) => {
  if (papers.length === 0) {
    return <p className="text-center text-muted-foreground py-10">No results found.</p>;
  }

  return (
    <div className="space-y-4 text-left">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <h2 className="text-xl font-bold text-foreground">
            Search Results ({papers.length})
        </h2>
        <div className="flex items-center flex-wrap gap-2">
            <span className="text-sm font-medium text-muted-foreground">Sort by:</span>
            <div className="flex items-center bg-muted p-1 rounded-md">
                {sortOptions.filter(opt => opt.available(papers)).map(opt => (
                    <button
                        key={opt.key}
                        onClick={() => onSortChange(opt.key)}
                        aria-pressed={sortConfig.key === opt.key}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-sm px-2.5 py-1 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                            sortConfig.key === opt.key
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:bg-background/50'
                        }`}
                    >
                        {opt.label}
                        {sortConfig.key === opt.key && <SortArrow direction={sortConfig.direction} />}
                    </button>
                ))}
            </div>
        </div>
      </div>
      <div className="space-y-3">
        {papers.map((paper) => (
          <PaperCard 
            key={paper.id} 
            paper={paper} 
            isSelected={paper.id === selectedPaperId}
            onSelect={() => onSelectPaper(paper)}
          />
        ))}
      </div>
    </div>
  );
};
