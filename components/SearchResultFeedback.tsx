import React from 'react';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { ThumbsDownIcon } from './icons/ThumbsDownIcon';

interface SearchResultFeedbackProps {
  query: string;
  onOpenFeedbackModal: () => void;
}

export const SearchResultFeedback: React.FC<SearchResultFeedbackProps> = ({ onOpenFeedbackModal }) => {
  return (
    <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-gray-50 rounded-lg border">
      <p className="text-sm font-medium text-gray-700">Are these results helpful?</p>
      <div className="flex gap-2">
        <button
          onClick={onOpenFeedbackModal}
          className="p-2 rounded-full text-gray-500 hover:bg-green-100 hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Results were helpful"
        >
          <ThumbsUpIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenFeedbackModal}
          className="p-2 rounded-full text-gray-500 hover:bg-red-100 hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Results were not helpful"
        >
          <ThumbsDownIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};
