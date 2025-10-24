
import React from 'react';
import type { ResearchPaper, SortConfig, SortKey } from '../types';
import { PaperCard } from './PaperCard';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaper: ResearchPaper | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  onRemovePaper: (paper: ResearchPaper) => void;
  onToggleWorkspacePaper: (paper: ResearchPaper) => void;
  workspacePapers: ResearchPaper[];
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  papers, selectedPaper, onSelectPaper, sortConfig, onSortChange, onRemovePaper,
  onToggleWorkspacePaper, workspacePapers
}) => {

  const handleSort = (key: SortKey) => {
    const newDirection = sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc';
    onSortChange({ key, direction: newDirection });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
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
  
  const workspacePaperIds = new Set(workspacePapers.map(p => p.id));

  return (
    <div>
      <div className="flex justify-between items-center border-b pb-2 mb-2 sticky top-[80px] bg-background z-10 py-2">
        <h2 className="text-lg font-bold text-foreground">
          Search Results ({papers.length})
        </h2>
        <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
                <span className="font-medium text-muted-foreground mr-1">Sort by:</span>
                <button onClick={() => handleSort('semanticRelevance')} className={getButtonClasses('semanticRelevance')}>Semantic Relevance {renderSortIcon('semanticRelevance')}</button>
                <button onClick={() => handleSort('year')} className={getButtonClasses('year')}>Year {renderSortIcon('year')}</button>
                <button onClick={() => handleSort('citations')} className={getButtonClasses('citations')}>Citations {renderSortIcon('citations')}</button>
                <button onClick={() => handleSort('validationScore')} className={getButtonClasses('validationScore')}>Validity {renderSortIcon('validationScore')}</button>
            </div>
        </div>
      </div>
      <div className="space-y-2">
        {papers.map((paper) => {
          return (
              <PaperCard 
                  key={paper.id} 
                  paper={paper} 
                  isOrigin={false}
                  isSelected={selectedPaper?.id === paper.id}
                  onSelectPaper={onSelectPaper}
                  onRemovePaper={onRemovePaper}
                  isInWorkspace={workspacePaperIds.has(paper.id)}
                  onToggleWorkspace={onToggleWorkspacePaper}
              />
          );
        })}
      </div>
    </div>
  );
};