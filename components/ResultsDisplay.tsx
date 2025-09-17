
import React from 'react';
import type { ResearchPaper } from '../types';
import { PaperCard } from './PaperCard';

interface ResultsDisplayProps {
  papers: ResearchPaper[];
}

export const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ papers }) => {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-2">Research Papers Found</h2>
      {papers.map((paper, index) => (
        <PaperCard key={paper.title + index} paper={paper} />
      ))}
    </div>
  );
};
