import React, { useState, useMemo } from 'react';
import type { Project, ResearchPaper, ModelDefinition, ChatMessage } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { AddIcon } from './icons/AddIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { ReportIcon } from './icons/ReportIcon';
import { SynthesisIcon } from './icons/SynthesisIcon';
import { InboxIcon } from './icons/InboxIcon';
import { colorClassMap } from './ProjectConfig';
import { PaperListItem } from './PaperListItem';
import { ColorPickerTrigger } from './ColorPickerTrigger';
import { CollapsibleSection } from './CollapsibleSection';

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
    onIndexPaperForRag: (projectId: string, paperId: string) => void;
    projectChats: { [projectId: string]: { history: ChatMessage[], isLoading: boolean } };
    onProjectChat: (projectId: string, message: string) => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = (props) => {
    const { workspacePapers, projects, onCreateProject, onSynthesizeWorkspace, onAnalyzeGaps, onRemovePaperFromWorkspace, onUpdateProjectColor, model, onIndexPaperForRag, projectChats, onProjectChat } = props;
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
                        project={project}
                        chatHistory={projectChats[project.id]?.history}
                        isChatLoading={projectChats[project.id]?.isLoading}
                        onChat={(message) => onProjectChat(project.id, message)}
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
                                ragStatus={project.paperStatuses?.[paper.id] || 'unindexed'}
                                onIndex={() => onIndexPaperForRag(project.id, paper.id)}
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
                           ragStatus="unindexed"
                           onIndex={() => {}} // No indexing in unsorted
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
