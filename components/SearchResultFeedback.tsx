import React from 'react';
import { ThumbsUpIcon } from './icons/ThumbsUpIcon';
import { ThumbsDownIcon } from './icons/ThumbsDownIcon';

interface SearchResultFeedbackProps {
  query: string;
  onOpenFeedbackModal: () => void;
}

export const SearchResultFeedback: React.FC<SearchResultFeedbackProps> = ({ onOpenFeedbackModal }) => {
  return (
    <div className="flex items-center justify-center gap-4 mt-4 p-3 bg-muted/50 rounded-lg border">
      <p className="text-sm font-medium text-foreground">Are these results helpful?</p>
      <div className="flex gap-2">
        <button
          onClick={onOpenFeedbackModal}
          className="p-2 rounded-full text-muted-foreground hover:bg-accent hover:text-green-600 focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Results were helpful"
        >
          <ThumbsUpIcon className="w-5 h-5" />
        </button>
        <button
          onClick={onOpenFeedbackModal}
          className="p-2 rounded-full text-muted-foreground hover:bg-accent hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Results were not helpful"
        >
          <ThumbsDownIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};