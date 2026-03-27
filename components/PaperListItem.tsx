import React, { useState, useRef } from 'react';
import type { ResearchPaper, Project, RagStatus } from '../types';
import { useOutsideClick } from '../src/hooks/useOutsideClick';
import { colorClassMap } from './ProjectConfig';
import { RagStatusIndicator } from './RagStatusIndicator';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { InboxIcon } from './icons/InboxIcon';
import { FolderIcon } from './icons/FolderIcon';
import { RemoveIcon } from './icons/RemoveIcon';

export const PaperListItem: React.FC<{
    paper: ResearchPaper;
    allProjects: Project[];
    currentProjectId: string | null;
    onMove: (paperId: string, targetProjectId: string | null) => void;
    onRemove: (paper: ResearchPaper) => void;
    ragStatus: RagStatus;
    onIndex: () => void;
}> = ({ paper, allProjects, currentProjectId, onMove, onRemove, ragStatus, onIndex }) => {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);
    useOutsideClick(menuRef, () => setIsMenuOpen(false));

    const handleMove = (targetProjectId: string | null) => {
        onMove(paper.id, targetProjectId);
        setIsMenuOpen(false);
    };

    const project = currentProjectId ? allProjects.find(p => p.id === currentProjectId) : null;
    const dotColorClass = project ? (colorClassMap[project.color]?.bg || 'bg-primary') : 'bg-slate-400';

    return (
        <div className="flex items-center justify-between p-2 rounded-md hover:bg-background group transition-colors duration-150">
            <div className="flex items-center gap-2.5 flex-grow min-w-0 pr-2">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColorClass}`}></span>
                <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors duration-150 truncate" title={paper.title}>{paper.title}</p>
            </div>
            <div className="flex items-center gap-2">
                 {currentProjectId && RagStatusIndicator({ status: ragStatus }).button(onIndex)}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={() => setIsMenuOpen(prev => !prev)}
                        className="p-1.5 rounded-full text-muted-foreground hover:bg-accent opacity-50 group-hover:opacity-100 transition-opacity"
                        title="More options"
                    >
                        <DotsVerticalIcon className="w-4 h-4" />
                    </button>
                    {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-48 bg-card border rounded-md shadow-lg z-20 p-1">
                            <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Move to...</div>
                            {currentProjectId !== null && (
                                <button onClick={() => handleMove(null)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted rounded-sm flex items-center gap-2">
                                    <InboxIcon className="w-4 h-4" /> Unsorted
                                </button>
                            )}
                            {allProjects.filter(p => p.id !== currentProjectId).map(p => (
                                <button key={p.id} onClick={() => handleMove(p.id)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted rounded-sm flex items-center gap-2">
                                    <FolderIcon className={`w-4 h-4 ${colorClassMap[p.color]?.text || 'text-primary'}`} /> {p.name}
                                </button>
                            ))}
                             <div className="my-1 h-px bg-border" />
                             <button onClick={() => onRemove(paper)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-destructive/10 text-destructive rounded-sm flex items-center gap-2">
                                <RemoveIcon className="w-4 h-4" /> Remove from Workspace
                             </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
