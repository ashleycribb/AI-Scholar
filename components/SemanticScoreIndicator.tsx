
import React, { useState, useEffect, useRef } from 'react';
import type { ResearchPaper, ScoreExplanation } from '../types';
import { SparklesIcon } from './icons/SparklesIcon';
import { buildPaperScoreExplanation } from '../services/rerankService';
import { isRecordingActive, subscribeS3AState, emitStatement } from '../services/s3aWasmService';
import { HelpCircle, Check, X, RotateCcw, Clock } from 'lucide-react';

interface SemanticScoreIndicatorProps {
    score: number | undefined;
    paper?: ResearchPaper;
    searchQuery?: string;
    onScoreDecision?: (paper: ResearchPaper, decision: 'keep' | 'drop') => void;
    onRetryScoring?: () => void;
}

export const SemanticScoreIndicator: React.FC<SemanticScoreIndicatorProps> = ({
    score,
    paper,
    searchQuery = '',
    onScoreDecision,
    onRetryScoring
}) => {
    const [showPopover, setShowPopover] = useState(false);
    const [tracingActive, setTracingActive] = useState(false);
    const [decision, setDecision] = useState<'keep' | 'drop' | null>(paper?.researcherScoreDecision || null);
    const [timedOut, setTimedOut] = useState(false);
    const [retryCycle, setRetryCycle] = useState(0);
    const popoverRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setDecision(paper?.researcherScoreDecision || null);
    }, [paper?.researcherScoreDecision]);

    useEffect(() => {
        let mounted = true;
        const checkTracing = () => {
            isRecordingActive().then(active => {
                if (mounted) setTracingActive(active);
            }).catch(() => {});
        };
        checkTracing();
        const unsub = subscribeS3AState(() => {
            checkTracing();
        });
        return () => {
            mounted = false;
            unsub();
        };
    }, []);

    // Item 8: After 30 seconds, cards still stuck on "Analyzing…" show "Taking longer than usual" with a Retry button
    useEffect(() => {
        if (score !== undefined) {
            setTimedOut(false);
            return;
        }
        setTimedOut(false);
        const timer = setTimeout(() => {
            setTimedOut(true);
        }, 30000);
        return () => clearTimeout(timer);
    }, [score, paper?.id, retryCycle]);

    useEffect(() => {
        if (!showPopover) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
                setShowPopover(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showPopover]);

    const handleRetry = (e: React.MouseEvent) => {
        e.stopPropagation();
        setTimedOut(false);
        setRetryCycle(c => c + 1);
        if (onRetryScoring) {
            onRetryScoring();
        } else if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('scholar:retry-scoring', { detail: { paperId: paper?.id } }));
        }
    };

    const isLoadingScore = score === undefined;
    const roundedScore = isLoadingScore ? 0 : Math.round(score > 1 ? score : score * 100);

    let barColorClass = 'bg-slate-300';
    let textColorClass = 'text-slate-500';
    let label = 'Neutral';

    if (!isLoadingScore) {
        if (roundedScore >= 80) {
            barColorClass = 'bg-indigo-600';
            textColorClass = 'text-indigo-700';
            label = 'High Match';
        } else if (roundedScore >= 60) {
            barColorClass = 'bg-indigo-500';
            textColorClass = 'text-indigo-600';
            label = 'Relevant';
        } else if (roundedScore >= 40) {
            barColorClass = 'bg-blue-400';
            textColorClass = 'text-blue-600';
            label = 'Possible Match';
        } else if (roundedScore > 10) {
            barColorClass = 'bg-slate-400';
            textColorClass = 'text-slate-600';
            label = 'Low Match';
        } else {
            barColorClass = 'bg-slate-200';
            textColorClass = 'text-slate-400';
            label = 'Low Relevance';
        }
    }

    const explanation: ScoreExplanation = paper
        ? (paper.scoreExplanation && paper.scoreExplanation.inputs
            ? paper.scoreExplanation
            : buildPaperScoreExplanation(paper, searchQuery, paper.scoreExplanation?.method || 'Embedding similarity + keyword boost'))
        : {
            method: 'Embedding similarity + keyword boost',
            matchedTerms: searchQuery
                ? searchQuery.split(/\s+/).filter(t => t.length > 2).slice(0, 4).map(t => ({ term: t, locations: ['abstract'] }))
                : [],
            topPassage: '',
            inputs: [
                { label: 'Semantic similarity', value: isLoadingScore ? 'Calculating…' : `${roundedScore}%`, weight: '40%', isLoading: isLoadingScore },
                { label: 'Keyword match', value: isLoadingScore ? 'Calculating…' : `${searchQuery ? 'Matched query terms' : '0.0 pts'}`, weight: '54%', isLoading: isLoadingScore },
                { label: 'Recency', value: isLoadingScore ? 'Calculating…' : 'Computed from publication year', weight: '6%', isLoading: isLoadingScore },
                { label: 'Citations', value: 'Calculating…', weight: 'Tie-breaker / sort', isLoading: true }
            ]
        };

    const handleDecisionClick = async (e: React.MouseEvent, choice: 'keep' | 'drop') => {
        e.stopPropagation();
        setDecision(choice);
        if (paper && onScoreDecision) {
            onScoreDecision(paper, choice);
        }
        if (tracingActive && paper) {
            await emitStatement(
                choice === 'keep' ? 'accepted' : 'rejected',
                {
                    id: paper.openalex_id
                        ? `https://openalex.org/${paper.openalex_id}`
                        : (paper.doi ? `https://doi.org/${paper.doi}` : paper.id),
                    name: paper.title,
                    type: 'academic-paper',
                    description: `Researcher ${choice.toUpperCase()} decision beside ${roundedScore}% ${label} score`
                },
                {
                    actor: 'human',
                    decision: choice === 'keep' ? 'accepted' : 'rejected',
                    semanticScore: roundedScore,
                    scoreLabel: label,
                    openalex_id: paper.openalex_id,
                    doi: paper.doi,
                    year: paper.year,
                    citations: paper.citations
                }
            ).catch(() => {});
        }
    };

    return (
        <div
            className="relative flex flex-col gap-2"
            ref={popoverRef}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                {isLoadingScore ? (
                    timedOut ? (
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span className="text-[11px] text-amber-800 font-semibold">Taking longer than usual</span>
                            <button
                                type="button"
                                onClick={handleRetry}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold transition-colors"
                            >
                                <RotateCcw className="w-2.5 h-2.5" />
                                <span>Retry</span>
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2 animate-pulse">
                            <div className="w-3.5 h-3.5 bg-slate-200 rounded-full" />
                            <div className="h-2 w-20 bg-slate-100 rounded-full" />
                            <span className="text-[10px] text-slate-500 font-medium">Analyzing…</span>
                        </div>
                    )
                ) : (
                    <div className="flex items-center gap-1.5" title="Relevance score based on semantic similarity, keyword match, and recency">
                        <SparklesIcon className={`w-3.5 h-3.5 ${textColorClass}`} />
                        <span className={`text-[10px] font-black uppercase tracking-widest ${textColorClass}`}>
                            {roundedScore}% {label}
                        </span>
                    </div>
                )}

                <div className="flex items-center gap-1.5">
                    {!isLoadingScore && (
                        <span className={`font-mono text-[10px] font-bold ${textColorClass}`}>
                            {roundedScore}%
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowPopover(prev => !prev);
                        }}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-semibold transition-colors"
                        title="Explain how this relevance score was computed"
                    >
                        <HelpCircle className="w-3 h-3 text-indigo-600" />
                        <span>Why this score</span>
                    </button>

                    {tracingActive && paper && !isLoadingScore && (
                        <div className="inline-flex items-center gap-1 ml-0.5">
                            <button
                                type="button"
                                onClick={(e) => handleDecisionClick(e, 'keep')}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                    decision === 'keep'
                                        ? 'bg-emerald-600 text-white border-emerald-700'
                                        : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-200'
                                }`}
                                title="Record Keep decision in study trace"
                            >
                                <Check className="w-2.5 h-2.5" />
                                <span>Keep</span>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => handleDecisionClick(e, 'drop')}
                                className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                                    decision === 'drop'
                                        ? 'bg-rose-600 text-white border-rose-700'
                                        : 'bg-white hover:bg-rose-50 text-rose-700 border-rose-200'
                                }`}
                                title="Record Drop decision in study trace (never auto-drops paper)"
                            >
                                <X className="w-2.5 h-2.5" />
                                <span>Drop</span>
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {!isLoadingScore && (
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                        className={`h-full ${barColorClass} transition-all duration-1000 ease-out`} 
                        style={{ 
                            width: `${Math.max(roundedScore, 5)}%`,
                        }}
                    ></div>
                </div>
            )}

            {showPopover && explanation && (
                <div
                    className="absolute left-0 bottom-full mb-2 z-50 w-80 sm:w-96 p-3.5 rounded-xl bg-white border border-slate-200 shadow-2xl text-xs text-slate-700 space-y-2.5 animate-in fade-in duration-150"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                        <div>
                            <div className="font-bold text-slate-900 text-xs">
                                Why this score: {isLoadingScore ? 'Calculating…' : `${roundedScore}% (${label})`}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                                Scoring method: <strong className="text-slate-800">{explanation.method}</strong>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setShowPopover(false)}
                            className="p-1 text-slate-400 hover:text-slate-600 rounded"
                        >
                            <X className="w-3.5 h-3.5" />
                        </button>
                    </div>

                    {explanation.inputs && explanation.inputs.length > 0 && (
                        <div className="space-y-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                Score Inputs &amp; Weights
                            </span>
                            <div className="divide-y divide-slate-100 border border-slate-200/80 rounded-lg bg-slate-50/60">
                                {explanation.inputs.map((inp, idx) => (
                                    <div key={idx} className="flex items-center justify-between px-2.5 py-1.5 text-[11px] gap-2">
                                        <span className="font-semibold text-slate-800">{inp.label}</span>
                                        <div className="flex items-center gap-2 text-right">
                                            <span className={`font-mono ${inp.isLoading ? 'text-slate-500 italic' : 'text-slate-900 font-semibold'}`}>
                                                {inp.value}
                                            </span>
                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 font-mono">
                                                weight: {inp.weight}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Matched Terms &amp; Concepts (Match Location)
                        </span>
                        {explanation.matchedTerms.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                                {explanation.matchedTerms.map((item, idx) => (
                                    <div
                                        key={`${item.term}-${idx}`}
                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50/70 border border-indigo-200/70 text-[11px]"
                                    >
                                        <span className="font-semibold text-indigo-950">{item.term}</span>
                                        <span className="text-[10px] text-indigo-700 font-mono">
                                            [{item.locations.join(', ')}]
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-[11px] text-slate-600">
                                {isLoadingScore ? 'Calculating…' : 'No exact query keywords matched in title or abstract.'}
                            </p>
                        )}
                    </div>

                    {(explanation.topPassage || paper?.semanticHighlights?.[0]?.text || paper?.abstract) && (
                        <div className="space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                                Top Matching Passage
                            </span>
                            <blockquote className="p-2 rounded-lg bg-slate-50 border-l-2 border-indigo-500 text-[11px] text-slate-700 leading-relaxed italic line-clamp-4">
                                &ldquo;{explanation.topPassage || paper?.semanticHighlights?.[0]?.text || paper?.abstract}&rdquo;
                            </blockquote>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};


