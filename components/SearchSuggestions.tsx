import React from 'react';
import { FileText, Search, Plus, Sparkles, Tag, Layers, FlaskConical, ArrowRight, CornerDownLeft } from 'lucide-react';
import type { AcademicKeyword, OpenAlexAutocompleteItem } from '../services/keywordSuggestionService';

interface SearchSuggestionsProps {
  query: string;
  autocompleteWorks: OpenAlexAutocompleteItem[];
  academicKeywords: AcademicKeyword[];
  isLoading: boolean;
  onSelectWork: (work: OpenAlexAutocompleteItem) => void;
  onSelectKeyword: (keyword: string, mode?: 'and' | 'append') => void;
  onExecuteSearch: (query: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const SearchSuggestions: React.FC<SearchSuggestionsProps> = ({
  query,
  autocompleteWorks,
  academicKeywords,
  isLoading,
  onSelectWork,
  onSelectKeyword,
  onExecuteSearch,
  isOpen,
  onClose,
}) => {
  if (!isOpen || (!query.trim() && academicKeywords.length === 0)) {
    return null;
  }

  const hasKeywords = academicKeywords.length > 0;
  const hasWorks = autocompleteWorks.length > 0;

  return (
    <div 
      className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200/90 rounded-2xl shadow-2xl z-50 overflow-hidden animate-slide-up backdrop-blur-sm transition-all"
      role="listbox"
      aria-label="Search suggestions and matching works"
    >
      {/* 1. Dynamic Keyword Refinements from Paper Abstracts */}
      {hasKeywords && (
        <div className="p-3.5 bg-slate-50/70 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Refine with Terms from Abstracts</span>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
              Keyword Engine
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {academicKeywords.slice(0, 8).map((kw) => (
              <button
                key={kw.term}
                type="button"
                onClick={() => onSelectKeyword(kw.term, 'and')}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-900 transition-all text-slate-700 shadow-2xs group"
                title={`${kw.count} abstracts mention "${kw.term}"`}
              >
                <Plus className="w-3 h-3 text-slate-400 group-hover:text-indigo-600 transition-colors" />
                <span>{kw.term}</span>
                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded-md">
                  {kw.count}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Matching Scholarly Works (OpenAlex Style) */}
      <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
        {isLoading && autocompleteWorks.length === 0 ? (
          <div className="p-6 flex items-center justify-center gap-3 text-slate-400 text-sm">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin" />
            <span>Finding matching scholarly works...</span>
          </div>
        ) : hasWorks ? (
          autocompleteWorks.map((work) => (
            <button
              key={work.id}
              type="button"
              onClick={() => onSelectWork(work)}
              className="w-full text-left px-5 py-3 hover:bg-slate-50/90 transition-colors duration-150 flex items-start gap-3.5 group cursor-pointer"
            >
              {/* Document Icon matching OpenAlex screenshot */}
              <div className="mt-0.5 p-1 rounded-md text-slate-400 group-hover:text-slate-800 group-hover:bg-slate-200/50 transition-colors shrink-0">
                <FileText className="w-4 h-4" />
              </div>

              <div className="flex-1 min-w-0 pr-2">
                <p className="text-sm font-semibold text-slate-900 leading-snug group-hover:text-slate-950">
                  {work.displayName}
                </p>
                {work.hint && (
                  <p className="text-xs text-slate-500 font-normal truncate mt-0.5">
                    {work.hint}
                  </p>
                )}
              </div>

              {typeof work.citedByCount === 'number' && work.citedByCount > 0 && (
                <div className="text-[11px] font-semibold text-slate-400 shrink-0 self-center">
                  {work.citedByCount.toLocaleString()} citations
                </div>
              )}
            </button>
          ))
        ) : query.trim().length >= 2 ? (
          <div className="p-4 text-center text-xs text-slate-400">
            No exact title matches. Press Enter or click below to perform full-text academic search.
          </div>
        ) : null}
      </div>

      {/* 3. Bottom Footer (Matching OpenAlex Enter Keycap Action) */}
      {query.trim() && (
        <div className="px-5 py-3 bg-slate-50/90 border-t border-slate-100 flex items-center justify-between">
          <button
            type="button"
            onClick={() => onExecuteSearch(query)}
            className="flex items-center gap-2.5 text-xs font-semibold text-slate-700 hover:text-slate-950 transition-colors group"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-900 transition-colors" />
            <span>
              Search works for <span className="italic font-bold text-slate-900">"{query}"</span>
            </span>
          </button>

          <div 
            onClick={() => onExecuteSearch(query)}
            className="cursor-pointer inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-slate-500 bg-white border border-slate-200 rounded-md shadow-2xs hover:bg-slate-100 transition-colors"
          >
            <span>enter</span>
            <CornerDownLeft className="w-2.5 h-2.5" />
          </div>
        </div>
      )}
    </div>
  );
};
