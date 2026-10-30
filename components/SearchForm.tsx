
import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  ChevronDown, 
  Filter, 
  Building2, 
  X, 
  Cpu, 
  Sparkles, 
  SlidersHorizontal, 
  Trash2,
  BookOpen,
  Hash,
  User,
  ArrowRight,
  Sliders
} from 'lucide-react';
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

type SearchMode = 'topic' | 'doi' | 'author';

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
    { id: 'all', name: 'All Research Domains' },
    { id: 'medicine', name: 'Medicine & Health' },
    { id: 'computer_science', name: 'Computer Science' },
    { id: 'engineering', name: 'Engineering & Tech' },
    { id: 'education', name: 'Education' },
    { id: 'social_sciences', name: 'Social Sciences' },
    { id: 'physical_sciences', name: 'Physical Sciences' },
    { id: 'humanities', name: 'Humanities' },
    { id: 'economics', name: 'Business & Economics' },
];

const exampleQueries = [
  {
    type: 'Question',
    query: 'How do GLP-1 receptor agonists impact neuroprotection in Parkinson models?',
    mode: 'topic' as SearchMode
  },
  {
    type: 'Keywords',
    query: 'transformer self-attention interpretability sparse models',
    mode: 'topic' as SearchMode
  },
  {
    type: 'DOI',
    query: '10.1038/s41586-020-2649-2',
    mode: 'doi' as SearchMode
  },
  {
    type: 'Author',
    query: 'Bengio Y deep learning representations',
    mode: 'topic' as SearchMode
  }
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
  const [showSynthesisOptions, setShowSynthesisOptions] = useState(false);
  const [searchMode, setSearchMode] = useState<SearchMode>('topic');
  
  const [localQuery, setLocalQuery] = useState(query);
  const [localDoi, setLocalDoi] = useState('');

  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [autocompleteWorks, setAutocompleteWorks] = useState<OpenAlexAutocompleteItem[]>([]);
  const [isAutocompleteLoading, setIsAutocompleteLoading] = useState(false);

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

  const handleSubmit = (e?: React.FormEvent, directQuery?: string, directMode?: SearchMode) => {
    if (e) e.preventDefault();
    setIsDropdownOpen(false);

    const effectiveMode = directMode || searchMode;
    const effectiveVal = directQuery !== undefined ? directQuery : (effectiveMode === 'doi' ? localDoi : localQuery);

    if (effectiveMode === 'doi') {
        onSearch('', { ...advancedOptions, doi: effectiveVal.trim() });
    } else {
        if (effectiveVal !== query) onQueryChange(effectiveVal);
        onSearch(effectiveVal.trim(), { ...advancedOptions, doi: '' });
    }
  };

  const handleClearQuery = () => {
    if (searchMode === 'doi') {
      setLocalDoi('');
    } else {
      setLocalQuery('');
      onQueryChange('');
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

  const handleApplyExample = (example: typeof exampleQueries[0]) => {
    setSearchMode(example.mode);
    if (example.mode === 'doi') {
      setLocalDoi(example.query);
      handleSubmit(undefined, example.query, 'doi');
    } else {
      setLocalQuery(example.query);
      onQueryChange(example.query);
      handleSubmit(undefined, example.query, 'topic');
    }
  };

  const handleResetFilters = () => {
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
    if (selectedInstitution) {
      onClearInstitution();
    }
  };

  const currentInputValue = searchMode === 'doi' ? localDoi : localQuery;
  const currentPlaceholder = searchMode === 'doi'
    ? "Enter DOI (e.g. 10.1038/s41586-020-2649-2)..."
    : "Search by research question, keywords, author, or topic...";

  // Count active filter parameters
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
    <div ref={containerRef} className="relative w-full space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Dominant Search Input Card */}
        <div className="relative bg-white border border-slate-200/90 rounded-2xl shadow-sm hover:border-slate-300 focus-within:border-slate-900 focus-within:shadow-md transition-all">
          {/* Top subtle mode selector bar */}
          <div className="px-4 pt-3 pb-1 flex items-center justify-between border-b border-slate-100/80">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setSearchMode('topic');
                  setIsDropdownOpen(false);
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  searchMode === 'topic'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Topics & Questions
              </button>
              <button
                type="button"
                onClick={() => {
                  setSearchMode('doi');
                  setIsDropdownOpen(false);
                }}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                  searchMode === 'doi'
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                DOI Lookup
              </button>
            </div>

            {/* Right side status / active queue count */}
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-[11px] font-medium text-slate-500">480M+ Works</span>
              </div>
              {selectedPaperCount > 0 && (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-slate-100 text-slate-700 rounded-full border border-slate-200">
                  {selectedPaperCount} in Workspace
                </span>
              )}
            </div>
          </div>

          {/* Core Input Field Area */}
          <div className="p-3 sm:p-4 flex items-center gap-3">
            <Search className="w-5 h-5 text-slate-400 shrink-0 ml-1" />
            <input
              type="text"
              value={currentInputValue}
              onFocus={() => {
                if (searchMode === 'topic') setIsDropdownOpen(true);
              }}
              onChange={(e) => {
                if (searchMode === 'doi') {
                  setLocalDoi(e.target.value);
                } else {
                  setLocalQuery(e.target.value);
                  setIsDropdownOpen(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit(e);
                } else if (e.key === 'Escape') {
                  setIsDropdownOpen(false);
                }
              }}
              placeholder={currentPlaceholder}
              className="flex-1 bg-transparent border-none text-base sm:text-lg text-slate-900 placeholder:text-slate-400 font-normal focus:outline-none focus:ring-0"
              disabled={isLoading}
              autoComplete="off"
            />

            {/* Clear Input Button */}
            {currentInputValue.trim() && (
              <button
                type="button"
                onClick={handleClearQuery}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                title="Clear input"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {/* Primary Search Action Button */}
            <button
              type="submit"
              disabled={isLoading || !currentInputValue.trim()}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-medium text-xs sm:text-sm transition-all shadow-xs disabled:opacity-40 disabled:cursor-not-allowed shrink-0 flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  <span>Searching...</span>
                </>
              ) : (
                <>
                  <span>Search</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>

          {/* Search Autocomplete Suggestions */}
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

        {/* Example Queries Pill Row */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-semibold text-slate-400 mr-1">Examples:</span>
          {exampleQueries.map((ex, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleApplyExample(ex)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 border border-slate-200/80 rounded-lg transition-colors hover:border-slate-300 shadow-2xs group"
            >
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider group-hover:text-slate-700">
                {ex.type}:
              </span>
              <span className="truncate max-w-[220px] sm:max-w-[280px]">
                {ex.query}
              </span>
            </button>
          ))}
        </div>

        {/* Secondary Toolbar: Filters Toggle & Synthesis Preferences */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRefineOpen(!isRefineOpen)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                isRefineOpen || activeFiltersCount > 0
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Filters</span>
              {activeFiltersCount > 0 && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                  isRefineOpen ? 'bg-white text-slate-900' : 'bg-slate-900 text-white'
                }`}>
                  {activeFiltersCount}
                </span>
              )}
            </button>

            {/* Active Institution Badge if selected */}
            {selectedInstitution && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-indigo-50 border border-indigo-100 text-indigo-700 font-medium">
                <Building2 className="w-3.5 h-3.5" />
                <span className="truncate max-w-[160px]">{selectedInstitution.name}</span>
                <button
                  type="button"
                  onClick={onClearInstitution}
                  className="hover:text-indigo-950 p-0.5"
                  title="Remove institution filter"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Quick Deep Research trigger if available */}
            {onOpenDeepResearch && (
              <button
                type="button"
                onClick={onOpenDeepResearch}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-700 bg-indigo-50/70 hover:bg-indigo-50 border border-indigo-200/60 transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>Deep Research</span>
              </button>
            )}
          </div>

          {/* Synthesis & AI Engine Settings (Understated, quiet) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSynthesisOptions(!showSynthesisOptions)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5 text-slate-400" />
              <span>Synthesis Settings</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${showSynthesisOptions ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Collapsible Synthesis Options */}
        {showSynthesisOptions && (
          <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl space-y-3 animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600">Summary Depth:</span>
                <div className="inline-flex bg-white p-0.5 rounded-lg border border-slate-200">
                  {(['short', 'medium', 'detailed'] as SummaryLength[]).map((len) => (
                    <button
                      key={len}
                      type="button"
                      onClick={() => onLengthChange(len)}
                      className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                        summaryLength === len
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {len}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600">Style:</span>
                <div className="inline-flex bg-white p-0.5 rounded-lg border border-slate-200">
                  {summaryStyles.map((style) => (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => onStyleChange(style.id)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        summaryStyle === style.id
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {style.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600">Model:</span>
                <select
                  value={model.id}
                  onChange={(e) => {
                    const found = availableModels.find(m => m.id === e.target.value);
                    if (found) onModelChange(found);
                  }}
                  className="bg-white border border-slate-200 text-slate-800 text-xs rounded-lg px-2.5 py-1 focus:outline-none font-medium"
                >
                  {availableModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Advanced Parameters Panel */}
        {isRefineOpen && (
          <div className="p-6 bg-white border border-slate-200/90 rounded-2xl shadow-xs space-y-6 animate-slide-up">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-700" />
                <h3 className="text-sm font-semibold text-slate-900">Advanced Research Filters</h3>
              </div>
              <div className="flex items-center gap-3">
                {activeFiltersCount > 0 && (
                  <button
                    type="button"
                    onClick={handleResetFilters}
                    className="text-xs text-rose-600 hover:text-rose-800 font-medium inline-flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setIsRefineOpen(false)}
                  className="text-xs text-slate-400 hover:text-slate-700 font-medium"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* Publication Year Range */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Publication Year Range</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    name="startYear"
                    value={advancedOptions.startYear}
                    onChange={handleAdvancedChange}
                    placeholder="From (e.g. 2019)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                  />
                  <input
                    type="number"
                    name="endYear"
                    value={advancedOptions.endYear}
                    onChange={handleAdvancedChange}
                    placeholder="To (e.g. 2024)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                  />
                </div>
              </div>

              {/* Author Query */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Authors</label>
                <input
                  type="text"
                  name="authors"
                  value={advancedOptions.authors}
                  onChange={handleAdvancedChange}
                  placeholder="e.g. Bengio Y, LeCun Y"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>

              {/* Journal / Venue */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Journal or Conference</label>
                <input
                  type="text"
                  name="journal"
                  value={advancedOptions.journal || ''}
                  onChange={handleAdvancedChange}
                  placeholder="e.g. Nature, NeurIPS, Lancet"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                />
              </div>

              {/* Research Domain */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Research Domain</label>
                <select
                  name="domain"
                  value={advancedOptions.domain}
                  onChange={handleAdvancedChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                >
                  {researchDomains.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* Study Design */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Study Design</label>
                <select
                  name="studyDesign"
                  value={advancedOptions.studyDesign}
                  onChange={handleAdvancedChange}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white transition-all"
                >
                  {studyDesigns.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {/* Institution (ROR) & Open Access */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Institution & Access</label>
                <div className="flex items-center gap-2">
                  {selectedInstitution ? (
                    <div className="flex-1 flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <span className="truncate font-medium text-slate-800">{selectedInstitution.name}</span>
                      <button type="button" onClick={onClearInstitution} className="text-slate-400 hover:text-slate-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={onOpenOrgFinder}
                      className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-600 hover:border-slate-400 flex items-center gap-2 text-left"
                    >
                      <Building2 className="w-3.5 h-3.5 text-slate-400" />
                      <span>Find Institution (ROR)</span>
                    </button>
                  )}

                  <label className="flex items-center gap-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100/60 text-xs">
                    <input
                      type="checkbox"
                      name="isOpenAccess"
                      checked={advancedOptions.isOpenAccess || false}
                      onChange={handleAdvancedChange}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-slate-900 focus:ring-0"
                    />
                    <span className="font-medium text-slate-700 whitespace-nowrap">OA Only</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Systematic Review Inclusion / Exclusion Logic */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Methodological Inclusion Criteria</label>
                <textarea
                  name="inclusionCriteria"
                  value={advancedOptions.inclusionCriteria}
                  onChange={handleAdvancedChange}
                  rows={2}
                  placeholder="e.g. Focus on human clinical trials, randomized control trials..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">Methodological Exclusion Criteria</label>
                <textarea
                  name="exclusionCriteria"
                  value={advancedOptions.exclusionCriteria}
                  onChange={handleAdvancedChange}
                  rows={2}
                  placeholder="e.g. Exclude purely theoretical notes, animal-only cohorts..."
                  className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 focus:bg-white resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                onClick={() => handleSubmit()}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition-colors"
              >
                Apply Filters & Search
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

