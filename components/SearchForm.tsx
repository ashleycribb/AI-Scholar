




import React from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle, ModelDefinition } from '../types';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

interface SearchFormProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string, options: AdvancedSearchOptions) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
  summaryStyle: SummaryStyle;
  onStyleChange: (style: SummaryStyle) => void;
  model: ModelDefinition;
  onModelChange: (model: ModelDefinition) => void;
  availableModels: ModelDefinition[];
  logAnalyticsEvent: (eventName: string, payload: object) => void;
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
    model,
    onModelChange,
    availableModels
}) => {
  const searchOptions: AdvancedSearchOptions = {
    startYear: '',
    endYear: '',
    authors: '',
    excludeKeywords: '',
    inclusionCriteria: '',
    exclusionCriteria: '',
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, searchOptions);
  };
  
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onQueryChange(e.target.value);
  };
  
  const placeholderText = `Ask a research question, e.g., 'What is the impact of LLMs on scientific writing?'`;

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
           <div className="relative">
              <select
                id="model-select"
                value={model.id}
                onChange={(e) => {
                    const selectedModel = availableModels.find(m => m.id === e.target.value);
                    if (selectedModel) {
                        onModelChange(selectedModel);
                    }
                }}
                disabled={isLoading}
                className="h-11 pl-3 pr-8 bg-background border border-input rounded-md appearance-none focus:ring-2 focus:ring-ring transition-shadow duration-200 text-sm font-medium"
                aria-label="Select AI Model"
              >
                {availableModels.map(m => <option key={m.id} value={m.id}>{m.name}{m.isMock ? ' (Mock)' : ''}</option>)}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
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
        
        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
            <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
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
        </div>
      </form>
    </div>
  );
};