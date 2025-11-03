
import React from 'react';
import type { ResearchPaper } from '../types';
import { ScreeningFitIndicator } from './ScreeningFitIndicator';
import { VacsScoreBadge, SimpleValidationBadge } from './VacsScoreBadge';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';

interface PaperCardProps {
    paper: ResearchPaper;
    isSelected: boolean;
    onSelect: () => void;
}

export const PaperCard: React.FC<PaperCardProps> = ({ paper, isSelected, onSelect }) => {

    const containerClasses = `p-4 rounded-md border transition-all duration-200 cursor-pointer ${
        isSelected
        ? 'bg-primary/10 border-primary shadow-md'
        : 'bg-card border-border hover:border-primary/50 hover:shadow-sm'
    }`;

    return (
        <div className={containerClasses} onClick={onSelect}>
            <h3 className={`text-base font-bold break-words ${isSelected ? 'text-primary' : 'text-card-foreground'}`}>
                {paper.title}
            </h3>
            <div className="flex justify-between items-center mt-1 flex-wrap gap-x-4 gap-y-1">
                <p className="text-sm text-muted-foreground break-words flex-grow pr-2">{paper.authors} ({paper.year})</p>
                <div className="flex items-center gap-4 flex-shrink-0">
                    <SemanticScoreIndicator score={paper.semanticScore} />
                    <VacsScoreBadge verificationResult={paper.verificationResult} />
                    <ScreeningFitIndicator score={paper.screeningFitScore} rationale={paper.screeningRationale} />
                    <SimpleValidationBadge validation={paper.validation} />
                </div>
            </div>
        </div>
    );
};