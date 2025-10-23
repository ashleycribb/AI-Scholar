import React from 'react';
import type { PublicationYearData } from '../types';

interface PublicationYearChartProps {
  data: PublicationYearData;
}

export const PublicationYearChart: React.FC<PublicationYearChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
        <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
            <h4 className="text-lg font-semibold text-card-foreground mb-4">Papers by Publication Year</h4>
            <div className="flex items-center justify-center h-48 border-l border-b border-border">
                <p className="text-muted-foreground italic">No publication data available.</p>
            </div>
        </div>
    );
  }
  const sortedData = [...data].sort((a, b) => a.year - b.year);
  const maxCount = Math.max(...sortedData.map(item => item.count), 1);

  return (
    <div className="bg-card p-4 rounded-lg border border-border shadow-sm">
      <h4 className="text-lg font-semibold text-card-foreground mb-4">Papers by Publication Year</h4>
      <div className="flex items-end justify-around h-48 space-x-2 pt-4 border-l border-b border-border">
        {sortedData.map(({ year, count }) => {
          const heightPercentage = (count / maxCount) * 100;

          return (
            <div key={year} className="flex flex-col items-center flex-grow h-full justify-end">
                <span className="text-sm font-bold text-muted-foreground mb-1">{count}</span>
                <div
                    className="w-full bg-primary rounded-t-sm hover:bg-primary/90 transition-colors"
                    style={{ height: `${heightPercentage}%` }}
                    title={`${count} paper(s) in ${year}`}
                ></div>
                <span className="mt-2 text-xs font-medium text-muted-foreground">{year}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};