
import React from 'react';
import type { AnalysisResult } from '../types';
import { PublicationYearChart } from './PublicationYearChart';
import { TopAuthorsChart } from './TopAuthorsChart';
import { FormattedSummary } from './FormattedSummary';
import { SparklesIcon } from './icons/SparklesIcon';

interface SearchResultsAnalysisProps {
  analysis: AnalysisResult | null;
  summary: string;
  isSummaryLoading: boolean;
}

export const SearchResultsAnalysis: React.FC<SearchResultsAnalysisProps> = ({ analysis, summary, isSummaryLoading }) => {
  return (
    <div className="space-y-6">
        {isSummaryLoading ? (
            <div className="bg-accent/50 border-l-4 border-primary/50 p-4 rounded-r-lg shadow-sm animate-pulse">
                 <div className="flex items-center gap-2 mb-2">
                     <div className="w-6 h-6 bg-primary/20 rounded-full"></div>
                     <div className="h-5 bg-primary/20 rounded w-1/3"></div>
                 </div>
                 <div className="space-y-2">
                     <div className="h-4 bg-primary/10 rounded w-full"></div>
                     <div className="h-4 bg-primary/10 rounded w-5/6"></div>
                     <div className="h-4 bg-primary/10 rounded w-4/6"></div>
                 </div>
            </div>
        ) : summary && (
            <div className="bg-accent/50 border-l-4 border-primary p-4 rounded-r-lg shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                    <SparklesIcon className="w-6 h-6 text-primary" />
                    AI-Generated Search Overview
                </h3>
                <FormattedSummary text={summary} />
            </div>
        )}
        
        {analysis && (
            <>
                {analysis.clusters.length > 0 && <div>
                    <h3 className="text-lg font-semibold text-foreground mb-3">Thematic Clusters</h3>
                    <div className="space-y-3">
                        {analysis.clusters.map(cluster => (
                            <div key={cluster.clusterName} className="bg-muted/50 border border-border p-3 rounded-lg">
                                <h4 className="font-bold text-primary text-sm">{cluster.clusterName}</h4>
                                <p className="text-xs text-muted-foreground mt-1 mb-2">{cluster.description}</p>
                                {cluster.keywords && cluster.keywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {cluster.keywords.map(keyword => (
                                            <span key={keyword} className="px-2 py-0.5 bg-primary/10 text-primary text-xs font-medium rounded-full">
                                                {keyword}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>}
                
                {(analysis.publicationYears.length > 0 || analysis.topAuthors.length > 0) &&
                    <div className="space-y-6 pt-4">
                        <h3 className="text-xl font-bold text-foreground border-b border-border pb-2">Bibliometric Insights</h3>
                        <PublicationYearChart data={analysis.publicationYears} />
                        <TopAuthorsChart data={analysis.topAuthors} />
                    </div>
                }
            </>
        )}
    </div>
  );
};