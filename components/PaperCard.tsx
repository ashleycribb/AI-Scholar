
import React from 'react';
import type { ResearchPaper } from '../types';
import { AddIcon } from './icons/AddIcon';
import { CheckIcon } from './icons/CheckIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';

interface PaperCardProps {
    paper: ResearchPaper;
    isOrigin: boolean;
    isSelected: boolean;
    onSelectPaper: (paper: ResearchPaper) => void;
    onRemovePaper: (paper: ResearchPaper) => void;
    isInWorkspace: boolean;
    onToggleWorkspace: (paper: ResearchPaper) => void;
}

const ValidationIndicator: React.FC<{ score: number | undefined }> = ({ score }) => {
    if (score === undefined) return null;
    let colorClasses = 'bg-slate-300';
    if (score >= 80) colorClasses = 'bg-green-500';
    else if (score >= 50) colorClasses = 'bg-yellow-500';
    else if (score > 0) colorClasses = 'bg-red-500';

    return (
        <div className="flex items-center gap-1.5" title={`Validation Score: ${score}/100`}>
            <div className={`w-2.5 h-2.5 rounded-full ${colorClasses}`}></div>
            <span className="text-xs font-semibold text-muted-foreground">{score}</span>
        </div>
    );
};

export const PaperCard: React.FC<PaperCardProps> = ({ 
    paper, isOrigin, isSelected, onSelectPaper, onRemovePaper,
    isInWorkspace, onToggleWorkspace
}) => {
    const cardClasses = `p-3 rounded-md transition-all duration-200 border-l-4 group relative cursor-pointer ${
        isSelected
        ? 'bg-accent border-primary'
        : 'bg-card hover:bg-accent border-transparent'
    }`;

    const handleWorkspaceClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent onSelectPaper from firing
        onToggleWorkspace(paper);
    };

    const handleRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemovePaper(paper);
    };
    
    const abstractSnippet = paper.abstract && paper.abstract.length > 150 
        ? <>{paper.abstract.substring(0, 150)}... <span className="text-primary font-medium">Read more</span></>
        : paper.abstract;

    return (
        <div className={cardClasses} onClick={() => onSelectPaper(paper)}>
            <div className="flex items-start gap-3">
                 <div className="flex-grow">
                    {isOrigin && (
                        <p className="text-xs font-bold uppercase text-purple-600 mb-1">
                            Origin Paper
                        </p>
                    )}
                    <h3 className="text-base font-bold text-card-foreground break-words">{paper.title}</h3>
                    <div className="flex justify-between items-center mt-1">
                        <p className="text-sm text-muted-foreground break-words flex-grow pr-2">{paper.authors}</p>
                         <div className="flex items-center gap-4 flex-shrink-0">
                            <SemanticScoreIndicator score={paper.semanticScore} />
                            <ValidationIndicator score={paper.validation?.score} />
                            <p className="text-sm text-muted-foreground font-medium">{paper.year}</p>
                        </div>
                    </div>
                    
                    {abstractSnippet && (
                        <p className="text-sm text-secondary-foreground mt-2 leading-relaxed">
                            {abstractSnippet}
                        </p>
                    )}
                </div>
            </div>
            
            <div className="absolute top-2 right-2 flex items-center gap-2">
                <button
                    onClick={handleWorkspaceClick}
                    className={`flex items-center gap-1.5 h-7 px-2.5 rounded-full text-xs font-semibold transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 ${
                        isInWorkspace 
                        ? 'bg-green-100 text-green-800'
                        : 'bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary'
                    }`}
                    aria-label={isInWorkspace ? "Remove from Workspace" : "Add to Workspace"}
                    title={isInWorkspace ? "Remove from Workspace" : "Add to Workspace"}
                >
                    {isInWorkspace ? <CheckIcon className="w-3.5 h-3.5" /> : <AddIcon className="w-3.5 h-3.5" />}
                    <span>{isInWorkspace ? 'Added' : 'Add'}</span>
                </button>
                <button
                    onClick={handleRemoveClick}
                    className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-all duration-200 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-secondary text-secondary-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove from results"
                    title="Remove from results"
                >
                    <RemoveIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};