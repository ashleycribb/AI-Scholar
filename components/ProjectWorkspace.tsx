
import React, { useState, useMemo, useRef, useEffect } from 'react';
import type { Project, ResearchPaper, ModelDefinition } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { AddIcon } from './icons/AddIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { ReportIcon } from './icons/ReportIcon';
import { SynthesisIcon } from './icons/SynthesisIcon';
import { InboxIcon } from './icons/InboxIcon';
import { ChevronDownIcon } from './icons/ChevronDownIcon';

// A map of color names to Tailwind CSS classes. This ensures the full class names are present in the source
// and are not purged by Tailwind's build process.
const colorClassMap: { [key: string]: { bg: string; text: string; border: string } } = {
    sky:    { bg: 'bg-sky-500',    text: 'text-sky-500',    border: 'border-sky-500' },
    green:  { bg: 'bg-green-500',  text: 'text-green-500',  border: 'border-green-500' },
    yellow: { bg: 'bg-yellow-500', text: 'text-yellow-500', border: 'border-yellow-500' },
    red:    { bg: 'bg-red-500',    text: 'text-red-500',    border: 'border-red-500' },
    purple: { bg: 'bg-purple-500', text: 'text-purple-500', border: 'border-purple-500' },
    pink:   { bg: 'bg-pink-500',   text: 'text-pink-500',   border: 'border-pink-500' },
    indigo: { bg: 'bg-indigo-500', text: 'text-indigo-500', border: 'border-indigo-500' },
    teal:   { bg: 'bg-teal-500',   text: 'text-teal-500',   border: 'border-teal-500' },
};
const PROJECT_COLORS = Object.keys(colorClassMap);


interface ProjectWorkspaceProps {
    workspacePapers: ResearchPaper[];
    projects: Project[];
    onCreateProject: (name: string) => void;
    onDeleteProject: (projectId: string) => void;
    onMovePaperToProject: (paperId: string, projectId: string | null) => void;
    onSynthesizeWorkspace: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onAnalyzeGaps: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onRemovePaperFromWorkspace: (paper: ResearchPaper) => void;
    onUpdateProjectColor: (projectId: string, color: string) => void;
    model: ModelDefinition;
}

const useOutsideClick = (ref: React.RefObject<HTMLDivElement>, callback: () => void) => {
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) {
                callback();
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [ref, callback]);
};

const PaperListItem: React.FC<{
    paper: ResearchPaper;
    allProjects: Project[];
    currentProjectId: string | null;
    onMove: (paperId: string, targetProjectId: string | null) => void;
    onRemove: (paper: ResearchPaper) => void;
}> = ({ paper, allProjects, currentProjectId, onMove, onRemove }) => {
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
            <div className="flex items-center gap-1">
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

const ColorPickerTrigger: React.FC<{
    project: Project;
    onUpdateColor: (projectId: string, color: string) => void;
}> = ({ project, onUpdateColor }) => {
    const [isPickerOpen, setIsPickerOpen] = useState(false);
    const pickerRef = useRef<HTMLDivElement>(null);
    useOutsideClick(pickerRef, () => setIsPickerOpen(false));
    
    const colorBgClass = colorClassMap[project.color]?.bg || 'bg-primary';

    return (
        <div className="relative" ref={pickerRef}>
            <button 
                onClick={(e) => { e.stopPropagation(); setIsPickerOpen(p => !p); }}
                className={`w-5 h-5 rounded-full ${colorBgClass} border-2 border-white ring-1 ring-border transition-transform hover:scale-110`}
                title="Change project color"
            />
            {isPickerOpen && (
                <div className="absolute right-0 top-full mt-2 w-40 bg-card p-2 rounded-md shadow-lg border z-20">
                    <div className="grid grid-cols-4 gap-2">
                        {PROJECT_COLORS.map(color => (
                            <button
                                key={color}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onUpdateColor(project.id, color);
                                    setIsPickerOpen(false);
                                }}
                                className={`w-7 h-7 rounded-full ${colorClassMap[color].bg} border-2 transition-all ${project.color === color ? 'border-primary ring-2 ring-ring ring-offset-1' : 'border-card hover:border-border'}`}
                                aria-label={`Select ${color} color`}
                            />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

const CollapsibleSection: React.FC<{
    title: string;
    icon: React.ReactNode;
    count: number;
    children: React.ReactNode;
    actions?: React.ReactNode;
    defaultExpanded?: boolean;
    color?: string;
}> = ({ title, icon, count, children, actions, defaultExpanded = true, color }) => {
    const [isExpanded, setIsExpanded] = useState(defaultExpanded);
    const borderColorClass = color ? (colorClassMap[color]?.border || 'border-border') : 'border-border';

    return (
        <div className={`bg-muted/50 border rounded-lg border-l-4 ${borderColorClass}`}>
            <header 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    {icon}
                    <h4 className="font-bold text-foreground">{title}</h4>
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{count}</span>
                </div>
                <div className="flex items-center gap-2">
                    <div onClick={e => e.stopPropagation()}>{actions}</div>
                    <ChevronDownIcon className={`w-5 h-5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                </div>
            </header>
            {isExpanded && (
                <div className="border-t border-border p-2 space-y-1">
                    {children}
                </div>
            )}
        </div>
    );
};

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = (props) => {
    const { workspacePapers, projects, onCreateProject, onSynthesizeWorkspace, onAnalyzeGaps, onRemovePaperFromWorkspace, onUpdateProjectColor, model } = props;
    const [newProjectName, setNewProjectName] = useState('');
    const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);

    const paperMap = useMemo(() => new Map(workspacePapers.map(p => [p.id, p])), [workspacePapers]);
    const allProjectPaperIds = useMemo(() => new Set(projects.flatMap(p => p.paperIds)), [projects]);
    const unsortedPapers = useMemo(() => workspacePapers.filter(p => !allProjectPaperIds.has(p.id)), [workspacePapers, allProjectPaperIds]);

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectName.trim()) {
            onCreateProject(newProjectName.trim());
            setNewProjectName('');
        }
    };
    
    const confirmDeleteProject = () => {
        if (projectToDelete) {
            props.onDeleteProject(projectToDelete.id);
            setProjectToDelete(null);
        }
    };

    return (
        <div className="space-y-6">
            <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
              <h3 className="text-lg font-bold text-foreground">Workspace Tools</h3>
              <p className="text-sm text-muted-foreground">Run analysis on all {workspacePapers.length} paper(s) in your workspace.</p>
              <div className="flex gap-2">
                 <button 
                  onClick={() => onSynthesizeWorkspace(workspacePapers, model)}
                  disabled={workspacePapers.length < 2}
                  title="Synthesize Literature in Workspace"
                  className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    <SynthesisIcon className="w-4 h-4"/>
                    <span>Synthesize</span>
                </button>
                <button 
                  onClick={() => onAnalyzeGaps(workspacePapers, model)}
                  disabled={workspacePapers.length < 2}
                  title="Find Research Gaps in Workspace"
                   className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    <ReportIcon className="w-4 h-4"/>
                    <span>Analyze Gaps</span>
                </button>
              </div>
            </div>

            <div>
                <h3 className="text-lg font-bold text-foreground mb-3">Projects</h3>
                <form onSubmit={handleCreateProject} className="flex items-center gap-2 mb-6">
                    <input 
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Name your new project..."
                        className="w-full h-10 px-3 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring"
                    />
                    <button type="submit" className="h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2" disabled={!newProjectName.trim()}>
                        <AddIcon className="w-4 h-4"/> Create
                    </button>
                </form>
            </div>

            <div className="space-y-4">
                {projects.sort((a,b) => b.createdAt - a.createdAt).map(project => (
                    <CollapsibleSection
                        key={project.id}
                        title={project.name}
                        icon={<FolderIcon className={`w-5 h-5 ${colorClassMap[project.color]?.text || 'text-primary'}`} />}
                        count={project.paperIds.length}
                        color={project.color}
                        actions={
                            <div className="flex items-center gap-2">
                                <ColorPickerTrigger project={project} onUpdateColor={onUpdateProjectColor} />
                                <button 
                                    onClick={() => setProjectToDelete(project)} 
                                    className="p-1.5 text-destructive/80 hover:bg-destructive/10 rounded-full"
                                    title={`Delete project "${project.name}"`}
                                >
                                    <RemoveIcon className="w-4 h-4" />
                                </button>
                            </div>
                        }
                    >
                        {project.paperIds.length > 0 ? project.paperIds.map(id => paperMap.get(id)).filter((p): p is ResearchPaper => !!p).map(paper => (
                           <PaperListItem
                                key={paper.id}
                                paper={paper}
                                allProjects={projects}
                                currentProjectId={project.id}
                                onMove={props.onMovePaperToProject}
                                onRemove={onRemovePaperFromWorkspace}
                           />
                        )) : <p className="text-sm text-muted-foreground italic text-center p-4">This project is empty.</p>}
                    </CollapsibleSection>
                ))}
                
                <CollapsibleSection
                    title="Unsorted Papers"
                    icon={<InboxIcon className="w-5 h-5 text-primary" />}
                    count={unsortedPapers.length}
                    defaultExpanded={unsortedPapers.length > 0 || projects.length === 0}
                >
                    {unsortedPapers.length > 0 ? unsortedPapers.map(paper => (
                        <PaperListItem
                           key={paper.id}
                           paper={paper}
                           allProjects={projects}
                           currentProjectId={null}
                           onMove={props.onMovePaperToProject}
                           onRemove={onRemovePaperFromWorkspace}
                        />
                    )) : <p className="text-sm text-muted-foreground italic text-center p-4">Add papers to your workspace to see them here.</p>}
                </CollapsibleSection>
            </div>
            
            {projectToDelete && (
                 <div className="fixed inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
                    <div className="bg-card p-6 rounded-lg shadow-lg border max-w-sm w-full">
                        <h4 className="text-lg font-bold text-foreground">Confirm Deletion</h4>
                        <p className="text-sm text-muted-foreground mt-2">
                            Are you sure you want to delete the project "<strong>{projectToDelete.name}</strong>"? 
                            All papers within this project will be moved to "Unsorted". This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2 mt-6">
                            <button onClick={() => setProjectToDelete(null)} className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent">
                                Cancel
                            </button>
                            <button onClick={confirmDeleteProject} className="h-9 px-4 text-sm font-semibold rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                Delete Project
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
