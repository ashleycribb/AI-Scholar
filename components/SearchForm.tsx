import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle } from '../types';
import { generateSearchSuggestions } from '../services/geminiService';
import { SearchSuggestions } from './SearchSuggestions';

interface SearchFormProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string, options: AdvancedSearchOptions) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
  summaryStyle: SummaryStyle;
  onStyleChange: (style: SummaryStyle) => void;
  logAnalyticsEvent: (eventName: string, payload: object) => void;
  excludeKeywords?: string;
}

const summaryStyles: { id: SummaryStyle; name: string }[] = [
    { id: 'paragraph', name: 'Paragraph' },
    { id: 'bullets', name: 'Bullets' },
    { id: 'qa', name: 'Q&A' },
];

export const SearchForm: React.FC<SearchFormProps> = ({ 
    query,
    onQueryChange,
    onSearch, 
    isLoading, 
    summaryLength, 
    onLengthChange,
    summaryStyle,
    onStyleChange, 
    logAnalyticsEvent,
    excludeKeywords
}) => {
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

  useEffect(() => {
    // Sync exclude keywords from parent if provided
    if (excludeKeywords !== undefined) {
      setAdvancedOptions(prev => ({...prev, excludeKeywords }));
    }
  }, [excludeKeywords]);

  const handleAdvancedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setAdvancedOptions(prev => ({ ...prev, [name]: value }));
  };

  const fetchSuggestions = useCallback(async (currentQuery: string) => {
    if (currentQuery.trim().length < 5) {
      setSuggestions([]);
      return;
    }
    setIsSuggesting(true);
    const result = await generateSearchSuggestions(currentQuery);
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

    if (query.trim()) {
      debounceTimeout.current = window.setTimeout(() => {
        fetchSuggestions(query);
      }, 500); // 500ms debounce
    } else {
        setSuggestions([]);
    }

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [query, fetchSuggestions, isLoading, suggestionsDisabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuggestionsDisabled(true); 
    onSearch(query, advancedOptions);
  };

  const handleSuggestionClick = (suggestion: string) => {
    logAnalyticsEvent('suggestion_clicked', { suggestion });
    setSuggestionsDisabled(true);
    onQueryChange(suggestion);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSuggestionsDisabled(false);
    onQueryChange(e.target.value);
  };
  
  const placeholderText = `Search academic papers for 'machine learning in biology'`;

  return (
    <div className="relative">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-grow">
            <input
              type="text"
              value={query}
              onChange={handleInputChange}
              placeholder={placeholderText}
              className="w-full pl-4 pr-12 h-11 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring focus:ring-offset-2 transition-shadow duration-200 text-base text-foreground"
              disabled={isLoading}
              autoComplete="off"
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                <SearchIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 h-11 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Summary:</span>
                    {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
                        <button
                        key={len}
                        type="button"
                        onClick={() => onLengthChange(len)}
                        aria-pressed={summaryLength === len}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring ${
                            summaryLength === len
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                        >
                        {len.charAt(0).toUpperCase() + len.slice(1)}
                        </button>
                    ))}
                </div>
                 <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Style:</span>
                    {summaryStyles.map((style) => (
                        <button
                        key={style.id}
                        type="button"
                        onClick={() => onStyleChange(style.id)}
                        aria-pressed={summaryStyle === style.id}
                        className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-ring ${
                            summaryStyle === style.id
                            ? 'bg-primary text-primary-foreground shadow-sm'
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
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
                className="text-sm font-medium text-primary hover:underline flex-shrink-0"
                aria-expanded={showAdvanced}
            >
                {showAdvanced ? 'Hide Advanced' : 'Advanced Search'}
                <span className="ml-1 transition-transform inline-block" style={{ transform: showAdvanced ? 'rotate(180deg)' : 'rotate(0deg)' }}>▼</span>
            </button>
        </div>

        {showAdvanced && (
            <div className="p-4 bg-muted/50 rounded-lg border grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="startYear" className="block text-sm font-medium text-foreground mb-1">Publication Year</label>
                    <div className="flex items-center gap-2">
                        <input type="number" name="startYear" id="startYear" value={advancedOptions.startYear} onChange={handleAdvancedChange} placeholder="From" className="h-9 w-full px-3 py-2 text-sm border border-input rounded-md focus:ring-1 focus:ring-ring bg-background text-foreground"/>
                        <span className="text-muted-foreground">-</span>
                        <input type="number" name="endYear" id="endYear" value={advancedOptions.endYear} onChange={handleAdvancedChange} placeholder="To" className="h-9 w-full px-3 py-2 text-sm border border-input rounded-md focus:ring-1 focus:ring-ring bg-background text-foreground"/>
                    </div>
                </div>
                 <div>
                    <label htmlFor="authors" className="block text-sm font-medium text-foreground mb-1">Authors</label>
                    <input type="text" name="authors" id="authors" value={advancedOptions.authors} onChange={handleAdvancedChange} placeholder="e.g., Hinton, LeCun" className="h-9 w-full px-3 py-2 text-sm border border-input rounded-md focus:ring-1 focus:ring-ring bg-background text-foreground"/>
                </div>
                <div className="sm:col-span-2">
                    <label htmlFor="excludeKeywords" className="block text-sm font-medium text-foreground mb-1">Exclude Keywords</label>
                    <input type="text" name="excludeKeywords" id="excludeKeywords" value={advancedOptions.excludeKeywords} onChange={handleAdvancedChange} placeholder="e.g., review, meta-analysis" className="h-9 w-full px-3 py-2 text-sm border border-input rounded-md focus:ring-1 focus:ring-ring bg-background text-foreground"/>
                </div>
            </div>
        )}
      </form>
      {!isLoading && (
        <SearchSuggestions
            suggestions={suggestions}
            isLoading={isSuggesting}
            onSuggestionClick={handleSuggestionClick}
        />
      )}
    </div>
  );
};