import React from 'react';

interface SearchSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  onSuggestionClick: (suggestion: string) => void;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({ suggestions, isLoading, onSuggestionClick }) => {
  if (!isLoading && suggestions.length === 0) {
    return null;
  }

  return (
    <div className="absolute top-full mt-2 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-20">
      {isLoading ? (
        <div className="p-3 text-sm text-gray-500 text-center">
          Loading suggestions...
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {suggestions.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-2.5 text-gray-700 hover:bg-gray-100 transition-colors duration-150"
              >
                {suggestion}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};