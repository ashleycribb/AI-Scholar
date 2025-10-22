
import React from 'react';
import type { ResearchPaper } from '../types';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { ErrorMessage } from './ErrorMessage';
import { LoadingSpinner } from './LoadingSpinner';
import { SearchIcon } from './icons/SearchIcon';

interface SuggestionsModalProps {
  result: {
    seedPaper: ResearchPaper;
    suggestions: string[];
  } | null;
  onClose: () => void;
  error: string | null;
  isLoading: boolean;
  onSuggestionClick: (query: string) => void;
}

export const SuggestionsModal: React.FC<SuggestionsModalProps> = ({ result, onClose, error, isLoading, onSuggestionClick }) => {
  if (!result && !isLoading) {
    return null;
  }

  const seedPaper = result?.seedPaper;

  return (
    <div
      className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="suggestions-modal-title"
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col transform transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="p-5 border-b border-gray-200 sticky top-0 bg-white rounded-t-xl z-10">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <div className="flex items-center gap-3">
             <div className="flex-shrink-0 bg-yellow-100 text-yellow-600 p-2 rounded-full">
                <LightbulbIcon className="w-6 h-6" />
             </div>
             <div>
                <h2 id="suggestions-modal-title" className="text-xl font-bold text-gray-800">
                  New Search Ideas
                </h2>
                {seedPaper && <p className="text-sm text-gray-500 mt-1 truncate">Based on: {seedPaper.title}</p>}
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
                  className="w-full text-left p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors group"
                >
                  <p className="font-medium text-gray-800 group-hover:text-blue-800 flex items-center gap-2">
                    <SearchIcon className="w-4 h-4 text-gray-400 group-hover:text-blue-600" />
                    <span>{suggestion}</span>
                  </p>
                </button>
              ))}
            </div>
          )}
          {result?.suggestions.length === 0 && !isLoading && !error && (
             <div className="text-center py-12">
                <h3 className="text-lg font-semibold text-gray-700">No Suggestions Generated</h3>
                <p className="text-gray-500 mt-2">We couldn't generate new search ideas for this paper.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
