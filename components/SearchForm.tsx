
import React, { useState, useEffect, useRef } from 'react';
import { Search, ChevronDown, Filter, Building2, X, Cpu, MoreVertical, Sparkles, SlidersHorizontal, Trash2 } from 'lucide-react';
import type { SummaryLength, AdvancedSearchOptions, SummaryStyle, ModelDefinition } from '../types';
import { SearchSuggestions } from './SearchSuggestions';
import { CustomDropdown } from './CustomDropdown';
import { 
  fetchOpenAlexAutocomplete, 
  refineQuery, 
  type AcademicKeyword, 
  type OpenAlexAutocompleteItem 
} from '../services/keywordSuggestionService';

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
  suggestions?: string[];
  isSuggestionsLoading?: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onOpenOrgFinder: () => void;
  selectedInstitution?: { id: string; name: string };
  onClearInstitution: () => void;
  onOpenDeepResearch?: () => void;
  academicKeywords?: AcademicKeyword[];
  selectedPaperCount?: number;
}

type SearchMode = 'topic' | 'doi';

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

const researchDomains = [
    { id: 'all', name: 'All Domains' },
    { id: 'medicine', name: 'Medicine & Health' },
    { id: 'computer_science', name: 'Computer Science' },
    { id: 'engineering', name: 'Engineering & Tech' },
    { id: 'education', name: 'Education' },
    { id: 'social_sciences', name: 'Social Sciences' },
    { id: 'physical_sciences', name: 'Physical Sciences' },
    { id: 'humanities', name: 'Humanities' },
    { id: 'economics', name: 'Business & Economics' },
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
    onSuggestionClick,
    onOpenOrgFinder,
    selectedInstitution,
    onClearInstitution,
    onOpenDeepResearch,
    academicKeywords = [],
    selectedPaperCount = 0
}) => {
  const [isRefineOpen, setIsRefineOpen] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('topic');
  
  const [localQuery, setLocalQuery] = useState(query);
  const [localDoi, setLocalDoi] = useState('');

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [autocompleteWorks, setAutocompleteWorks] = useState<OpenAlexAutocompleteItem[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

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
    doi: '',
    domain: 'all',
  });

  useEffect(() => {
    setLocalQuery(query);
  }, [query]);

  // Click outside handler to dismiss dropdowns cleanly
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch OpenAlex autocomplete results on query change
  useEffect(() => {
    if (searchMode !== 'topic' || localQuery.trim().length < 2) {
      setAutocompleteWorks([]);
      setIsAutocompleteLoading(false);
      return;
    }

    let isMounted = true;
    setIsAutocompleteLoading(true);

    const timer = setTimeout(async () => {
      try {
        const results = await fetchOpenAlexAutocomplete(localQuery, 'works');
        if (isMounted) {
          setAutocompleteWorks(results);
          setIsAutocompleteLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setAutocompleteWorks([]);
          setIsAutocompleteLoading(false);
        }
      }
    }, 250);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [localQuery, searchMode]);

  useEffect(() => {
      if (selectedInstitution) {
          setAdvancedOptions(prev => ({
              ...prev,
              institutionName: selectedInstitution.name,
              institutionId: selectedInstitution.id
          }));
      } else {
          setAdvancedOptions(prev => {
              const { institutionName, institutionId, ...rest } = prev;
              return rest as AdvancedSearchOptions;
          });
      }
  }, [selectedInstitution]);

  useEffect(() => {
    const handler = setTimeout(() => {
      if (searchMode === 'topic' && localQuery !== query) {
        onQueryChange(localQuery);
      }
    }, 300);
    return () => clearTimeout(handler);
  }, [localQuery, query, onQueryChange, searchMode]);

  const handleAdvancedChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
        setAdvancedOptions(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
        setAdvancedOptions(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsDropdownOpen(false);
    setMoreMenuOpen(false);
    if (searchMode === 'topic') {
        if (localQuery !== query) onQueryChange(localQuery);
        onSearch(localQuery, { ...advancedOptions, doi: '' });
    } else {
        onSearch('', { ...advancedOptions, doi: localDoi });
    }
  };

  const handleClearQuery = () => {
    if (searchMode === 'topic') {
      setLocalQuery('');
      onQueryChange('');
    } else {
      setLocalDoi('');
    }
    setAutocompleteWorks([]);
    setIsDropdownOpen(false);
  };

  const handleSelectWork = (work: OpenAlexAutocompleteItem) => {
    setLocalQuery(work.displayName);
    onQueryChange(work.displayName);
    setIsDropdownOpen(false);
    onSearch(work.displayName, { ...advancedOptions, doi: '' });
  };

  const handleSelectKeyword = (keyword: string, mode: 'and' | 'append' = 'and') => {
    const refined = refineQuery(localQuery, keyword, mode);
    setLocalQuery(refined);
    onQueryChange(refined);
    setIsDropdownOpen(true);
  };

  const currentInputValue = searchMode === 'topic' ? localQuery : localDoi;
  const currentPlaceholder = searchMode === 'topic' 
    ? "Search 480M scholarly works..." 
    : "Enter DOI for direct retrieval...";

  // Count active filter parameters to show the OpenAlex style red badge
  const activeFiltersCount = [
    advancedOptions.startYear,
    advancedOptions.endYear,
    advancedOptions.authors,
    advancedOptions.journal,
    advancedOptions.minCitations,
    advancedOptions.isOpenAccess ? 'oa' : '',
    advancedOptions.studyDesign !== 'any' ? advancedOptions.studyDesign : '',
    advancedOptions.domain !== 'all' ? advancedOptions.domain : '',
    advancedOptions.institutionId
  ].filter(Boolean).length;

  return (
    <div ref={containerRef} className="relative w-full">
      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* OpenAlex Search Card */}
        <div className="relative bg-white border border-slate-200 rounded-[2rem] shadow-sm focus-within:border-slate-400 focus-within:shadow-md transition-all duration-300">
          
          {/* Input Area with Status Pill & Clear Button */}
          <div className="p-3 sm:p-4 pb-0 flex items-start justify-between gap-2">
            <textarea
                value={currentInputValue}
                onFocus={() => {
                  if (searchMode === 'topic') setIsDropdownOpen(true);
                }}
                onChange={(e) => {
                    if (searchMode === 'topic') {
                      setLocalQuery(e.target.value);
                      setIsDropdownOpen(true);
                    } else {
                      setLocalDoi(e.target.value);
                    }
                }}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                    } else if (e.key === 'Escape') {
                        setIsDropdownOpen(false);
                    }
                }}
                placeholder={currentPlaceholder}
                rows={searchMode === 'topic' ? 2 : 1}
                className="flex-1 pl-4 pr-2 bg-transparent border-none focus:ring-0 text-xl sm:text-2xl text-slate-900 placeholder:text-slate-300 font-medium resize-none py-2 min-h-[60px]"
                disabled={isLoading}
                autoComplete="off"
            />

            {/* Top Right: OpenAlex Style Indicators & Clear Button */}
            <div className="flex items-center gap-1.5 pt-2 pr-3">
              {/* Status Badge */}
              <div 
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200"
                title={selectedPaperCount > 0 ? `${selectedPaperCount} papers in selection queue` : 'Scholar Explorer Live Index'}
              >
                <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                {(selectedPaperCount > 0 || activeFiltersCount > 0) && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] font-black bg-rose-600 text-white shadow-2xs">
                    {selectedPaperCount > 0 ? selectedPaperCount : activeFiltersCount}
                  </span>
                )}
              </div>

              {/* Clear Button */}
              {currentInputValue.trim() && (
                <button
                  type="button"
                  onClick={handleClearQuery}
                  className="p-1 rounded-full text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                  title="Clear input"
                  aria-label="Clear search input"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <div className="h-px bg-slate-100 mx-6"></div>

          {/* Controls Footer */}
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
                {/* Search Mode */}
                <CustomDropdown
                    value={searchMode}
                    options={[
                        { id: 'topic', name: 'works' },
                        { id: 'doi', name: 'doi' }
                    ]}
                    onChange={(val) => {
                      setSearchMode(val as SearchMode);
                      setIsDropdownOpen(false);
                    }}
                    triggerClassName="bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-900 border-none px-0 font-medium"
                />

                {/* Domain Selector */}
                {searchMode === 'topic' && (
                    <div className="flex items-center gap-1.5 border-l border-slate-100 pl-3 sm:pl-4">
                        <CustomDropdown
                            value={advancedOptions.domain}
                            options={researchDomains.map(d => ({ id: d.id, name: d.name.toLowerCase() }))}
                            onChange={(val) => handleAdvancedChange({ target: { name: 'domain', value: val } } as any)}
                            triggerClassName="bg-transparent hover:bg-slate-100 text-slate-500 hover:text-slate-900 border-none px-0"
                        />
                    </div>
                )}

                {/* Expand Filters */}
                <button
                    type="button"
                    onClick={() => setIsRefineOpen(!isRefineOpen)}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-200 border-l border-slate-100 pl-3 sm:pl-4 group ${
                        isRefineOpen ? 'text-slate-900 font-black' : 'text-slate-400 hover:text-slate-900'
                    }`}
                >
                    <Filter className="w-3.5 h-3.5" />
                    <span className="text-[12px] font-bold uppercase tracking-wide">filters</span>
                    {activeFiltersCount > 0 && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-black bg-slate-900 text-white">
                        {activeFiltersCount}
                      </span>
                    )}
                </button>

                {/* OpenAlex style three-dots menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                    className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
                    title="More options"
                    aria-label="More options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {moreMenuOpen && (
                    <div className="absolute left-0 bottom-full mb-2 w-48 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-40 animate-slide-up text-xs font-semibold">
                      <button
                        type="button"
                        onClick={() => { setIsRefineOpen(true); setMoreMenuOpen(false); }}
                        className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                        <span>Advanced Parameters</span>
                      </button>
                      {onOpenDeepResearch && (
                        <button
                          type="button"
                          onClick={() => { onOpenDeepResearch(); setMoreMenuOpen(false); }}
                          className="w-full text-left px-3.5 py-2 hover:bg-slate-50 text-indigo-700 flex items-center gap-2"
                        >
                          <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Deep Research AI</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setAdvancedOptions({
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
                            doi: '',
                            domain: 'all',
                          });
                          setMoreMenuOpen(false);
                        }}
                        className="w-full text-left px-3.5 py-2 hover:bg-rose-50 text-rose-600 flex items-center gap-2 border-t border-slate-100"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Reset Parameters</span>
                      </button>
                    </div>
                  )}
                </div>
            </div>

            {/* Submit Button (Matching OpenAlex Pill) */}
            <button
                type="submit"
                disabled={isLoading || !currentInputValue.trim()}
                className={`flex items-center justify-center h-10 sm:h-11 px-7 text-[13px] font-bold tracking-wide rounded-full transition-all shadow-md cursor-pointer ${
                    isLoading 
                        ? 'bg-indigo-600 text-white animate-pulse cursor-wait' 
                        : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed'
                }`}
            >
                {isLoading ? (
                    <div className="flex items-center gap-2">
                        <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        <span>Searching...</span>
                    </div>
                ) : (
                    <span>Search</span>
                )}
            </button>
          </div>

          {/* OpenAlex Dropdown: Suggestions & Abstract Keywords */}
          <SearchSuggestions
            query={localQuery}
            autocompleteWorks={autocompleteWorks}
            academicKeywords={academicKeywords}
            isLoading={isAutocompleteLoading}
            onSelectWork={handleSelectWork}
            onSelectKeyword={handleSelectKeyword}
            onExecuteSearch={() => handleSubmit()}
            isOpen={isDropdownOpen && searchMode === 'topic'}
            onClose={() => setIsDropdownOpen(false)}
          />
        </div>

        {/* Intelligence / Model Selector */}
        <div className="flex justify-end">
            <div className="relative inline-flex items-center bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 transition-all">
                <Cpu className="w-3.5 h-3.5 text-slate-400 mr-2" />
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mr-2">Using</span>
                <CustomDropdown
                    value={model.id}
                    options={availableModels.map(m => ({ id: m.id, name: m.name }))}
                    onChange={(val) => {
                        const selectedModel = availableModels.find(m => m.id === val);
                        if (selectedModel) onModelChange(selectedModel);
                    }}
                    triggerClassName="bg-transparent hover:bg-slate-100 border-none px-0 text-[10px] font-black uppercase tracking-widest text-slate-900"
                />
            </div>
        </div>
        
        {isRefineOpen && (
          <div className="p-8 bg-white border-2 border-slate-200 rounded-3xl animate-slide-up shadow-xl space-y-8">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-900">Advanced Parameters</h3>
                </div>
                <button type="button" onClick={() => setIsRefineOpen(false)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Close</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <label htmlFor="startYear" className="micro-label ml-1">Start Year</label>
                            <input type="number" name="startYear" id="startYear" value={advancedOptions.startYear} onChange={handleAdvancedChange} placeholder="2018" className="w-full h-12 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all"/>
                        </div>
                        <div className="space-y-1.5">
                            <label htmlFor="endYear" className="micro-label ml-1">End Year</label>
                            <input type="number" name="endYear" id="endYear" value={advancedOptions.endYear} onChange={handleAdvancedChange} placeholder="2024" className="w-full h-12 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all"/>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="authors" className="micro-label ml-1">Authors</label>
                        <input type="text" name="authors" id="authors" value={advancedOptions.authors} onChange={handleAdvancedChange} placeholder="e.g., Bengio Y" className="w-full h-12 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all"/>
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label htmlFor="journal" className="micro-label ml-1">Journal / Conference</label>
                        <input type="text" name="journal" id="journal" value={advancedOptions.journal || ''} onChange={handleAdvancedChange} placeholder="e.g., Nature, NeurIPS" className="w-full h-12 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all"/>
                    </div>
                    <div className="space-y-1.5">
                        <label htmlFor="institution" className="micro-label ml-1">Institution</label>
                        {selectedInstitution ? (
                            <div className="flex items-center justify-between h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl">
                                <span className="text-sm text-slate-900 truncate font-bold">{selectedInstitution.name}</span>
                                <button type="button" onClick={onClearInstitution} className="p-1 text-slate-400 hover:text-rose-600 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        ) : (
                            <button
                                type="button"
                                onClick={onOpenOrgFinder}
                                className="w-full h-12 px-4 text-sm bg-slate-50 border border-slate-200 rounded-xl text-left text-slate-400 hover:border-slate-900 flex items-center gap-3 transition-all"
                            >
                                <Building2 className="w-4 h-4" /> <span>Find Institution (ROR)</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="micro-label ml-1">Access Type</label>
                        <div className="flex items-center gap-3 h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl">
                            <input type="checkbox" name="isOpenAccess" id="isOpenAccess" checked={advancedOptions.isOpenAccess || false} onChange={handleAdvancedChange} className="h-5 w-5 rounded border-slate-300 text-slate-900 focus:ring-slate-900"/>
                            <label htmlFor="isOpenAccess" className="text-xs font-bold text-slate-600">Open Access Only</label>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        <label className="micro-label ml-1">Study Design</label>
                        <CustomDropdown
                            value={advancedOptions.studyDesign}
                            options={studyDesigns.map(d => ({ id: d.id, name: d.name }))}
                            onChange={(val) => handleAdvancedChange({ target: { name: 'studyDesign', value: val } } as any)}
                            formatLabel={(n) => n}
                            triggerClassName="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl justify-between"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <label className="micro-label ml-1">Research Domain</label>
                        <CustomDropdown
                            value={advancedOptions.domain}
                            options={researchDomains.map(d => ({ id: d.id, name: d.name }))}
                            onChange={(val) => handleAdvancedChange({ target: { name: 'domain', value: val } } as any)}
                            formatLabel={(n) => n}
                            triggerClassName="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl justify-between"
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-slate-100">
                <div className="space-y-1.5">
                    <label htmlFor="inclusionCriteria" className="micro-label ml-1">Inclusion Logic</label>
                    <textarea name="inclusionCriteria" id="inclusionCriteria" value={advancedOptions.inclusionCriteria} onChange={handleAdvancedChange} rows={2} placeholder="Must focus on specific methodologies or populations..." className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all resize-none"/>
                </div>
                <div className="space-y-1.5">
                    <label htmlFor="exclusionCriteria" className="micro-label ml-1">Exclusion Logic</label>
                    <textarea name="exclusionCriteria" id="exclusionCriteria" value={advancedOptions.exclusionCriteria} onChange={handleAdvancedChange} rows={2} placeholder="Ignore studies that are purely theoretical or animal-based..." className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:border-slate-900 focus:ring-0 transition-all resize-none"/>
                </div>
            </div>
          </div>
        )}

        {/* Action Row */}
        <div className="flex flex-col lg:flex-row justify-between items-center gap-6">
            <div className="flex flex-wrap items-center justify-center gap-4">
                <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <span className="micro-label ml-3 mr-2 opacity-60">Depth</span>
                    <div className="flex gap-0.5">
                        {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
                            <button
                            key={len}
                            type="button"
                            onClick={() => onLengthChange(len)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                summaryLength === len
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                            >
                            {len}
                            </button>
                        ))}
                    </div>
                </div>

                 <div className="flex items-center bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                    <span className="micro-label ml-3 mr-2 opacity-60">Style</span>
                    <div className="flex gap-0.5">
                        {summaryStyles.map((style) => (
                            <button
                            key={style.id}
                            type="button"
                            onClick={() => onStyleChange(style.id)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                                summaryStyle === style.id
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
                            }`}
                            >
                            {style.name}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </form>
    </div>
  );
};
