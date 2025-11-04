





import React from 'react';
import { SearchForm } from './SearchForm';
import { AboutIcon } from './icons/AboutIcon';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle, ModelDefinition, SearchSourceInfo } from '../types';
import { DatabaseIcon } from './icons/DatabaseIcon';

interface InitialSearchScreenProps {
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
  children?: React.ReactNode;
  onOpenDbFinder: () => void;
  searchSources: SearchSourceInfo[];
}

export const InitialSearchScreen: React.FC<InitialSearchScreenProps> = (props) => {
  const { onSearch, onOpenDbFinder, searchSources, ...searchFormProps } = props;

  const handleSearch = (query: string, options: AdvancedSearchOptions) => {
      props.onSearch(query, options);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-150px)] px-4">
        <div className="flex items-center gap-4 mb-6 text-center sm:text-left">
            <AboutIcon className="w-12 h-12 sm:w-16 sm:h-16 text-primary" />
            <div>
                <h1 className="text-3xl sm:text-4xl font-bold text-foreground">AI Research Explorer</h1>
                <p className="text-base sm:text-lg text-muted-foreground mt-1">Your intelligent gateway to academic literature.</p>
            </div>
        </div>
        <div className="w-full max-w-3xl">
            <SearchForm {...searchFormProps} onSearch={handleSearch} />
            <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-medium">Searching in:</span>
                    <div className="flex items-center gap-2">
                        {searchSources.map(source => (
                            <span key={source.id} className="px-2.5 py-1 bg-secondary text-secondary-foreground font-semibold rounded-full text-xs">
                                {source.name}
                            </span>
                        ))}
                    </div>
                </div>
                <button
                    onClick={onOpenDbFinder}
                    className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
                >
                    <DatabaseIcon className="w-4 h-4" />
                    Find Databases
                </button>
            </div>
        </div>
        {props.children}
    </div>
  );
};
