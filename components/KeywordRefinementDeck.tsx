import React, { useState } from 'react';
import { 
  Sparkles, 
  Tag, 
  Plus, 
  Check, 
  Filter, 
  BookOpen, 
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Layers,
  FlaskConical,
  HelpCircle
} from 'lucide-react';
import type { AcademicKeyword, KeywordCategory } from '../services/keywordSuggestionService';

interface KeywordRefinementDeckProps {
  keywords: AcademicKeyword[];
  selectedPaperCount: number;
  totalPaperCount: number;
  currentQuery: string;
  onAddKeywordToQuery: (term: string, mode?: 'and' | 'append') => void;
  onFilterByKeyword?: (term: string) => void;
  isOnlySelected: boolean;
  onToggleOnlySelected?: (enabled: boolean) => void;
}

export const KeywordRefinementDeck: React.FC<KeywordRefinementDeckProps> = ({
  keywords,
  selectedPaperCount,
  totalPaperCount,
  currentQuery,
  onAddKeywordToQuery,
  onFilterByKeyword,
  isOnlySelected,
  onToggleOnlySelected
}) => {
  const [activeCategory, setActiveCategory] = useState<KeywordCategory | 'all'>('all');
  const [isExpanded, setIsExpanded] = useState(true);
  const [showSnippets, setShowSnippets] = useState(false);
  const [hoveredTerm, setHoveredTerm] = useState<string | null>(null);

  if (!keywords || keywords.length === 0) return null;

  const filteredKeywords = activeCategory === 'all' 
    ? keywords 
    : keywords.filter(k => k.category === activeCategory);

  const lowerQuery = currentQuery.toLowerCase();

  const getCategoryBadge = (category: KeywordCategory) => {
    switch (category) {
      case 'method':
        return { label: 'Method', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: FlaskConical };
      case 'acronym':
        return { label: 'Acronym', bg: 'bg-purple-50 text-purple-700 border-purple-200', icon: Tag };
      case 'concept':
        return { label: 'Concept', bg: 'bg-blue-50 text-blue-700 border-blue-200', icon: Layers };
      case 'topic':
      default:
        return { label: 'Term', bg: 'bg-slate-100 text-slate-700 border-slate-200', icon: Sparkles };
    }
  };

  const methodCount = keywords.filter(k => k.category === 'method').length;
  const conceptCount = keywords.filter(k => k.category === 'concept' || k.category === 'topic').length;
  const acronymCount = keywords.filter(k => k.category === 'acronym').length;

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden transition-all duration-200">
      {/* Deck Header */}
      <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Abstract Keyword Suggestion Engine
              </h4>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {keywords.length} terms extracted
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              {isOnlySelected && selectedPaperCount > 0
                ? `Panned from ${selectedPaperCount} selected paper abstracts in your workspace`
                : `Synthesized from ${totalPaperCount} paper abstracts in the current result set`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Source Scope Toggle */}
          {selectedPaperCount > 0 && onToggleOnlySelected && (
            <button
              type="button"
              onClick={() => onToggleOnlySelected(!isOnlySelected)}
              className={`px-3 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
                isOnlySelected
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
              title="Toggle between extracting from user-selected papers or all results"
            >
              <BookOpen className="w-3 h-3" />
              <span>{isOnlySelected ? `Selected Only (${selectedPaperCount})` : `Scope: All (${totalPaperCount})`}</span>
            </button>
          )}

          {/* Context Snippet Toggle */}
          <button
            type="button"
            onClick={() => setShowSnippets(!showSnippets)}
            className={`px-2.5 py-1 text-[11px] font-bold rounded-lg border transition-all ${
              showSnippets
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
            title="Toggle abstract snippet previews"
          >
            {showSnippets ? 'Hide Snippets' : 'Show Snippets'}
          </button>

          {/* Collapse/Expand */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg hover:bg-slate-200/60 transition-colors"
            aria-label={isExpanded ? 'Collapse keywords' : 'Expand keywords'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-3.5">
          {/* Category Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-slate-100">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors ${
                activeCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              All Terms ({keywords.length})
            </button>
            {methodCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('method')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 ${
                  activeCategory === 'method'
                    ? 'bg-emerald-700 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                <FlaskConical className="w-3 h-3" />
                <span>Methodologies ({methodCount})</span>
              </button>
            )}
            {conceptCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('concept')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 ${
                  activeCategory === 'concept'
                    ? 'bg-blue-700 text-white'
                    : 'text-blue-700 hover:bg-blue-50'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>Key Concepts ({conceptCount})</span>
              </button>
            )}
            {acronymCount > 0 && (
              <button
                type="button"
                onClick={() => setActiveCategory('acronym')}
                className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-colors flex items-center gap-1 ${
                  activeCategory === 'acronym'
                    ? 'bg-purple-700 text-white'
                    : 'text-purple-700 hover:bg-purple-50'
                }`}
              >
                <Tag className="w-3 h-3" />
                <span>Acronyms ({acronymCount})</span>
              </button>
            )}
          </div>

          {/* Interactive Term Chips */}
          <div className="flex flex-wrap items-center gap-2">
            {filteredKeywords.map((kw) => {
              const badge = getCategoryBadge(kw.category);
              const isAlreadyInQuery = lowerQuery.includes(kw.term.toLowerCase());

              return (
                <div
                  key={kw.term}
                  onMouseEnter={() => setHoveredTerm(kw.term)}
                  onMouseLeave={() => setHoveredTerm(null)}
                  className="relative group"
                >
                  <button
                    type="button"
                    onClick={() => onAddKeywordToQuery(kw.term, 'and')}
                    disabled={isAlreadyInQuery}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-150 shadow-2xs ${
                      isAlreadyInQuery
                        ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-default'
                        : kw.fromSelectedPaper
                        ? 'bg-indigo-50/70 text-indigo-950 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300 hover:shadow-xs'
                        : 'bg-white text-slate-800 border-slate-200 hover:bg-slate-50 hover:border-slate-300 hover:shadow-xs'
                    }`}
                  >
                    {isAlreadyInQuery ? (
                      <Check className="w-3 h-3 text-emerald-600" />
                    ) : (
                      <Plus className="w-3 h-3 text-slate-400 group-hover:text-slate-900 group-hover:scale-110 transition-transform" />
                    )}

                    <span>{kw.term}</span>

                    {/* Occurrence count pill */}
                    <span
                      className={`ml-0.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold border ${badge.bg}`}
                      title={`${kw.count} abstracts mention this term`}
                    >
                      {kw.count} {kw.count === 1 ? 'paper' : 'papers'}
                    </span>

                    {kw.fromSelectedPaper && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" title="Extracted from selected paper in your queue" />
                    )}
                  </button>

                  {/* Context Snippet Popover */}
                  {(showSnippets || hoveredTerm === kw.term) && kw.sampleSnippet && (
                    <div className="absolute left-0 bottom-full mb-2 w-72 p-2.5 bg-slate-900 text-white rounded-xl text-[11px] shadow-xl z-30 pointer-events-none animate-fade-in border border-slate-800">
                      <div className="flex items-center justify-between font-bold text-slate-300 text-[10px] mb-1">
                        <span className="uppercase tracking-wider">{kw.category}</span>
                        <span>{kw.count} matches</span>
                      </div>
                      <p className="text-slate-200 italic leading-relaxed">
                        "{kw.sampleSnippet}"
                      </p>
                      {kw.paperTitles.length > 0 && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-slate-400 truncate">
                          Source: {kw.paperTitles[0]}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Quick instructions / Help Footer */}
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-50">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Click any academic term to append <code className="text-slate-600 font-mono text-[10px]">AND "term"</code> to your search query</span>
            </span>
            <span>Terms derived purely from peer-reviewed paper abstracts</span>
          </div>
        </div>
      )}
    </div>
  );
};
