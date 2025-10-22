
import React from 'react';
import type { AnalysisResult } from '../types';
import { PublicationYearChart } from './PublicationYearChart';
import { TopAuthorsChart } from './TopAuthorsChart';
import { FormattedSummary } from './FormattedSummary';
import { SparklesIcon } from './icons/SparklesIcon';

interface AnalysisDashboardProps {
  analysis: AnalysisResult | null;
  summary: string;
}

export const AnalysisDashboard: React.FC<AnalysisDashboardProps> = ({ analysis, summary }) => {
  return (
    <div className="space-y-6">
        {summary && (
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg shadow-sm">
                <h3 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-blue-600" />
                    AI-Generated Search Overview
                </h3>
                <FormattedSummary text={summary} />
            </div>
        )}
        
        {analysis && (
            <>
                <div>
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">Thematic Clusters</h3>
                    <div className="space-y-3">
                        {analysis.clusters.map(cluster => (
                            <div key={cluster.clusterName} className="bg-gray-50 border border-gray-200 p-3 rounded-lg">
                                <h4 className="font-bold text-blue-700 text-sm">{cluster.clusterName}</h4>
                                <p className="text-xs text-gray-600 mt-1 mb-2">{cluster.description}</p>
                                {cluster.keywords && cluster.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {cluster.keywords.map(keyword => (
                                            <span key={keyword} className="px-2 py-0.5 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
                
                <PublicationYearChart data={analysis.publicationYears} />
                <TopAuthorsChart data={analysis.topAuthors} />
            </>
        )}
    </div>
  );
};
