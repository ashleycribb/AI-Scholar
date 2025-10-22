import React from 'react';
import type { AnalysisResult } from '../types';
import { PublicationYearChart } from './PublicationYearChart';
import { TopAuthorsChart } from './TopAuthorsChart';

interface AnalysisInsightsProps {
  analysis: AnalysisResult;
}

export const AnalysisInsights: React.FC<AnalysisInsightsProps> = ({ analysis }) => {
  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold text-gray-800 mb-4">Thematic Clusters</h3>
        <div className="space-y-4">
          {analysis.clusters.map(cluster => (
            <div key={cluster.clusterName} className="bg-gray-50 border border-gray-200 p-4 rounded-lg">
              <h4 className="font-bold text-blue-700">{cluster.clusterName}</h4>
              <p className="text-sm text-gray-600 mt-1 mb-3">{cluster.description}</p>
              {cluster.keywords && cluster.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                      {cluster.keywords.map(keyword => (
                          <span key={keyword} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                              {keyword}
                          </span>
                      ))}
                  </div>
              )}
              <details>
                <summary className="text-sm font-medium text-gray-600 cursor-pointer hover:text-black">
                  View {cluster.paperTitles.length} related papers
                </summary>
                <ul className="list-disc list-inside mt-2 pl-2 text-sm text-gray-500">
                  {cluster.paperTitles.map(title => <li key={title}>{title}</li>)}
                </ul>
              </details>
            </div>
          ))}
        </div>
      </div>
      
      <PublicationYearChart data={analysis.publicationYears} />
      <TopAuthorsChart data={analysis.topAuthors} />
    </div>
  );
};