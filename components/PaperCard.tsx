

import React from 'react';
import type { ResearchPaper } from '../types';
import { ScreeningFitIndicator } from './ScreeningFitIndicator';
import { VacsScoreBadge, SimpleValidationBadge } from './VacsScoreBadge';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';
import { CheckIcon } from './icons/CheckIcon';
import { CrossIcon } from './icons/CrossIcon';
import { TagIcon } from './icons/TagIcon';
import { ArxivIcon } from './icons/ArxivIcon';
import { PdfIcon } from './icons/PdfIcon';
import { OpenAccessIcon } from './icons/OpenAccessIcon';

interface PaperCardProps {
    paper: ResearchPaper;
    isSelected: boolean;
    onSelect: () => void;
    isScreeningMode: boolean;
    onScreenPaper: (paperId: string, status: 'include' | 'exclude' | 'none') => void;
}

const ScreeningActions: React.FC<{ paper: ResearchPaper; onScreenPaper: PaperCardProps['onScreenPaper'] }> = ({ paper, onScreenPaper }) => {
    const status = paper.screeningStatus || 'none';

    const handleIncludeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onScreenPaper(paper.id, status === 'include' ? 'none' : 'include');
    };

    const handleExcludeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onScreenPaper(paper.id, status === 'exclude' ? 'none' : 'exclude');
    };

    const includeClasses = status === 'include'
        ? 'bg-green-600 text-white hover:bg-green-700'
        : 'bg-green-100 text-green-800 hover:bg-green-200';
    
    const excludeClasses = status === 'exclude'
        ? 'bg-red-600 text-white hover:bg-red-700'
        : 'bg-red-100 text-red-800 hover:bg-red-200';

    return (
        <div className="flex gap-2">
            <button
                onClick={handleIncludeClick}
                className={`flex items-center gap-1 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${includeClasses}`}
                title={status === 'include' ? "Clear screening status" : "Include this paper"}
                aria-label={status === 'include' ? "Remove inclusion for this paper" : "Include this paper"}
            >
                <CheckIcon className="w-4 h-4" aria-hidden="true" /> {status === 'include' ? 'Included' : 'Include'}
            </button>
            <button
                onClick={handleExcludeClick}
                className={`flex items-center gap-1 px-3 h-8 text-xs font-semibold rounded-md transition-colors ${excludeClasses}`}
                title={status === 'exclude' ? "Clear screening status" : "Exclude this paper"}
                aria-label={status === 'exclude' ? "Remove exclusion for this paper" : "Exclude this paper"}
            >
                <CrossIcon className="w-4 h-4" aria-hidden="true" /> {status === 'exclude' ? 'Excluded' : 'Exclude'}
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
                    <h3 className="text-base font-bold break-words">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                onSelect();
                            }}
                            className={`text-left hover:underline focus:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded ${isSelected ? 'text-primary' : 'text-card-foreground'}`}
                            aria-expanded={isSelected}
                        >
                            {paper.title}
                        </button>
                    </h3>
                     <div className="flex justify-between items-center mt-1 flex-wrap gap-x-4 gap-y-1">
                        <p className="text-sm text-muted-foreground break-words flex-grow pr-2">{paper.authors} ({paper.year})</p>
                        <div className="flex items-center gap-2">
                             {paper.enrichmentSource === 'arXiv' && (
                                <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground" title="Source: arXiv">
                                    <ArxivIcon className="w-4 h-4" aria-hidden="true" />
                                </div>
                            )}
                            {paper.detectedStudyDesign && (
                                <div className="flex items-center gap-1.5 text-xs font-medium bg-muted text-muted-foreground px-2 py-0.5 rounded-full" title="AI-Detected Study Design">
                                    <TagIcon className="w-3.5 h-3.5" aria-hidden="true" />
                                    <span>{paper.detectedStudyDesign}</span>
                                </div>
                            )}
                            {paper.pdfURL && (
                                <a
                                    href={paper.pdfURL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title="View PDF"
                                    className="flex items-center"
                                    aria-label="View PDF (opens in new tab)"
                                >
                                    <PdfIcon className="w-4 h-4 text-muted-foreground hover:text-primary transition-colors" aria-hidden="true" />
                                </a>
                            )}
                            {paper.validation?.checks.open_access && (
                                <div title="Open Access verified by Unpaywall" className="flex items-center">
                                    <OpenAccessIcon className="w-4 h-4 text-green-600" aria-hidden="true" />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {isScreeningMode && (
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
