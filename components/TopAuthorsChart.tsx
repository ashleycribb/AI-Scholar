import React from 'react';
import type { AuthorFrequencyData } from '../types';

interface TopAuthorsChartProps {
  data: AuthorFrequencyData;
}

export const TopAuthorsChart: React.FC<TopAuthorsChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Top Authors</h3>
            <div className="flex items-center justify-center h-24">
                <p className="text-gray-500 italic">No author data available for this result set.</p>
            </div>
        </div>
    );
  }

  const sortedAuthors = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Show top 10 authors

  const maxCount = sortedAuthors.length > 0 ? sortedAuthors[0].count : 1;

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Top Authors</h3>
      <div className="space-y-4">
        {sortedAuthors.map(({ author, count, totalCitations }) => {
          const widthPercentage = (count / maxCount) * 100;

          return (
            <div key={author} className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 group">
              <div className="w-full sm:w-1/3">
                <p className="text-sm font-medium text-gray-700 truncate" title={author}>
                  {author}
                </p>
                <p className="text-xs text-gray-500">{totalCitations.toLocaleString()} total citations</p>
              </div>
              <div className="w-full sm:w-2/3 flex items-center gap-2">
                <div className="w-full bg-gray-200 rounded-full h-4">
                  <div
                    className="bg-green-500 h-4 rounded-full transition-all duration-500"
                    style={{ width: `${widthPercentage}%` }}
                    title={`${count} paper(s)`}
                  />
                </div>
                <span className="text-sm font-bold text-gray-600">{count}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};