import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength } from '../types';
import { generateSearchSuggestions } from '../services/geminiService';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchFormProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
}

export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading, summaryLength, onLengthChange }) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  // This flag controls whether the suggestion feature is active.
  const [suggestionsDisabled, setSuggestionsDisabled] = useState(false);
  const debounceTimeout = useRef<number | null>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 5) {
      setSuggestions([]);
      return;
    }
    setIsSuggesting(true);
    const result = await generateSearchSuggestions(query);
    setSuggestions(result);
    setIsSuggesting(false);
  }, []);

  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Disable suggestions if the main app is loading or if the user has made a selection.
    if (isLoading || suggestionsDisabled) {
      setSuggestions([]);
      return;
    }

    if (inputValue.trim()) {
      debounceTimeout.current = window.setTimeout(() => {
        fetchSuggestions(inputValue);
      }, 500); // 500ms debounce
    } else {
        setSuggestions([]);
    }

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [inputValue, fetchSuggestions, isLoading, suggestionsDisabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestionsDisabled(true); // Disable suggestions on search
    onSearch(inputValue);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setSuggestionsDisabled(true); // Disable suggestions after selection
    setInputValue(suggestion);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuggestionsDisabled(false); // Re-enable suggestions when user starts typing
    setInputValue(e.target.value);
  };

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder="e.g., 'machine learning in computational biology'"
              className="w-full pl-4 pr-12 py-3 bg-white border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200 text-base"
              disabled={isLoading}
              autoComplete="off"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                <SearchIcon className="w-5 h-5 text-gray-400" />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !inputValue.trim()}
            className="px-6 py-3 bg-blue-600 text-white font-semibold rounded-full hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>

        <div className="flex justify-center items-center gap-2">
          <span className="text-sm font-medium text-gray-600 mr-2">Summary Length:</span>
          {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
            <button
              key={len}
              type="button"
              onClick={() => onLengthChange(len)}
              aria-pressed={summaryLength === len}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                summaryLength === len
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {len.charAt(0).toUpperCase() + len.slice(1)}
            </button>
          ))}
        </div>
      </form>
      <SearchSuggestions
        suggestions={suggestions}
        isLoading={isSuggesting}
        onSuggestionClick={handleSuggestionClick}
      />
    </div>
  );
};