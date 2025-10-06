
import React from 'react';
import type { ResearchPaper } from '../types';
import { PaperCard } from './PaperCard';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  favoritePapers: ResearchPaper[];
  onToggleFavorite: (paper: ResearchPaper) => void;
  onFindConnectedPapers: (paper: ResearchPaper) => void;
  isFindingConnected: string | null;
  onAnalyzePaper: (paper: ResearchPaper) => void;
  isAnalyzingPaper: string | null;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ papers, favoritePapers, onToggleFavorite, onFindConnectedPapers, isFindingConnected, onAnalyzePaper, isAnalyzingPaper }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">Research Papers Found</h2>
      {papers.map((paper, index) => {
        const isFavorite = favoritePapers.some(p => p.title === paper.title && p.authors === paper.authors);
        return (
            <PaperCard 
                key={paper.title + index} 
                paper={paper} 
                isFavorite={isFavorite}
                onToggleFavorite={onToggleFavorite}
                onFindConnectedPapers={onFindConnectedPapers}
                isFindingConnected={isFindingConnected === paper.title}
                onAnalyzePaper={onAnalyzePaper}
                isAnalyzingPaper={isAnalyzingPaper === paper.title}
            />
        );
      })}
    </div>
  );
};
