

import React, { useState, useMemo } from 'react';
import type { Project, ResearchPaper } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { AddIcon } from './icons/AddIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { DotsVerticalIcon } from './icons/DotsVerticalIcon';
import { ReportIcon } from './icons/ReportIcon';
import { SynthesisIcon } from './icons/SynthesisIcon';

interface ProjectWorkspaceProps {
    workspacePapers: ResearchPaper[];
    projects: Project[];
    onCreateProject: (name: string) => void;
    onDeleteProject: (projectId: string) => void;
    onMovePaperToProject: (paperId: string, projectId: string | null) => void;
    onSynthesizeWorkspace: (papers: ResearchPaper[]) => void;
    onAnalyzeGaps: (papers: ResearchPaper[]) => void;
}

const ProjectItem: React.FC<{
    project: Project;
    papers: ResearchPaper[];
    allProjects: Project[];
    onDeleteProject: (id: string) => void;
    onMovePaper: (paperId: string, projectId: string | null) => void;
}> = ({ project, papers, allProjects, onDeleteProject, onMovePaper }) => {
    const [isExpanded, setIsExpanded] = useState(true);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);

    const handleMove = (paperId: string, targetProjectId: string | null) => {
        onMovePaper(paperId, targetProjectId);
        setActiveMenu(null);
    };
    
    return (
        <div className="bg-muted/50 border border-border rounded-lg">
            <header 
                className="flex items-center justify-between p-3 cursor-pointer hover:bg-accent/50"
                onClick={() => setIsExpanded(!isExpanded)}
            >
                <div className="flex items-center gap-3">
                    <FolderIcon className="w-5 h-5 text-primary" />
                    <h4 className="font-bold text-foreground">{project.name}</h4>
                    <span className="text-xs font-mono bg-primary/10 text-primary px-2 py-0.5 rounded-full">{papers.length}</span>
                </div>
                 <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button onClick={() => onDeleteProject(project.id)} className="p-1.5 text-destructive/80 hover:bg-destructive/10 rounded-md">
                        <RemoveIcon className="w-5 h-5" />
                    </button>
                </div>
            </header>
            {isExpanded && (
                <div className="border-t border-border p-2 space-y-1">
                    {papers.length > 0 ? papers.map(paper => (
                        <div key={paper.id} className="flex items-center justify-between p-2 rounded-md hover:bg-background group">
                            <p className="text-sm text-muted-foreground flex-grow pr-4 truncate" title={paper.title}>{paper.title}</p>
                            <div className="relative flex-shrink-0">
                                <button
                                    onClick={() => setActiveMenu(activeMenu === paper.id ? null : paper.id)}
                                    className="p-1.5 rounded-full text-muted-foreground hover:bg-accent opacity-50 group-hover:opacity-100"
                                >
                                    <DotsVerticalIcon className="w-4 h-4" />
                                </button>
                                {activeMenu === paper.id && (
                                    <div className="absolute right-0 top-full mt-1 w-48 bg-card border rounded-md shadow-lg z-10 p-1">
                                        <button onClick={() => handleMove(paper.id, null)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted rounded-sm">Move to Unsorted</button>
                                        {allProjects.filter(p => p.id !== project.id).map(p => (
                                            <button key={p.id} onClick={() => handleMove(paper.id, p.id)} className="w-full text-left text-sm px-2 py-1.5 hover:bg-muted rounded-sm">Move to {p.name}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )) : <p className="text-sm text-muted-foreground italic text-center p-4">This project is empty.</p>}
                </div>
            )}
        </div>
    );
};

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = (props) => {
    const { workspacePapers, projects, onCreateProject, onSynthesizeWorkspace, onAnalyzeGaps } = props;
    const [newProjectName, setNewProjectName] = useState('');

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
    
    return (
        <div className="space-y-6">
            <div className="p-4 bg-muted/50 rounded-lg border space-y-3">
              <h3 className="text-lg font-bold text-foreground">Workspace Tools</h3>
              <p className="text-sm text-muted-foreground">Run analysis on all {workspacePapers.length} paper(s) in your workspace.</p>
              <div className="flex gap-2">
                 <button 
                  onClick={() => onSynthesizeWorkspace(workspacePapers)}
                  disabled={workspacePapers.length < 2}
                  title="Synthesize Literature in Workspace"
                  className="h-9 px-4 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2">
                    <SynthesisIcon className="w-4 h-4"/>
                    <span>Synthesize</span>
                </button>
                <button 
                  onClick={() => onAnalyzeGaps(workspacePapers)}
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
                    <ProjectItem
                        key={project.id}
                        project={project}
                        papers={project.paperIds.map(id => paperMap.get(id)).filter((p): p is ResearchPaper => !!p)}
                        allProjects={projects}
                        onDeleteProject={props.onDeleteProject}
                        onMovePaper={props.onMovePaperToProject}
                    />
                ))}
                
                {/* Unsorted Papers Section */}
                <div className="pt-4">
                     <h4 className="font-bold text-foreground mb-2">Unsorted Papers ({unsortedPapers.length})</h4>
                     <div className="p-2 border rounded-lg space-y-1 max-h-80 overflow-y-auto">
                        {unsortedPapers.length > 0 ? unsortedPapers.map(paper => (
                             <div key={paper.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted group">
                                <p className="text-sm text-muted-foreground flex-grow pr-4 truncate" title={paper.title}>{paper.title}</p>
                                <div className="relative flex-shrink-0">
                                    <select
                                        value=""
                                        onChange={(e) => props.onMovePaperToProject(paper.id, e.target.value)}
                                        className="text-xs h-7 pl-2 pr-6 bg-secondary text-secondary-foreground rounded-full appearance-none hover:bg-accent cursor-pointer"
                                        title="Move to project"
                                    >
                                        <option value="" disabled>Move to...</option>
                                        {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        )) : <p className="text-sm text-muted-foreground italic text-center p-4">No unsorted papers.</p>}
                     </div>
                </div>
            </div>
        </div>
    );
};
