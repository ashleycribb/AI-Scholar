import React, { useState, useMemo } from 'react';
import { 
  Hash, 
  Plus, 
  Check, 
  ExternalLink, 
  BookOpen, 
  Layers, 
  Sparkles,
  Info
} from 'lucide-react';
import type { ResearchPaper } from '../types';
import { 
  countFrequentlyCitedReferences, 
  suggestionToResearchPaper, 
  type FrequentlyCitedItem 
} from '../services/frequentlyCitedService';

export interface FrequentlyCitedPanelProps {
  selectedPapers: ResearchPaper[];
  onSelectPaper: (paper: ResearchPaper) => void;
  onViewPaperDetail?: (paper: ResearchPaper) => void;
  topN?: number;
  className?: string;
}

export const FrequentlyCitedPanel: React.FC<FrequentlyCitedPanelProps> = ({
  selectedPapers,
  onSelectPaper,
  onViewPaperDetail,
  topN = 5,
  className = ''
}) => {
  const [currentTopN, setCurrentTopN] = useState<number>(topN);
  const [recentlyAddedIds, setRecentlyAddedIds] = useState<Set<string>>(new Set());

  // Count co-citations across selected papers' reference lists (pure counting, no AI scoring)
  const suggestions = useMemo(() => {
    return countFrequentlyCitedReferences(selectedPapers, { topN: currentTopN });
  }, [selectedPapers, currentTopN]);

  // Determine which empty state applies
  const totalSelected = selectedPapers.length;
  const hasAnyReferences = useMemo(() => {
    return selectedPapers.some((p) => {
      const refs = (p as any).references || (p as any).referenceList || (p as any).referenced_works || (p as any).referencedWorks;
      return Array.isArray(refs) && refs.length > 0;
    });
  }, [selectedPapers]);

  const handleAdd = (item: FrequentlyCitedItem) => {
    const paper = suggestionToResearchPaper(item);
    setRecentlyAddedIds((prev) => new Set(prev).add(item.id));
    onSelectPaper(paper);
  };

  return (
    <div 
      className={`bg-white border border-slate-200/80 rounded-2xl p-5 sm:p-6 shadow-2xs space-y-5 ${className}`}
      data-testid="frequently-cited-panel"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
              <Hash className="w-4 h-4" />
            </span>
            <h3 className="text-base font-bold text-slate-900 tracking-tight">
              Frequently Cited in Selected Works
            </h3>
            {suggestions.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed max-w-2xl">
            Papers co-cited across your selected corpus. Counted directly from reference lists — no AI relevance scoring.
          </p>
        </div>

        {/* Top N limit selector */}
        {totalSelected > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-500 self-start sm:self-center">
            <span className="text-[11px] font-medium text-slate-400">Show top:</span>
            {[5, 10, 20].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setCurrentTopN(n)}
                className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                  currentTopN === n
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                aria-label={`Show top ${n} suggestions`}
              >
                {n}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transparency Note */}
      <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-[11px] text-slate-600 leading-relaxed">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          <strong>Suggestions only:</strong> Nothing is added to your selection corpus automatically. Selecting a paper records Pass 1 (consent-only tracing).
        </span>
      </div>

      {/* Empty States */}
      {suggestions.length === 0 && (
        <div 
          className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-xl space-y-2 bg-slate-50/50"
          data-testid="empty-state-message"
        >
          <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mx-auto">
            <BookOpen className="w-4 h-4" />
          </div>
          {totalSelected === 0 ? (
            <>
              <h4 className="text-xs font-semibold text-slate-800">No papers selected yet</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                Add candidate papers to your selection queue to reveal the works most frequently cited across them.
              </p>
            </>
          ) : !hasAnyReferences ? (
            <>
              <h4 className="text-xs font-semibold text-slate-800">No reference lists available</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                The {totalSelected} selected {totalSelected === 1 ? 'paper does' : 'papers do'} not include indexed reference lists yet.
              </p>
            </>
          ) : (
            <>
              <h4 className="text-xs font-semibold text-slate-800">All cited works are in your corpus</h4>
              <p className="text-[11px] text-slate-500 max-w-sm mx-auto leading-relaxed">
                Every reference cited across your selected papers has already been added to your selection queue.
              </p>
            </>
          )}
        </div>
      )}

      {/* Suggestion Cards */}
      {suggestions.length > 0 && (
        <div className="space-y-3">
          {suggestions.map((item, index) => {
            const isAdded = recentlyAddedIds.has(item.id);
            return (
              <div
                key={item.id}
                className="p-4 bg-white border border-slate-200/90 hover:border-slate-300 rounded-xl transition-all shadow-2xs space-y-3"
                data-testid="suggestion-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-slate-100 text-slate-600 font-mono text-[11px] font-bold flex items-center justify-center">
                      #{index + 1}
                    </span>
                    <div className="space-y-1 min-w-0 flex-1">
                      <h4 
                        className={`text-sm font-bold text-slate-900 leading-snug break-words ${
                          onViewPaperDetail ? 'hover:text-indigo-600 cursor-pointer transition-colors' : ''
                        }`}
                        onClick={() => onViewPaperDetail && onViewPaperDetail(suggestionToResearchPaper(item))}
                      >
                        {item.title}
                      </h4>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        {item.authors && <span>{item.authors}</span>}
                        {item.year && (
                          <>
                            <span className="text-slate-300">&bull;</span>
                            <span className="font-medium text-slate-600">{item.year}</span>
                          </>
                        )}
                        {item.doi && (
                          <>
                            <span className="text-slate-300">&bull;</span>
                            <a
                              href={`https://doi.org/${item.doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-mono text-[10px] text-indigo-600 hover:text-indigo-800 hover:underline"
                            >
                              <span>doi:{item.doi}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Frequency Count Pill */}
                  <div className="shrink-0 text-right">
                    <span 
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/70"
                      title={`Cited by ${item.count} paper${item.count === 1 ? '' : 's'} in your selection queue`}
                    >
                      <Hash className="w-3 h-3 text-indigo-500" />
                      <span>{item.count} {item.count === 1 ? 'citation' : 'citations'}</span>
                    </span>
                  </div>
                </div>

                {/* Which selected papers cite this work */}
                <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-600">Cited in:</span>
                    {item.citedBy.map((c) => (
                      <span
                        key={c.id}
                        className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium max-w-xs truncate border border-slate-200/60"
                        title={c.title}
                        data-testid="cited-by-chip"
                      >
                        {c.title} {c.year ? `(${c.year})` : ''}
                      </span>
                    ))}
                  </div>

                  {/* Add to Corpus Action */}
                  <button
                    type="button"
                    onClick={() => handleAdd(item)}
                    disabled={isAdded}
                    className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      isAdded
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 cursor-default'
                        : 'bg-slate-900 text-white hover:bg-slate-800 active:scale-98 shadow-2xs'
                    }`}
                    data-testid="add-to-corpus-btn"
                    aria-label={`Select paper "${item.title}"`}
                  >
                    {isAdded ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Added (Pass 1)</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Select paper</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
