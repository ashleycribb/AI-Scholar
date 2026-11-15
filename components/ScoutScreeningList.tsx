import React from 'react';
import { Check, ShieldCheck } from 'lucide-react';
import type { ResearchPaper } from '../types';

export const SCOUT_SCREENING_HEADING = 'Screening list (sorted by match to your search)';
export const SCOUT_MATCH_SCORE_LABEL = 'match to search term';
export const SCOUT_UNCERTAINTY_FALLBACK =
    'Includes preliminary preprint distributions and non-blinded datasets. Verify records in the Local Lab before doctoral submission.';

export function formatMatchToSearchTerm(score: number): string {
    const rounded = Math.round(score > 1 ? score : score * 100);
    return `${SCOUT_MATCH_SCORE_LABEL}: ${rounded}%`;
}

interface ScoutScreeningListProps {
    papers: ResearchPaper[];
    approvedIds?: Set<string>;
    rationale?: string;
    uncertainty?: string;
    onApprove: (paper: ResearchPaper) => void;
    onSelectPaper: (paper: ResearchPaper) => void;
}

export const ScoutScreeningList: React.FC<ScoutScreeningListProps> = ({
    papers,
    approvedIds,
    rationale,
    uncertainty,
    onApprove,
    onSelectPaper,
}) => {
    const selected = approvedIds ?? new Set<string>();

    return (
        <div className="space-y-6">
            {rationale || uncertainty ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {rationale ? (
                        <div className="bg-slate-900 text-white rounded-2xl p-5 shadow-2xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                                Query & Adjacency Rationale
                            </span>
                            <p className="text-xs text-slate-200 leading-relaxed italic">
                                "{rationale}"
                            </p>
                        </div>
                    ) : null}

                    {uncertainty ? (
                        <div className="bg-amber-50 border border-amber-200/80 text-amber-950 rounded-2xl p-5 shadow-2xs">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 block mb-1">
                                Uncertainty & Empirical Caveats
                            </span>
                            <p className="text-xs text-amber-900 leading-relaxed font-medium italic">
                                "{uncertainty}"
                            </p>
                        </div>
                    ) : null}
                </div>
            ) : null}

            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        {SCOUT_SCREENING_HEADING}
                    </h3>
                    <span className="text-[11px] text-slate-500">
                        Human approval required before admission into Evidence Ledger
                    </span>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {papers.map((paper) => {
                        const isApproved = selected.has(paper.id);
                        const matchLabel =
                            paper.semanticScore !== undefined
                                ? formatMatchToSearchTerm(paper.semanticScore)
                                : null;

                        return (
                            <div
                                key={paper.id}
                                className="bg-white border border-slate-200/80 rounded-2xl p-5 shadow-2xs space-y-3 transition-all hover:border-slate-300"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                    <div className="space-y-1 pr-2">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {matchLabel ? (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-50 text-slate-700 border border-slate-200/60">
                                                    {matchLabel}
                                                </span>
                                            ) : null}
                                            {paper.isOpenAccess && (
                                                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                    Open Access
                                                </span>
                                            )}
                                            {paper.citations !== undefined && (
                                                <span className="text-[11px] text-slate-500 font-medium">
                                                    {paper.citations.toLocaleString()} Citations
                                                </span>
                                            )}
                                        </div>
                                        <h4
                                            onClick={() => onSelectPaper(paper)}
                                            className="text-base font-bold text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer leading-snug"
                                        >
                                            {paper.title}
                                        </h4>
                                        <p className="text-xs text-slate-500 font-medium">
                                            {paper.authors ? `${paper.authors.split(',')[0]} et al.` : 'Scholarly Authors'} • {paper.year}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => onApprove(paper)}
                                        disabled={isApproved}
                                        aria-pressed={isApproved}
                                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 ${
                                            isApproved
                                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 cursor-default'
                                                : 'bg-slate-900 hover:bg-slate-800 text-white shadow-2xs'
                                        }`}
                                    >
                                        {isApproved ? (
                                            <>
                                                <Check className="w-3.5 h-3.5" />
                                                <span>Admitted to Ledger</span>
                                            </>
                                        ) : (
                                            <>
                                                <ShieldCheck className="w-3.5 h-3.5" />
                                                <span>Approve & Stage</span>
                                            </>
                                        )}
                                    </button>
                                </div>

                                {paper.abstract && (
                                    <p className="text-xs text-slate-600 leading-relaxed line-clamp-2">
                                        {paper.abstract}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
