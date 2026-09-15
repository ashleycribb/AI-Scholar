
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
  suggestions: string[];
  isSuggestionsLoading: boolean;
  onSuggestionClick: (suggestion: string) => void;
  onOpenOrgFinder: () => void;
  onOpenDeepResearch?: () => void;
  selectedInstitution?: { id: string; name: string };
  onClearInstitution: () => void;
}

export const InitialSearchScreen: React.FC<InitialSearchScreenProps> = (props) => {
  const { onSearch, onOpenDbFinder, searchSources, ...searchFormProps } = props;

  const handleSearch = (query: string, options: AdvancedSearchOptions) => {
      props.onSearch(query, options);
  };

  return (
    <div className="flex flex-col items-start justify-center min-h-[calc(100vh-150px)] px-4 py-20 max-w-5xl mx-auto">
        <div className="flex flex-col items-start gap-6 mb-12 text-left animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h1 className="text-5xl sm:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.1] mb-6">
                    All the world's research, <br className="hidden sm:block" /> connected and open.
                </h1>
                <p className="text-xl sm:text-2xl text-slate-500 max-w-3xl font-medium leading-relaxed">
                    Scholar Explorer leverages AI to synthesize millions of scholarly works, linking authors, institutions, and insights across every field of research—all fully open.
                </p>
            </div>
        </div>
        
        <div className="w-full">
            <SearchForm {...searchFormProps} onSearch={handleSearch} />
            
            <div className="mt-5 flex flex-wrap items-center justify-center gap-4 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                    <span className="font-black uppercase tracking-[0.2em] text-[8px] opacity-40">Sources:</span>
                    <div className="flex items-center gap-1.5">
                        {searchSources.map(source => (
                            <span key={source.id} className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold rounded-md text-[10px] border border-slate-200 uppercase tracking-tighter">
                                {source.name}
                            </span>
                        ))}
                    </div>
                </div>
                <button
                    onClick={onOpenDbFinder}
                    className="flex items-center gap-1.5 font-black text-[10px] uppercase tracking-widest text-primary hover:text-primary/80 transition-colors"
                >
                    <DatabaseIcon className="w-3 h-3" />
                    Specialized Databases
                </button>
            </div>
        </div>
        {props.children}
    </div>
  );
};
