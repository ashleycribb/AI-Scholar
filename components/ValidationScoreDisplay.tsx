
import React from 'react';
import type { ValidationResult } from '../types';
import { CheckIcon } from './icons/CheckIcon';
import { CrossIcon } from './icons/CrossIcon';

const CheckItem: React.FC<{ label: string; passed: boolean; }> = ({ label, passed }) => (
    <div className={`flex items-center gap-2 text-sm ${passed ? 'text-foreground' : 'text-muted-foreground'}`}>
        {passed ? <CheckIcon className="w-4 h-4 text-green-600" /> : <CrossIcon className="w-4 h-4 text-destructive" />}
        <span>{label}</span>
    </div>
);

export const ValidationScoreDisplay: React.FC<{ validation: ValidationResult }> = ({ validation }) => {
    const { score, checks, log } = validation;
    
    let scoreColor = 'text-destructive';
    if (score >= 80) scoreColor = 'text-green-600';
    else if (score >= 50) scoreColor = 'text-yellow-600';

    return (
        <div className="bg-muted/50 p-4 rounded-lg border">
            <h4 className="text-base font-semibold text-foreground mb-3">Paper Validation Score</h4>
            <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 flex-shrink-0">
                    <svg className="w-full h-full" viewBox="0 0 36 36">
                        <path className="text-border" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" />
                        <path className={`${scoreColor} transition-all duration-500`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray={`${score}, 100`} strokeLinecap="round" />
                    </svg>
                    <div className={`absolute inset-0 flex items-center justify-center text-2xl font-bold ${scoreColor}`}>
                        {score}
                    </div>
                </div>
                <div className="space-y-2">
                    <CheckItem label="Crossref Match" passed={checks.crossref_match} />
                    <CheckItem label="Title Consistency" passed={checks.title_match} />
                    <CheckItem label="Author Match" passed={checks.author_match} />
                    <CheckItem label="Indexed in DOAJ" passed={checks.doaj_indexed} />
                    <CheckItem label="Open Access Found" passed={checks.open_access} />
                    <CheckItem label="High-Quality Source" passed={checks.source_enriched} />
                </div>
            </div>
            {log && log.length > 0 && (
                 <details className="mt-3">
                    <summary className="text-xs font-medium text-muted-foreground cursor-pointer hover:underline">Show Validation Log</summary>
                    <pre className="mt-2 p-2 bg-background border rounded-md text-xs max-h-32 overflow-auto font-mono">{log.join('\n')}</pre>
                </details>
            )}
        </div>
    );
};