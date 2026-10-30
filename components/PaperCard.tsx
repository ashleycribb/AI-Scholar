
import React from 'react';
import type { ResearchPaper } from '../types';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';
import { SourceCheckBadge } from './SourceCheckBadge';
import { SciteBadge } from './SciteBadge';
import { AddIcon } from './icons/AddIcon';
import { CheckIcon } from './icons/CheckIcon';
import { SparklesIcon } from './icons/SparklesIcon';

interface PaperCardProps {
    paper: ResearchPaper;
    isSelected: boolean;
    onSelect: () => void;
    isInWorkspace: boolean;
    onToggleWorkspace: () => void;
    onGenerateLaymanSummary?: (paper: ResearchPaper) => void;
    searchQuery?: string;
}

/**
 * Highlights keywords within a text string.
 * Uses words from the title as a proxy for "relevant keywords" if the specific query isn't available.
 */
const HighlightedText: React.FC<{ text: string; keywords: string[] }> = ({ text, keywords }) => {
    const safeText = typeof text === 'string' ? text : (text ? String(text) : '');
    if (!keywords || !keywords.length || !safeText) return <>{safeText}</>;
    
    // Filter out very short words and common stop words to get meaningful keywords
    const stopWords = new Set(['the', 'and', 'with', 'from', 'that', 'this', 'for', 'was', 'were']);
    const validKeywords = keywords
        .filter(k => typeof k === 'string' && k.length > 3 && !stopWords.has(k.toLowerCase()))
        .map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); // Escape regex chars

    if (validKeywords.length === 0) return <>{safeText}</>;

    const pattern = new RegExp(`(${validKeywords.join('|')})`, 'gi');
    const parts = safeText.split(pattern);

    return (
        <>
            {parts.map((part, i) => 
                pattern.test(part) ? (
                    <mark key={i} className="bg-amber-200/60 text-amber-900 rounded-sm px-0.5 font-semibold transition-colors group-hover:bg-amber-300/80">
                        {part}
                    </mark>
                ) : part
            )}
        </>
    );
};

export const PaperCard: React.FC<PaperCardProps> = ({ paper, isSelected, onSelect, isInWorkspace, onToggleWorkspace, onGenerateLaymanSummary, searchQuery }) => {
    const [showLayman, setShowLayman] = React.useState(false);

    // Normalize text fields defensively against any non-string API responses
    const safeTitle = typeof paper.title === 'string' 
        ? paper.title 
        : (paper.title ? (typeof (paper.title as any)?.['$'] === 'string' ? (paper.title as any)['$'] : String(paper.title)) : 'Untitled Paper');
    const safeAuthors = typeof paper.authors === 'string' 
        ? paper.authors 
        : (paper.authors ? String(paper.authors) : 'Unknown Authors');
    
    // Determine if we should show semantic highlights
    const topHighlight = paper.semanticHighlights?.[0];
    const hasStrongMatch = paper.semanticScore && paper.semanticScore > 50 && topHighlight;
    
    // Extract potential keywords from the title for highlighting
    const titleKeywords = safeTitle ? safeTitle.split(/[\s,.:;?!\(\)\[\]]+/).filter(Boolean) : [];

    return (
        <div 
            onClick={onSelect}
            className={`group relative flex flex-col p-5 sm:p-6 rounded-xl border transition-all duration-200 cursor-pointer ${
                isSelected 
                    ? 'border-slate-900 bg-white shadow-sm ring-1 ring-slate-900/10' 
                    : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
            }`}
        >
            {/* Top Row: Badges and Save Button */}
            <div className="flex justify-between items-start gap-3 mb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                    {paper.semanticScore && paper.semanticScore > 85 && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-900 text-white">
                            <SparklesIcon className="w-3 h-3 mr-1" />
                            Top Match
                        </span>
                    )}
                    {paper.year === new Date().getFullYear() && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200/50">
                            New Release
                        </span>
                    )}
                    {paper.enrichmentSource && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                            {paper.enrichmentSource}
                        </span>
                    )}
                    {paper.isOpenAccess && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/50">
                            Open Access
                        </span>
                    )}
                </div>
                
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onToggleWorkspace();
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        isInWorkspace 
                        ? 'bg-emerald-100 text-emerald-800' 
                        : 'bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white'
                    }`}
                    title={isInWorkspace ? "Remove from Workspace" : "Save to Workspace"}
                    aria-label={isInWorkspace ? "Remove from Workspace" : "Save to Workspace"}
                >
                    {isInWorkspace ? <CheckIcon className="w-4 h-4" /> : <AddIcon className="w-4 h-4" />}
                </button>
            </div>

            {/* Title */}
            <h3 className={`text-base sm:text-lg font-semibold tracking-tight mb-2 leading-snug transition-colors ${
                isSelected ? 'text-slate-900' : 'text-slate-900 group-hover:text-indigo-600'
            }`}>
                {safeTitle}
            </h3>
            
            {/* Meta Info */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-500 mb-4">
                <div className="flex items-center">
                    <span className="font-medium text-slate-800">{safeAuthors.split(',')[0]}</span>
                    <span className="ml-1 text-slate-400">et al.</span>
                </div>
                <span className="text-slate-300">•</span>
                <span className="font-normal text-slate-600">{paper.year}</span>
                {paper.citations !== undefined && (
                    <>
                        <span className="text-slate-300">•</span>
                        <span className="font-mono text-[11px] text-slate-500">{paper.citations} citations</span>
                    </>
                )}
                {paper.sciteTally && (
                    <>
                        <span className="text-slate-300">•</span>
                        <SciteBadge tally={paper.sciteTally} />
                    </>
                )}
                <span className="text-slate-300">•</span>
                <a 
                    href={paper.sourceURL || (paper.doi ? `https://doi.org/${paper.doi}` : `https://scholar.google.com/scholar?q=${encodeURIComponent(safeTitle)}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="flex items-center gap-1 text-slate-600 hover:text-indigo-600 font-medium transition-colors hover:underline"
                >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    Source
                </a>
            </div>

            {/* Layman Summary Toggle & Content */}
            <div className="mb-6">
                {!paper.laymanSummary && !paper.isLaymanLoading ? (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onGenerateLaymanSummary?.(paper);
                            setShowLayman(true);
                        }}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100"
                    >
                        <SparklesIcon className="w-3.5 h-3.5" />
                        Summarize for Laymen
                    </button>
                ) : (
                    <div className={`p-4 rounded-xl border transition-all ${
                        paper.isLaymanLoading 
                            ? 'bg-slate-50 border-slate-100 animate-pulse' 
                            : 'bg-indigo-50/30 border-indigo-100/50'
                    }`}>
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-3.5 h-3.5 text-indigo-600" />
                                <span className="micro-label text-indigo-600">Layman Summary</span>
                            </div>
                            {!paper.isLaymanLoading && (
                                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400 italic">Plain Language translation</span>
                            )}
                        </div>
                        {paper.isLaymanLoading ? (
                            <div className="space-y-2">
                                <div className="h-3 bg-slate-200 rounded w-full" />
                                <div className="h-3 bg-slate-200 rounded w-5/6" />
                            </div>
                        ) : (
                            <p className="text-sm text-slate-700 leading-relaxed italic">
                                {paper.laymanSummary}
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Semantic Context Snippet */}
            {hasStrongMatch && (
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-100 group-hover:bg-white group-hover:border-slate-200 transition-all">
                    <div className="flex items-center gap-2 mb-2">
                        <SparklesIcon className="w-3.5 h-3.5 text-slate-900" />
                        <span className="micro-label">Relevance Insight</span>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">
                        "...<HighlightedText text={topHighlight.text} keywords={titleKeywords} />..."
                    </p>
                </div>
            )}

            {/* Source check badge (lazy-loaded per card in view, cached per DOI/OpenAlex ID) */}
            <div className="mb-3">
                <SourceCheckBadge paper={paper} compact={true} />
            </div>

            {/* Bottom Row: Score and Action */}
            <div className="mt-auto pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                <div className="flex-grow max-w-md">
                    <SemanticScoreIndicator score={paper.semanticScore} paper={paper} searchQuery={searchQuery} />
                </div>
                
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
                        View Details
                    </span>
                    <div className="w-8 h-8 rounded-full border border-slate-200 flex items-center justify-center group-hover:bg-slate-900 group-hover:border-slate-900 group-hover:text-white transition-all">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    );
};
