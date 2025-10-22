import React from 'react';
import type { PublicationYearData } from '../types';

interface PublicationYearChartProps {
  data: PublicationYearData;
}

export const PublicationYearChart: React.FC<PublicationYearChartProps> = ({ data }) => {
  if (!data || data.length === 0) {
    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Papers by Publication Year</h3>
            <div className="flex items-center justify-center h-48 border-l border-b border-gray-200">
                <p className="text-gray-500 italic">No publication data available for this result set.</p>
            </div>
        </div>
    );
  }
  const sortedData = [...data].sort((a, b) => a.year - b.year);
  const maxCount = Math.max(...sortedData.map(item => item.count), 1);

  return (
    <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
      <h3 className="text-xl font-semibold text-gray-800 mb-4">Papers by Publication Year</h3>
      <div className="flex items-end justify-around h-48 space-x-2 pt-4 border-l border-b border-gray-200">
        {sortedData.map(({ year, count }) => {
          const heightPercentage = (count / maxCount) * 100;

          return (
            <div key={year} className="flex flex-col items-center flex-grow h-full justify-end">
                <span className="text-sm font-bold text-gray-600 mb-1">{count}</span>
                <div
                    className="w-full bg-blue-500 rounded-t-sm hover:bg-blue-600 transition-colors"
                    style={{ height: `${heightPercentage}%` }}
                    title={`${count} paper(s) in ${year}`}
                ></div>
                <span className="mt-2 text-xs font-medium text-gray-500">{year}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};