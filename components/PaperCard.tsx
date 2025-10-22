import React from 'react';
import type { ResearchPaper } from '../types';
import { ThumbsDownIcon } from './icons/ThumbsDownIcon';

interface PaperCardProps {
    paper: ResearchPaper;
    isOrigin: boolean;
    isSelected: boolean;
    onSelectPaper: (paper: ResearchPaper) => void;
    onMarkAsIrrelevant: (paper: ResearchPaper) => void;
}

export const PaperCard: React.FC<PaperCardProps> = ({ 
    paper, isOrigin, isSelected, onSelectPaper, onMarkAsIrrelevant
}) => {
    const isIrrelevant = paper.isIrrelevant ?? false;

    const cardClasses = `p-3 rounded-md transition-all duration-200 border-l-4 group relative ${
        isIrrelevant 
        ? 'opacity-60 bg-muted/50 border-border' 
        : isSelected
        ? 'bg-accent border-primary'
        : 'bg-card hover:bg-accent border-transparent cursor-pointer'
    }`;

    const handleIrrelevantClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent onSelectPaper from firing
        onMarkAsIrrelevant(paper);
    };
    
    const abstractSnippet = paper.abstract && paper.abstract.length > 150 
        ? <>{paper.abstract.substring(0, 150)}... <span className="text-primary font-medium">Read more</span></>
        : paper.abstract;

    return (
        <div onClick={() => !isIrrelevant && onSelectPaper(paper)} className={cardClasses}>
             {isOrigin && !isIrrelevant && (
                <p className="text-xs font-bold uppercase text-purple-600 mb-1">
                    Origin Paper
                </p>
            )}
            <h3 className="text-sm font-bold text-card-foreground truncate">{paper.title}</h3>
            <div className="flex justify-between items-center mt-1">
                <p className="text-xs text-muted-foreground truncate flex-grow pr-2">{paper.authors}</p>
                <p className="text-xs text-muted-foreground font-medium flex-shrink-0">{paper.year}</p>
            </div>
            
            {abstractSnippet && (
                <p className="text-xs text-secondary-foreground mt-2 leading-relaxed">
                    {abstractSnippet}
                </p>
            )}
            
            {!isIrrelevant && (
                <button
                    onClick={handleIrrelevantClick}
                    className="absolute top-1/2 right-2 -translate-y-1/2 p-1.5 rounded-full bg-muted text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive focus:opacity-100 transition-opacity"
                    aria-label="Mark as not relevant"
                    title="Not Relevant"
                >
                    <ThumbsDownIcon className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};