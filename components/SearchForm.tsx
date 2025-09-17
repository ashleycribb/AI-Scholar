
import React, { useState } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength } from '../types';

interface SearchFormProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
}

export const SearchForm: React.FC<SearchFormProps> = ({ onSearch, isLoading, summaryLength, onLengthChange }) => {
  const [inputValue, setInputValue] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(inputValue);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-grow">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="e.g., 'machine learning in computational biology'"
            className="w-full pl-4 pr-12 py-3 bg-white border border-gray-300 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow duration-200 text-base"
            disabled={isLoading}
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
  );
};
