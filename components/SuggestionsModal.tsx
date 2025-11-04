

import React from 'react';
import type { SuggestionsResult } from '../types';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';
import { SearchIcon } from './icons/SearchIcon';

interface SuggestionsModalProps {
  isOpen: boolean;
  result: SuggestionsResult | null;
  onClose: () => void;
  error: string | null;
  isLoading: boolean;
  onSuggestionClick: (query: string) => void;
}

export const SuggestionsModal: React.FC<SuggestionsModalProps> = ({ isOpen, result, onClose, error, isLoading, onSuggestionClick }) => {
  if (!isOpen) {
    return null;
  }

  const seedPaper = result?.seedPaper;

  return (
    <div
      className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestions-modal-title"
    >
      <div
        className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all border"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-border sticky top-0 bg-card rounded-t-xl z-10">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-yellow-400/20 text-yellow-600 p-2 rounded-full">
                <LightbulbIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="suggestions-modal-title" className="text-xl font-bold text-foreground">
                  New Search Ideas
                </h2>
                {seedPaper && <p className="text-sm text-muted-foreground mt-1 truncate">Based on: {seedPaper.title}</p>}
             </div>
           </div>
        </header>
        
        <main className="p-6 overflow-y-auto">
          {isLoading && <LoadingSpinner message="Generating new ideas..." />}
          {error && <ErrorMessage message={error} />}
          {result?.suggestions && result.suggestions.length > 0 && !error && (
            <div className="space-y-3">
              {result.suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => onSuggestionClick(suggestion)}
                  className="w-full text-left p-3 bg-muted/50 border border-border rounded-lg hover:bg-accent hover:border-primary/20 transition-colors group"
                >
                  <p className="font-medium text-foreground group-hover:text-primary flex items-center gap-2">
                    <SearchIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary" />
                    <span>{suggestion}</span>
                  </p>
                </button>
              ))}
            </div>
          )}
          {result?.suggestions.length === 0 && !isLoading && !error && (
             <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-foreground">No Suggestions Generated</h3>
                <p className="text-muted-foreground mt-2">We couldn't generate new search ideas for this paper.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};