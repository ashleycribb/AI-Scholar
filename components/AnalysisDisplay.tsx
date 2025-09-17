import React from 'react';
import type { ResearchPaper, AnalysisResult, PublicationYearData } from '../types';
import { PublicationYearChart } from './PublicationYearChart';
import { ClusterResults } from './ClusterResults';
import { ExportButton } from './ExportButton';

interface AnalysisDisplayProps {
  papers: ResearchPaper[];
  result: AnalysisResult;
}

export const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({ papers, result }) => {

  const publicationYearData: PublicationYearData = papers.reduce((acc, paper) => {
    const year = paper.year.match(/\d{4}/)?.[0]; // Extract 4-digit year
    if (year) {
      acc[year] = (acc[year] || 0) + 1;
    }
    return acc;
  }, {} as PublicationYearData);

  const exportData = {
    publicationYearDistribution: publicationYearData,
    topicClusters: result.clusters,
  };

  return (
    <div className="mt-10 pt-6 border-t border-gray-200 space-y-8">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">Analysis & Visualization</h2>
        <ExportButton data={exportData} filename="research_analysis.json" />
      </div>
      
      <PublicationYearChart data={publicationYearData} />
      <ClusterResults clusters={result.clusters} />
    </div>
  );
};