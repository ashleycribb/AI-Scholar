
import React from 'react';
import { SearchForm } from './SearchForm';
import { AboutIcon } from './icons/AboutIcon';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle } from '../types';

interface InitialSearchScreenProps {
  query: string;
  onQueryChange: (query: string) => void;
  onSearch: (query: string, options: Omit<AdvancedSearchOptions, 'searchMode'>) => void;
  isLoading: boolean;
  summaryLength: SummaryLength;
  onLengthChange: (length: SummaryLength) => void;
  summaryStyle: SummaryStyle;
  onStyleChange: (style: SummaryStyle) => void;
  logAnalyticsEvent: (eventName: string, payload: object) => void;
  searchMode: 'semantic' | 'keyword';
  onSearchModeChange: (mode: 'semantic' | 'keyword') => void;
  children?: React.ReactNode;
}

export const InitialSearchScreen: React.FC<InitialSearchScreenProps> = (props) => {
  const { onSearch, ...searchFormProps } = props;

  const handleSearch = (query: string, options: Omit<AdvancedSearchOptions, 'searchMode'>) => {
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
        </div>
        {props.children}
    </div>
  );
};