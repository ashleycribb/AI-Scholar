import React from 'react';
import { SearchIcon } from './icons/SearchIcon';

interface SearchSuggestionsProps {
  suggestions: string[];
  isLoading: boolean;
  onSuggestionClick: (suggestion: string) => void;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({ suggestions, isLoading, onSuggestionClick }) => {
  return (
    <div className="absolute top-full mt-2 w-full bg-card rounded-lg shadow-lg border border-border z-20 animate-fade-in">
      {isLoading && suggestions.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground text-center">
          Generating suggestions...
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {suggestions.map((suggestion, index) => (
            <li key={index}>
              <button
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="w-full text-left px-4 py-2.5 text-foreground hover:bg-muted transition-colors duration-150 flex items-center gap-2"
              >
                <SearchIcon className="w-4 h-4 text-muted-foreground" />
                <span>{suggestion}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};