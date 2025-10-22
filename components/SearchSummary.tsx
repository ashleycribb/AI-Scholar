import React from 'react';
import { FormattedSummary } from './FormattedSummary';
import { SparklesIcon } from './icons/SparklesIcon';

interface SearchSummaryProps {
  summary: string;
}

export const SearchSummary: React.FC<SearchSummaryProps> = ({ summary }) => {
  if (!summary) return null;

  return (
    <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg mb-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-800 mb-2 flex items-center gap-2">
        <SparklesIcon className="w-6 h-6 text-blue-600" />
        AI-Generated Search Overview
      </h2>
      <FormattedSummary text={summary} />
    </div>
  );
};