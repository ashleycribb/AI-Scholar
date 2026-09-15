
import React from 'react';
import type { InnovationResult, ResearchIdea, ScientificHypothesis } from '../types';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { SparklesIcon } from './icons/SparklesIcon';
import { LoadingSpinner } from './LoadingSpinner';

interface InnovationEngineProps {
    result: InnovationResult | null;
    isLoading: boolean;
    onGenerate: () => void;
    paperCount: number;
}

export const InnovationEngine: React.FC<InnovationEngineProps> = ({ result, isLoading, onGenerate, paperCount }) => {
    if (paperCount === 0) {
        return (
            <div className="p-8 text-center bg-muted/30 rounded-xl border border-dashed border-border">
                <LightbulbIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-foreground">Innovation Engine</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto mt-2">
                    Add papers to your workspace to generate breakthrough research ideas and hypotheses.
                </p>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="py-12">
                <LoadingSpinner message="Synthesizing knowledge and generating breakthrough ideas..." />
            </div>
        );
    }

    if (!result) {
        return (
            <div className="p-8 text-center bg-primary/5 rounded-xl border border-primary/20">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <SparklesIcon className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-lg font-bold text-foreground">AI Research Copilot</h3>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2 mb-6">
                    Ready to analyze {paperCount} papers in your workspace to discover unexplored opportunities and knowledge gaps.
                </p>
                <button
                    onClick={onGenerate}
                    className="px-6 py-2.5 bg-primary text-primary-foreground rounded-full font-bold uppercase tracking-widest text-[11px] hover:shadow-lg transition-all"
                >
                    Generate Innovation Insights
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
                    <LightbulbIcon className="w-6 h-6 text-yellow-500" />
                    Innovation Engine
                </h2>
                <button
                    onClick={onGenerate}
                    className="text-[10px] font-black uppercase tracking-widest text-primary hover:underline"
                >
                    Regenerate
                </button>
            </div>

            {/* Research Ideas */}
            <section>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-yellow-500 rounded-full" />
                    1. AI Research Idea Generator
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    {result.ideas.map((idea, idx) => (
                        <div key={idx} className="p-5 bg-card border border-border rounded-xl hover:shadow-md transition-all group">
                            <h4 className="font-bold text-foreground mb-2 group-hover:text-primary transition-colors">{idea.title}</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{idea.description}</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="p-2 bg-muted/50 rounded-lg">
                                    <span className="block text-[9px] font-black uppercase text-muted-foreground mb-1">Novelty</span>
                                    <span className="text-[10px] font-bold text-foreground">{idea.novelty}</span>
                                </div>
                                <div className="p-2 bg-muted/50 rounded-lg">
                                    <span className="block text-[9px] font-black uppercase text-muted-foreground mb-1">Impact</span>
                                    <span className="text-[10px] font-bold text-foreground">{idea.potentialImpact}</span>
                                </div>
                                <div className="p-2 bg-muted/50 rounded-lg">
                                    <span className="block text-[9px] font-black uppercase text-muted-foreground mb-1">Feasibility</span>
                                    <span className="text-[10px] font-bold text-foreground">{idea.feasibility}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Hypotheses */}
            <section>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-blue-500 rounded-full" />
                    2. Scientific Hypothesis & Question Formation
                </h3>
                <div className="space-y-4">
                    {result.hypotheses.map((hyp, idx) => (
                        <div key={idx} className="p-5 bg-blue-50/30 border border-blue-100 rounded-xl">
                            <div className="flex items-start gap-3 mb-4">
                                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-black text-blue-600">H{idx + 1}</span>
                                </div>
                                <p className="font-bold text-slate-900 leading-tight">{hyp.hypothesis}</p>
                            </div>
                            <div className="space-y-3 pl-11">
                                <div>
                                    <span className="text-[10px] font-black uppercase text-blue-600/60 block mb-1">Rationale</span>
                                    <p className="text-xs text-slate-600 leading-relaxed">{hyp.rationale}</p>
                                </div>
                                <div>
                                    <span className="text-[10px] font-black uppercase text-blue-600/60 block mb-1">Proposed Experiment</span>
                                    <p className="text-xs text-slate-600 leading-relaxed italic">"{hyp.proposedExperiment}"</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Interdisciplinary Connections */}
            <section>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-muted-foreground mb-4 flex items-center gap-2">
                    <div className="w-1 h-4 bg-purple-500 rounded-full" />
                    3. Cross-Disciplinary Innovation Engine
                </h3>
                <div className="grid grid-cols-1 gap-4">
                    {result.interdisciplinaryConnections.map((conn, idx) => (
                        <div key={idx} className="p-5 bg-purple-50/30 border border-purple-100 rounded-xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10">
                                <SparklesIcon className="w-12 h-12 text-purple-600" />
                            </div>
                            <div className="flex flex-wrap gap-2 mb-3">
                                {conn.domains.map((domain, dIdx) => (
                                    <span key={dIdx} className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[9px] font-black uppercase rounded-full">
                                        {domain}
                                    </span>
                                ))}
                            </div>
                            <h4 className="text-sm font-bold text-slate-900 mb-2">{conn.connection}</h4>
                            <p className="text-xs text-slate-600 leading-relaxed">{conn.potential}</p>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};
