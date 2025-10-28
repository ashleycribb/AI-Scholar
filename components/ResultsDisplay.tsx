import React, { useMemo } from 'react';
import type { ResearchPaper, SortConfig, SortKey, Project } from '../types';
import { PaperCard } from './PaperCard';
import { RemoveIcon } from './icons/RemoveIcon';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  selectedPaper: ResearchPaper | null;
  onSelectPaper: (paper: ResearchPaper) => void;
  sortConfig: SortConfig;
  onSortChange: (config: SortConfig) => void;
  onRemovePaper: (paper: ResearchPaper) => void;
  onToggleWorkspacePaper: (paper: ResearchPaper) => void;
  workspacePapers: ResearchPaper[];
  onFindConnectedPapers: (paper: ResearchPaper) => void;
  paperBeingConnected: string | null;
  projects: Project[];
  onAddAndAssignToProject: (paper: ResearchPaper, projectId: string) => void;
  onExcludeLowScoring: () => void;
  showHighRelevanceOnly: boolean;
  onShowHighRelevanceOnlyChange: (show: boolean) => void;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({
  papers, selectedPaper, onSelectPaper, sortConfig, onSortChange, onRemovePaper,
  onToggleWorkspacePaper, workspacePapers, onFindConnectedPapers, paperBeingConnected,
  projects, onAddAndAssignToProject, onExcludeLowScoring, showHighRelevanceOnly, onShowHighRelevanceOnlyChange
}) => {

  const handleSort = (key: SortKey) => {
    const newDirection = sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc';
    onSortChange({ key, direction: newDirection });
  };

  const hasLowScoringPapers = useMemo(() => papers.some(p => (p.semanticScore ?? 100) < 30), [papers]);

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
      <div className="flex justify-between items-center border-b pb-2 mb-2 sticky top-[80px] bg-background z-10 py-2 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-foreground">
          Search Results ({papers.length})
        </h2>
        <div className="flex items-center gap-2">
             {hasLowScoringPapers && (
                <button 
                    onClick={onExcludeLowScoring}
                    className="h-8 px-3 text-xs font-semibold rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors flex items-center gap-1.5"
                    title="Hide papers with a relevance score below 30 and exclude them from subsequent searches in this session."
                >
                    <RemoveIcon className="w-4 h-4"/>
                    Exclude Low-Scoring
                </button>
            )}
            <div className="flex items-center gap-1.5">
                <label htmlFor="high-relevance-toggle" className="text-xs font-medium text-muted-foreground">High Relevance (75+)</label>
                <button
                    type="button"
                    role="switch"
                    aria-checked={showHighRelevanceOnly}
                    onClick={() => onShowHighRelevanceOnlyChange(!showHighRelevanceOnly)}
                    className={`${showHighRelevanceOnly ? 'bg-primary' : 'bg-muted'} relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`}
                >
                    <span
                        aria-hidden="true"
                        className={`${showHighRelevanceOnly ? 'translate-x-4' : 'translate-x-0'} pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                    />
                </button>
            </div>
             <div className="h-5 w-px bg-border mx-1"></div>
            <div className="flex items-center gap-1 text-xs">
                <span className="font-medium text-muted-foreground mr-1">Sort by:</span>
                <button onClick={() => handleSort('relevance')} className={getButtonClasses('relevance')}>Relevance {renderSortIcon('relevance')}</button>
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
                  semanticScore={paper.semanticScore}
                  isOrigin={false}
                  isSelected={selectedPaper?.id === paper.id}
                  onSelectPaper={onSelectPaper}
                  onRemovePaper={onRemovePaper}
                  isInWorkspace={workspacePaperIds.has(paper.id)}
                  onToggleWorkspace={onToggleWorkspacePaper}
                  onFindConnectedPapers={onFindConnectedPapers}
                  isFindingConnected={paperBeingConnected === paper.id}
                  projects={projects}
                  onAddAndAssignToProject={onAddAndAssignToProject}
              />
          );
        })}
      </div>
    </div>
  );
};
