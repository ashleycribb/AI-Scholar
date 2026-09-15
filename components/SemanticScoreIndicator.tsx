
import React from 'react';
import { SparklesIcon } from './icons/SparklesIcon';

interface SemanticScoreIndicatorProps {
    score: number | undefined;
}

export const SemanticScoreIndicator: React.FC<SemanticScoreIndicatorProps> = ({ score }) => {
    // If score is strictly undefined, it means the background scoring process hasn't returned yet.
    if (score === undefined) {
        return (
            <div className="flex items-center gap-2 mt-3 animate-pulse">
                <div className="w-4 h-4 bg-slate-200 rounded-full" />
                <div className="h-2 w-24 bg-slate-100 rounded-full" />
                <span className="text-[10px] text-slate-400 font-medium">Analyzing...</span>
            </div>
        );
    }

    let barColorClass = 'bg-slate-300';
    let textColorClass = 'text-slate-500';
    let label = 'Neutral';

    if (score >= 80) {
        barColorClass = 'bg-indigo-600';
        textColorClass = 'text-indigo-700';
        label = 'High Match';
    } else if (score >= 60) {
        barColorClass = 'bg-indigo-500';
        textColorClass = 'text-indigo-600';
        label = 'Relevant';
    } else if (score >= 40) {
        barColorClass = 'bg-blue-400';
        textColorClass = 'text-blue-600';
        label = 'Possible Match';
    } else if (score > 10) {
        barColorClass = 'bg-slate-400';
        textColorClass = 'text-slate-600';
        label = 'Low Match';
    } else {
        barColorClass = 'bg-slate-200';
        textColorClass = 'text-slate-400';
        label = 'Low Relevance';
    }

    return (
        <div className="flex flex-col gap-2" title="AI Relevance Score based on semantic analysis of the abstract">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                    <SparklesIcon className={`w-3.5 h-3.5 ${textColorClass}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${textColorClass}`}>
                        AI {label}
                    </span>
                </div>
                <span className={`font-mono text-[10px] font-bold ${textColorClass}`}>
                    {score}%
                </span>
            </div>
            <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div 
                    className={`h-full ${barColorClass} transition-all duration-1000 ease-out`} 
                    style={{ 
                        width: `${Math.max(score, 5)}%`,
                    }}
                ></div>
            </div>
        </div>
    );
};
