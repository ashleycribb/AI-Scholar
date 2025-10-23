import React from 'react';
import type { AuthorFrequencyData } from '../types';

interface TopAuthorsChartProps {
  data: AuthorFrequencyData;
}

export const TopAuthorsChart: React.FC<TopAuthorsChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
            <h4 className="text-lg font-semibold text-card-foreground mb-4">Top Authors by Publication Count</h4>
            <div className="flex items-center justify-center h-24">
                <p className="text-muted-foreground italic">No author data available.</p>
            </div>
        </div>
    );
  }

  const sortedAuthors = [...data]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10); // Show top 10 authors

  const maxCount = sortedAuthors.length > 0 ? sortedAuthors[0].count : 1;

  return (
    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
      <h4 className="text-lg font-semibold text-card-foreground mb-4">Top Authors by Publication Count</h4>
      <div className="space-y-4">
        {sortedAuthors.map(({ author, count, totalCitations }) => {
          const widthPercentage = (count / maxCount) * 100;

          return (
            <div key={author} className="grid grid-cols-3 items-center gap-4 group">
              <div className="col-span-1">
                <p className="text-sm font-medium text-foreground truncate" title={author}>
                  {author}
                </p>
                <p className="text-xs text-muted-foreground">{totalCitations.toLocaleString()} total citations</p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <div className="w-full bg-muted rounded-full h-3">
                  <div
                    className="bg-primary h-3 rounded-full transition-all duration-500"
                    style={{ width: `${widthPercentage}%` }}
                    title={`${count} paper(s)`}
                  />
                </div>
                <span className="text-sm font-bold text-foreground w-8 text-right">{count}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};