import React, { useState } from 'react';
import { SearchIcon } from './icons/SearchIcon';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle, ModelDefinition } from '../types';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { RefineIcon } from './icons/RefineIcon';
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
  model: ModelDefinition;
  onModelChange: (model: ModelDefinition) => void;
  availableModels: ModelDefinition[];
  logAnalyticsEvent: (eventName: string, payload: object) => void;
  suggestions: string[];
  isSuggestionsLoading: boolean;
  onSuggestionClick: (suggestion: string) => void;
}

const summaryStyles: { id: SummaryStyle; name: string }[] = [
    { id: 'paragraph', name: 'Paragraph' },
    { id: 'bullets', name: 'Bullets' },
    { id: 'qa', name: 'Q&A' },
];

const studyDesigns = [
    { id: 'any', name: 'Any Study Design' },
    { id: 'randomized_controlled_trial', name: 'Randomized Controlled Trial' },
    { id: 'systematic_review', name: 'Systematic Review' },
    { id: 'observational_study', name: 'Observational Study' },
    { id: 'qualitative_study', name: 'Qualitative Study' },
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
    availableModels,
    suggestions,
    isSuggestionsLoading,
    onSuggestionClick
}) => {
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<AdvancedSearchOptions>({
    startYear: '',
    endYear: '',
    authors: '',
    excludeKeywords: '',
    inclusionCriteria: '',
    exclusionCriteria: '',
    studyDesign: 'any',
    journal: '',
    minCitations: '',
    titleKeywords: '',
    abstractKeywords: '',
    isOpenAccess: false,
  });

  const handleAdvancedChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        setAdvancedOptions(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
        setAdvancedOptions(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(query, advancedOptions);
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
                type="button"
                onClick={() => setIsRefineOpen(!isRefineOpen)}
                aria-pressed={isRefineOpen}
                title="Refine Search"
                className={`w-11 h-11 flex-shrink-0 flex items-center justify-center font-semibold rounded-md border border-input focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:cursor-not-allowed transition-colors duration-200 ${
                isRefineOpen ? 'bg-primary/10 text-primary ring-1 ring-ring' : 'bg-secondary text-secondary-foreground hover:bg-accent'
                }`}
                disabled={isLoading}
            >
                <RefineIcon className="w-5 h-5" />
            </button>
          <button
            type="submit"
            disabled={isLoading || !query.trim()}
            className="px-6 h-11 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:bg-primary/50 disabled:cursor-not-allowed transition-colors duration-200"
          >
            {isLoading ? 'Searching...' : 'Search'}
          </button>
        </div>
        
        {isRefineOpen && (
          <div className="p-4 bg-muted/50 border border-border rounded-lg mt-2 animate-fade-in space-y-4">
            <h3 className="text-sm font-semibold text-foreground">Advanced Search Filters</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="startYear" className="block text-xs font-medium text-muted-foreground mb-1">Start Year</label>
                  <input type="number" name="startYear" id="startYear" value={advancedOptions.startYear} onChange={handleAdvancedChange} placeholder="e.g., 2018" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
                </div>
                <div>
                  <label htmlFor="endYear" className="block text-xs font-medium text-muted-foreground mb-1">End Year</label>
                  <input type="number" name="endYear" id="endYear" value={advancedOptions.endYear} onChange={handleAdvancedChange} placeholder="e.g., 2023" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
                </div>
              </div>
               <div>
                  <label htmlFor="authors" className="block text-xs font-medium text-muted-foreground mb-1">Authors</label>
                  <input type="text" name="authors" id="authors" value={advancedOptions.authors} onChange={handleAdvancedChange} placeholder="e.g., Smith J" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="journal" className="block text-xs font-medium text-muted-foreground mb-1">Journal / Venue</label>
                <input type="text" name="journal" id="journal" value={advancedOptions.journal || ''} onChange={handleAdvancedChange} placeholder="e.g., Nature" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
              </div>
              <div>
                <label htmlFor="minCitations" className="block text-xs font-medium text-muted-foreground mb-1">Minimum Citations</label>
                <input type="number" name="minCitations" id="minCitations" value={advancedOptions.minCitations || ''} onChange={handleAdvancedChange} placeholder="e.g., 50" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
              </div>
            </div>
            <div className="space-y-2">
                <div>
                  <label htmlFor="titleKeywords" className="block text-xs font-medium text-muted-foreground mb-1">Keywords in Title (comma-separated)</label>
                  <input type="text" name="titleKeywords" id="titleKeywords" value={advancedOptions.titleKeywords || ''} onChange={handleAdvancedChange} placeholder="e.g., transformer, architecture" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
                </div>
                <div>
                  <label htmlFor="abstractKeywords" className="block text-xs font-medium text-muted-foreground mb-1">Keywords in Abstract (comma-separated)</label>
                  <input type="text" name="abstractKeywords" id="abstractKeywords" value={advancedOptions.abstractKeywords || ''} onChange={handleAdvancedChange} placeholder="e.g., attention mechanism" className="w-full h-9 px-3 text-sm bg-background border border-input rounded-md"/>
                </div>
            </div>
             <div className="flex items-center gap-2 pt-2">
                <input type="checkbox" name="isOpenAccess" id="isOpenAccess" checked={advancedOptions.isOpenAccess || false} onChange={handleAdvancedChange} className="h-4 w-4 rounded border-input text-primary focus:ring-primary"/>
                <label htmlFor="isOpenAccess" className="text-sm font-medium text-foreground">Show only Open Access results</label>
            </div>
            <hr className="border-border" />
             <div className="space-y-2">
                <div>
                  <label htmlFor="inclusionCriteria" className="block text-xs font-medium text-muted-foreground mb-1">Inclusion Criteria (for AI screening)</label>
                  <textarea name="inclusionCriteria" id="inclusionCriteria" value={advancedOptions.inclusionCriteria} onChange={handleAdvancedChange} rows={2} placeholder="e.g., must focus on adolescent populations" className="w-full p-2 text-sm bg-background border border-input rounded-md"/>
                </div>
                <div>
                  <label htmlFor="exclusionCriteria" className="block text-xs font-medium text-muted-foreground mb-1">Exclusion Criteria (for AI screening)</label>
                  <textarea name="exclusionCriteria" id="exclusionCriteria" value={advancedOptions.exclusionCriteria} onChange={handleAdvancedChange} rows={2} placeholder="e.g., exclude animal studies" className="w-full p-2 text-sm bg-background border border-input rounded-md"/>
                </div>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-x-6 gap-y-3">
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
            <div className="relative">
                <select
                    id="study-design-select"
                    name="studyDesign"
                    value={advancedOptions.studyDesign}
                    onChange={handleAdvancedChange}
                    disabled={isLoading}
                    className="h-9 pl-3 pr-8 bg-background border border-input rounded-md appearance-none focus:ring-2 focus:ring-ring text-sm"
                    aria-label="Filter by Study Design"
                >
                    {studyDesigns.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <ChevronDownIcon className="w-4 h-4 text-muted-foreground" />
                </div>
            </div>
        </div>
      </form>
      {(isSuggestionsLoading || suggestions.length > 0) && (
        <SearchSuggestions
            suggestions={suggestions}
            isLoading={isSuggestionsLoading}
            onSuggestionClick={onSuggestionClick}
        />
      )}
    </div>
  );
};