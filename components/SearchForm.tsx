import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength, SearchSource, AdvancedSearchOptions, SummaryStyle } from '../types';
import { generateSearchSuggestions } from '../services/geminiService';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchFormProps {
  onSearch: (query: string, options: AdvancedSearchOptions) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
  summaryStyle: SummaryStyle;
  onStyleChange: (style: SummaryStyle) => void;
  searchSource: SearchSource;
  onSourceChange: (source: SearchSource) => void;
  logAnalyticsEvent: (eventName: string, payload: object) => void;
}

const searchSources: { id: SearchSource; name: string }[] = [
    { id: 'google_scholar', name: 'Google Scholar' },
    { id: 'general', name: 'General Web' },
    { id: 'jstor', name: 'JSTOR' },
    { id: 'pubmed', name: 'PubMed' },
    { id: 'arxiv', name: 'arXiv' },
];

const summaryStyles: { id: SummaryStyle; name: string }[] = [
    { id: 'paragraph', name: 'Paragraph' },
    { id: 'bullets', name: 'Bullets' },
    { id: 'qa', name: 'Q&A' },
];

export const SearchForm: React.FC<SearchFormProps> = ({ 
    onSearch, 
    isLoading, 
    summaryLength, 
    onLengthChange,
    summaryStyle,
    onStyleChange, 
    searchSource, 
    onSourceChange,
    logAnalyticsEvent
}) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestionsDisabled, setSuggestionsDisabled] = useState(false);
  const debounceTimeout = useRef<number | null>(null);
  
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedSearchOptions>({
    startYear: '',
    endYear: '',
    authors: '',
    excludeKeywords: '',
  });

  const handleAdvancedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAdvancedOptions(prev => ({ ...prev, [name]: value }));
  };

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
    setSuggestionsDisabled(true); 
    onSearch(inputValue, advancedOptions);
  };

  const handleSuggestionClick = (suggestion: string) => {
    logAnalyticsEvent('suggestion_clicked', { suggestion });
    setSuggestionsDisabled(true);
    setInputValue(suggestion);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuggestionsDisabled(false);
    setInputValue(e.target.value);
  };

  const selectedSourceName = searchSources.find(s => s.id === searchSource)?.name || 'academic sources';
  const placeholderText = `Search ${selectedSourceName} for 'machine learning in biology'`;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              placeholder={placeholderText}
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
        
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Summary:</span>
                    {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
                        <button
                        key={len}
                        type="button"
                        onClick={() => onLengthChange(len)}
                        aria-pressed={summaryLength === len}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                            summaryLength === len
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        >
                        {len.charAt(0).toUpperCase() + len.slice(1)}
                        </button>
                    ))}
                </div>
                 <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Style:</span>
                    {summaryStyles.map((style) => (
                        <button
                        key={style.id}
                        type="button"
                        onClick={() => onStyleChange(style.id)}
                        aria-pressed={summaryStyle === style.id}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                            summaryStyle === style.id
                            ? 'bg-blue-600 text-white shadow-sm'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                        >
                        {style.name}
                        </button>
                    ))}
                </div>
            </div>
            <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 flex-shrink-0"
                aria-expanded={showAdvanced}
            >
                {showAdvanced ? 'Hide Advanced' : 'Advanced Search'}
                <span className="ml-1 transition-transform inline-block" style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>
        </div>

        {showAdvanced && (
            <div className="p-4 bg-gray-100 rounded-lg border border-gray-200 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="startYear" className="block text-sm font-medium text-gray-700 mb-1">Publication Year</label>
                    <div className="flex items-center gap-2">
                        <input type="number" name="startYear" id="startYear" value={advancedOptions.startYear} onChange={handleAdvancedChange} placeholder="From" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"/>
                        <span className="text-gray-500">-</span>
                        <input type="number" name="endYear" id="endYear" value={advancedOptions.endYear} onChange={handleAdvancedChange} placeholder="To" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"/>
                    </div>
                </div>
                 <div>
                    <label htmlFor="authors" className="block text-sm font-medium text-gray-700 mb-1">Authors</label>
                    <input type="text" name="authors" id="authors" value={advancedOptions.authors} onChange={handleAdvancedChange} placeholder="e.g., Hinton, LeCun" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"/>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="excludeKeywords" className="block text-sm font-medium text-gray-700 mb-1">Exclude Keywords</label>
                    <input type="text" name="excludeKeywords" id="excludeKeywords" value={advancedOptions.excludeKeywords} onChange={handleAdvancedChange} placeholder="e.g., review, meta-analysis" className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-1 focus:ring-blue-500"/>
                </div>
            </div>
        )}

        <div className="flex flex-wrap justify-center items-center gap-2">
            <span className="text-sm font-medium text-gray-600 mr-2">Source:</span>
            {searchSources.map((source) => (
            <button
                key={source.id}
                type="button"
                onClick={() => onSourceChange(source.id)}
                aria-pressed={searchSource === source.id}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500 ${
                searchSource === source.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
            >
                {source.name}
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