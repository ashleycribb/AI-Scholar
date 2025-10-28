
import React from 'react';

interface SemanticScoreIndicatorProps {
    score: number | undefined;
}

export const SemanticScoreIndicator: React.FC<SemanticScoreIndicatorProps> = ({ score }) => {
    if (score === undefined) return null;

    let barColorClass = 'bg-slate-300';
    if (score >= 75) barColorClass = 'bg-green-500';
    else if (score >= 50) barColorClass = 'bg-yellow-500';
    else if (score > 0) barColorClass = 'bg-red-500';

    return (
        <div className="flex items-center gap-2" title={`Semantic Relevance: ${score}/100`}>
            <div className="w-12 h-1.5 bg-muted rounded-full">
                <div 
                    className={`h-1.5 rounded-full ${barColorClass}`} 
                    style={{ width: `${score}%` }}
                ></div>
            </div>
            <span className="text-xs font-semibold text-muted-foreground w-6 text-right">{score}</span>
        </div>
    );
};
