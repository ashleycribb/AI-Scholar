
import React, { useRef, useEffect } from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaper: ResearchPaper | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  onMarkAsIrrelevant: (paper: ResearchPaper) => void;
  onRefineSearch: () => void;
  papersForCitation: Set<string>;
  onTogglePaperForCitation: (paper: ResearchPaper) => void;
  onSelectAllForCitation: () => void;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  papers, selectedPaper, onSelectPaper, sortConfig, onSortChange, onMarkAsIrrelevant, onRefineSearch,
  papersForCitation, onTogglePaperForCitation, onSelectAllForCitation
}) => {
  const selectAllCheckboxRef = useRef<HTMLInputElement>(null);

  const handleSort = (key: SortKey) => {
    if (key === 'relevance') {
      onSortChange({ key: 'relevance', direction: 'desc' });
      return;
    }
    const newDirection = sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc';
    onSortChange({ key, direction: newDirection });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key || key === 'relevance') return null;
    return sortConfig.direction === 'desc' 
        ? <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
        : <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" /></svg>;
  };

  const getButtonClasses = (key: SortKey) => {
    return `inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-8 px-3 gap-1 ${
        sortConfig.key === key 
        ? 'bg-muted text-foreground' 
        : 'text-muted-foreground hover:bg-muted/50'
    }`;
  };

  const numSelected = papersForCitation.size;
  const numTotalRelevant = papers.filter(p => !p.isIrrelevant).length;
  const isAllSelected = numTotalRelevant > 0 && numSelected === numTotalRelevant;
  const isIndeterminate = numSelected > 0 && numSelected < numTotalRelevant;
  const irrelevantCount = papers.filter(p => p.isIrrelevant).length;

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  return (
    <div>
      <div className="flex justify-between items-center border-b pb-2 mb-2 sticky top-[80px] bg-background z-10 py-2">
        <div className="flex items-center gap-3">
          <input
              type="checkbox"
              ref={selectAllCheckboxRef}
              checked={isAllSelected}
              onChange={onSelectAllForCitation}
              disabled={numTotalRelevant === 0}
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary disabled:opacity-50"
              title={isAllSelected ? "Deselect all" : "Select all relevant papers"}
              aria-label="Select all relevant papers for citation"
          />
          <h2 className="text-lg font-bold text-foreground">
            Search Results ({papers.length})
          </h2>
        </div>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
                <span className="font-medium text-muted-foreground mr-1">Sort by:</span>
                <button onClick={() => handleSort('relevance')} className={getButtonClasses('relevance')}>Relevance</button>
                <button onClick={() => handleSort('year')} className={getButtonClasses('year')}>Year {renderSortIcon('year')}</button>
                <button onClick={() => handleSort('citations')} className={getButtonClasses('citations')}>Citations {renderSortIcon('citations')}</button>
            </div>
            <button
                onClick={onRefineSearch}
                disabled={irrelevantCount === 0}
                className="h-8 px-3 inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 disabled:bg-primary/50"
                title={irrelevantCount > 0 ? `Rerun search excluding ${irrelevantCount} paper(s)` : 'Mark papers as irrelevant to refine search'}
            >
                Rerun Search
            </button>
        </div>
      </div>
      <div className="space-y-2">
        {papers.map((paper, index) => {
          return (
              <PaperCard 
                  key={paper.title + index} 
                  paper={paper} 
                  isOrigin={sortConfig.key === 'relevance' && index === 0}
                  isSelected={selectedPaper?.title === paper.title}
                  onSelectPaper={onSelectPaper}
                  onMarkAsIrrelevant={onMarkAsIrrelevant}
                  isSelectedForCitation={papersForCitation.has(paper.title)}
                  onToggleForCitation={onTogglePaperForCitation}
              />
          );
        })}
      </div>
    </div>
  );
};
