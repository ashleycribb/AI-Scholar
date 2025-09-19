
import React from 'react';
import type { ResearchPaper } from '../types';
import { PaperCard } from './PaperCard';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
  favoritePapers: ResearchPaper[];
  onToggleFavorite: (paper: ResearchPaper) => void;
  onDownloadPdf: (paper: ResearchPaper) => void;
  pdfLoading: string | null;
  onFindConnectedPapers: (paper: ResearchPaper) => void;
  isFindingConnected: string | null;
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ papers, favoritePapers, onToggleFavorite, onDownloadPdf, pdfLoading, onFindConnectedPapers, isFindingConnected }) => {
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
                onDownloadPdf={onDownloadPdf}
                isPdfLoading={pdfLoading === paper.title}
                onFindConnectedPapers={onFindConnectedPapers}
                isFindingConnected={isFindingConnected === paper.title}
            />
        );
      })}
    </div>
  );
};