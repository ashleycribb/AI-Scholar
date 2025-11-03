
import React from 'react';
import { FilterIcon } from './icons/FilterIcon';

interface ScreeningFitIndicatorProps {
    score: number | undefined;
    rationale: string | undefined;
}

export const ScreeningFitIndicator: React.FC<ScreeningFitIndicatorProps> = ({ score, rationale }) => {
    if (score === undefined) return null;

    let textColor = 'text-slate-600';
    if (score >= 75) textColor = 'text-blue-600';
    else if (score >= 50) textColor = 'text-amber-600';
    else if (score > 0) textColor = 'text-red-600';

    const title = `Screening Fit: ${score}/100\nRationale: ${rationale || 'N/A'}`;

    return (
        <div className="flex items-center gap-1.5" title={title}>
            <FilterIcon className={`w-3.5 h-3.5 ${textColor}`} />
            <span className={`text-xs font-semibold ${textColor}`}>{score}</span>
        </div>
    );
};