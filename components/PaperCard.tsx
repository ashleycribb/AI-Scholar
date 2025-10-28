import React, { useState, useRef, useEffect } from 'react';
import type { Project, ResearchPaper } from '../types';
import { AddIcon } from './icons/AddIcon';
import { CheckIcon } from './icons/CheckIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { SemanticScoreIndicator } from './SemanticScoreIndicator';
import { CitationIcon } from './icons/CitationIcon';
import { NetworkIcon } from './icons/NetworkIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { FolderIcon } from './icons/FolderIcon';


interface PaperCardProps {
    paper: ResearchPaper;
    isOrigin: boolean;
    isSelected: boolean;
    onSelectPaper: (paper: ResearchPaper) => void;
    onRemovePaper: (paper: ResearchPaper) => void;
    isInWorkspace: boolean;
    onToggleWorkspace: (paper: ResearchPaper) => void;
    onFindConnectedPapers: (paper: ResearchPaper) => void;
    isFindingConnected: boolean;
    projects: Project[];
    onAddAndAssignToProject: (paper: ResearchPaper, projectId: string) => void;
    semanticScore: number | undefined;
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
    isInWorkspace, onToggleWorkspace, onFindConnectedPapers, isFindingConnected,
    projects, onAddAndAssignToProject, semanticScore
}) => {
    const [isProjectMenuOpen, setIsProjectMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const isHighScoring = (paper.combinedScore ?? 0) >= 75;

    let borderColorClass = 'border-transparent';
    if (isSelected) {
        borderColorClass = 'border-primary';
    } else if (isHighScoring) {
        borderColorClass = 'border-green-500';
    }

    const cardClasses = `p-3 rounded-md transition-all duration-200 border-l-4 group relative cursor-pointer ${
        isSelected
        ? 'bg-accent'
        : 'bg-card hover:bg-accent'
    } ${borderColorClass}`;


    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsProjectMenuOpen(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    const handleWorkspaceClick = (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent onSelectPaper from firing
        onToggleWorkspace(paper);
    };

    const handleRemoveClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onRemovePaper(paper);
    };

    const handleFindConnectedClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onFindConnectedPapers(paper);
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
                            <SemanticScoreIndicator score={semanticScore} />
                            <ValidationIndicator score={paper.validation?.score} />
                            {paper.citations !== undefined && paper.citations > 0 && (
                                <div className="flex items-center gap-1.5 text-sm text-muted-foreground font-medium" title={`${paper.citations.toLocaleString()} citations`}>
                                    <CitationIcon className="w-4 h-4" />
                                    <span>{paper.citations.toLocaleString()}</span>
                                </div>
                            )}
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
            
            <div className="absolute top-2 right-2 flex items-center gap-2 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
                <button
                    onClick={handleFindConnectedClick}
                    disabled={isFindingConnected}
                    className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-all duration-200 focus:opacity-100 bg-secondary text-secondary-foreground hover:bg-primary/10 hover:text-primary disabled:opacity-50 disabled:cursor-wait`}
                    aria-label="Find connected papers"
                    title="Find connected papers"
                >
                    {isFindingConnected ? (
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <NetworkIcon className="w-4 h-4" />
                    )}
                </button>
                
                 <div ref={menuRef} className="relative inline-flex items-center rounded-full bg-secondary text-secondary-foreground shadow-sm">
                    <button
                        onClick={handleWorkspaceClick}
                        className={`flex items-center gap-1.5 h-7 px-2.5 text-xs font-semibold transition-colors ${
                            isInWorkspace 
                            ? 'bg-green-100 text-green-800'
                            : 'hover:bg-primary/10 hover:text-primary'
                        } ${projects.length > 0 ? 'rounded-l-full' : 'rounded-full'}`}
                        aria-label={isInWorkspace ? "Saved in Workspace" : "Save to Workspace"}
                        title={isInWorkspace ? "Saved in Workspace" : "Save to Workspace"}
                    >
                        {isInWorkspace ? <CheckIcon className="w-3.5 h-3.5" /> : <AddIcon className="w-3.5 h-3.5" />}
                        <span>{isInWorkspace ? 'Saved' : 'Save'}</span>
                    </button>
                    {projects.length > 0 && (
                        <>
                            <span className="h-4 w-px bg-border"></span>
                            <button
                                onClick={(e) => { e.stopPropagation(); setIsProjectMenuOpen(prev => !prev); }}
                                className="h-7 w-7 flex items-center justify-center rounded-r-full hover:bg-accent"
                                aria-label="Add to project"
                                title="Add to project"
                            >
                                <ChevronDownIcon className={`w-4 h-4 transition-transform ${isProjectMenuOpen ? 'rotate-180' : ''}`} />
                            </button>
                        </>
                    )}
                    {isProjectMenuOpen && (
                        <div
                            className="absolute right-0 top-full mt-1 w-48 bg-card border rounded-md shadow-lg z-10 p-1"
                        >
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Add to Project</div>
                            {projects.map(project => (
                                <button
                                    key={project.id}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onAddAndAssignToProject(paper, project.id);
                                        setIsProjectMenuOpen(false);
                                    }}
                                    className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted rounded-sm flex items-center gap-2"
                                >
                                    <FolderIcon className="w-4 h-4" />
                                    <span>{project.name}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <button
                    onClick={handleRemoveClick}
                    className="flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-all duration-200 focus:opacity-100 bg-secondary text-secondary-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remove from results"
                    title="Remove from results"
                >
                    <RemoveIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};
