


import React from 'react';
import type { ResearchPaper } from '../types';
import { ScreeningFitIndicator } from './ScreeningFitIndicator';
import { VacsScoreBadge, SimpleValidationBadge } from './VacsScoreBadge';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';
import { CheckIcon } from './icons/CheckIcon';
import { CrossIcon } from './icons/CrossIcon';
import { TagIcon } from './icons/TagIcon';

interface PaperCardProps {
    paper: ResearchPaper;
    isSelected: boolean;
    onSelect: () => void;
    isScreeningMode: boolean;
    onScreenPaper: (paperId: string, status: 'include' | 'exclude') => void;
}

const ScreeningActions: React.FC<{ paper: ResearchPaper; onScreenPaper: PaperCardProps['onScreenPaper'] }> = ({ paper, onScreenPaper }) => {
    return (
        <div className="flex gap-2">
            <button
                onClick={(e) => { e.stopPropagation(); onScreenPaper(paper.id, 'include'); }}
                className="flex items-center gap-1 px-3 h-8 text-xs font-semibold rounded-md bg-green-100 text-green-800 hover:bg-green-200"
                title="Include this paper"
            >
                <CheckIcon className="w-4 h-4" /> Include
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); onScreenPaper(paper.id, 'exclude'); }}
                className="flex items-center gap-1 px-3 h-8 text-xs font-semibold rounded-md bg-red-100 text-red-800 hover:bg-red-200"
                title="Exclude this paper"
            >
                <CrossIcon className="w-4 h-4" /> Exclude
            </button>
        </div>
    );
};

export const PaperCard: React.FC<PaperCardProps> = ({ paper, isSelected, onSelect, isScreeningMode, onScreenPaper }) => {

    const screeningStatusClass = isScreeningMode ? {
        include: 'bg-green-50 border-green-300',
        exclude: 'bg-red-50 border-red-300 opacity-60',
        none: 'bg-card border-border',
    }[paper.screeningStatus || 'none'] : 'bg-card border-border';
    
    const containerClasses = `p-4 rounded-md border transition-all duration-200 cursor-pointer ${
        isSelected
        ? 'bg-primary/10 border-primary shadow-md'
        : `${screeningStatusClass} hover:border-primary/50 hover:shadow-sm`
    }`;

    return (
        <div className={containerClasses} onClick={onSelect}>
            <div className="flex justify-between items-start gap-4">
                <div className="flex-grow">
                    <h3 className={`text-base font-bold break-words ${isSelected ? 'text-primary' : 'text-card-foreground'}`}>
                        {paper.title}
                    </h3>
                     <div className="flex justify-between items-center mt-1 flex-wrap gap-x-4 gap-y-1">
                        <p className="text-sm text-muted-foreground break-words flex-grow pr-2">{paper.authors} ({paper.year})</p>
                        {paper.detectedStudyDesign && (
                            <div className="flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full" title="AI-Detected Study Design">
                                <TagIcon className="w-3.5 h-3.5" />
                                <span>{paper.detectedStudyDesign}</span>
                            </div>
                        )}
                    </div>
                </div>
                {isScreeningMode && paper.screeningStatus === 'none' && (
                    <div className="flex-shrink-0">
                        <ScreeningActions paper={paper} onScreenPaper={onScreenPaper} />
                    </div>
                )}
            </div>
           
            <div className="flex items-center gap-4 flex-shrink-0 mt-2 pt-2 border-t border-border/50">
                <SemanticScoreIndicator score={paper.semanticScore} />
                <VacsScoreBadge verificationResult={paper.verificationResult} />
                <ScreeningFitIndicator score={paper.screeningFitScore} rationale={paper.screeningRationale} />
                <SimpleValidationBadge validation={paper.validation} />
            </div>
        </div>
    );
};