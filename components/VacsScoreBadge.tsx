
import React from 'react';
import type { VerificationResult, ValidationResult } from '../types';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { formatVacs, isKnownScore } from '../utils/verificationDisplay';

interface VacsScoreBadgeProps {
    verificationResult?: VerificationResult;
}

export const VacsScoreBadge: React.FC<VacsScoreBadgeProps> = ({ verificationResult }) => {
    if (!verificationResult) return null;

    const { vacs, verdict } = verificationResult;

    const styles = {
        Verified: { bg: 'bg-green-100', text: 'text-green-800' },
        Inconclusive: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
        Questionable: { bg: 'bg-red-100', text: 'text-red-800' },
    };

    const style = styles[verdict] || styles.Inconclusive;
    const vacsLabel = formatVacs(vacs);
    const title = isKnownScore(vacs) ? `VACS: ${vacs}/100 - Verdict: ${verdict}` : `VACS: ${vacsLabel} - Verdict: ${verdict}`;

    return (
        <div 
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.text}`}
            title={title}
        >
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span>{vacsLabel}</span>
        </div>
    );
};


interface SimpleValidationBadgeProps {
    validation?: ValidationResult;
}

export const SimpleValidationBadge: React.FC<SimpleValidationBadgeProps> = ({ validation }) => {
    if (!validation || validation.status !== 'validated') {
        return null;
    }

    const { score } = validation;

    const styles = {
        high: { bg: 'bg-green-100', text: 'text-green-800' },
        medium: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
        low: { bg: 'bg-red-100', text: 'text-red-800' },
    };

    let style = styles.low;
    if (score >= 80) {
        style = styles.high;
    } else if (score >= 50) {
        style = styles.medium;
    }

    const title = `Metadata Validation Score: ${score}/100`;

    return (
        <div 
            className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-bold ${style.bg} ${style.text}`}
            title={title}
        >
            <ShieldCheckIcon className="w-3.5 h-3.5" />
            <span>{score}</span>
        </div>
    );
};