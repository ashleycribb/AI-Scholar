
import React, { useState, useRef } from 'react';
import type { Project, ResearchPaper, ModelDefinition } from '../types';
import { FolderIcon } from './icons/FolderIcon';
import { AddIcon } from './icons/AddIcon';
import { PdfIcon } from './icons/PdfIcon';
import { InboxIcon } from './icons/InboxIcon';
import { RemoveIcon } from './icons/RemoveIcon';
import { LoadingSpinner } from './LoadingSpinner';
import * as apiService from '../services/apiService';

interface ProjectWorkspaceProps {
    workspacePapers: ResearchPaper[];
    projects: Project[];
    onCreateProject: (name: string) => void;
    onDeleteProject: (projectId: string) => void;
    onMovePaperToProject: (paperId: string, projectId: string | null) => void;
    onAnalyzeWorkspace: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onRemovePaperFromWorkspace: (paper: ResearchPaper) => void;
    onUpdateProjectColor: (projectId: string, color: string) => void;
    onAddPapersToWorkspace: (papers: ResearchPaper[]) => void;
    model: ModelDefinition;
    onIndexPaperForRag: (projectId: string, paperId: string) => void;
    isWorkspaceAnalysisLoading: boolean;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = (props) => {
    const { workspacePapers, projects, onCreateProject, onDeleteProject, onAnalyzeWorkspace, onAddPapersToWorkspace, isWorkspaceAnalysisLoading, model, onRemovePaperFromWorkspace } = props;
    const [newProjectName, setNewProjectName] = useState('');
    const [isUploading, setIsUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleCreateProject = (e: React.FormEvent) => {
        e.preventDefault();
        if (newProjectName.trim()) {
            onCreateProject(newProjectName.trim());
            setNewProjectName('');
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || file.type !== 'application/pdf') return;

        setIsUploading(true);
        try {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = (reader.result as string).split(',')[1];
                const extractedPaper = await apiService.handlePdfUpload(base64);
                onAddPapersToWorkspace([extractedPaper]);
                setIsUploading(false);
            };
        } catch (error) {
            console.error("Upload failed", error);
            setIsUploading(false);
            alert("Failed to parse PDF.");
        }
    };

    return (
        <div className="space-y-6">
            <div className="bg-primary/5 rounded-lg border border-primary/20 p-5 text-center space-y-4">
                <h3 className="text-xl font-bold text-foreground">Workspace Analysis</h3>
                <button 
                    onClick={() => onAnalyzeWorkspace(workspacePapers, model)}
                    disabled={workspacePapers.length === 0 || isWorkspaceAnalysisLoading}
                    className="w-full h-12 px-6 font-bold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-3 transition-all shadow-md"
                >
                    <span>{isWorkspaceAnalysisLoading ? 'Preparing Dashboard...' : 'Open Analysis Dashboard'}</span>
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                <div className="flex flex-col gap-2">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Actions</h3>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex-grow flex items-center justify-center gap-2 h-10 bg-secondary text-secondary-foreground font-semibold rounded-md hover:bg-accent border border-border"
                        >
                            {isUploading ? <LoadingSpinner message="" /> : <PdfIcon className="w-4 h-4"/>}
                            <span>Upload Research PDF</span>
                        </button>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleFileUpload} 
                            accept=".pdf" 
                            className="hidden" 
                        />
                    </div>
                </div>

                <form onSubmit={handleCreateProject} className="flex items-center gap-2">
                    <input 
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="New project name..."
                        className="w-full h-10 px-3 bg-background border border-input rounded-md focus:ring-2 focus:ring-ring"
                    />
                    <button type="submit" className="h-10 px-4 bg-primary text-primary-foreground font-semibold rounded-md hover:bg-primary/90 disabled:opacity-50" disabled={!newProjectName.trim()}>
                        <AddIcon className="w-4 h-4"/>
                    </button>
                </form>
            </div>
            
            <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Projects</h3>
                <div className="grid grid-cols-1 gap-2">
                    {projects.map(project => (
                        <div key={project.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border border-transparent hover:border-border group">
                            <div className="flex items-center gap-3">
                                <FolderIcon className="w-5 h-5 text-blue-500" />
                                <span className="text-sm font-medium">{project.name}</span>
                            </div>
                            {project.id !== 'default' && (
                                <button onClick={() => onDeleteProject(project.id)} className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Project">
                                    <RemoveIcon className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Saved Papers ({workspacePapers.length})</h3>
                {workspacePapers.length === 0 ? (
                    <div className="text-center py-10 opacity-50 border-t border-dashed">
                        <InboxIcon className="w-8 h-8 mx-auto mb-2" />
                        <p className="text-sm">Papers you save or upload will appear here.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-2">
                        {workspacePapers.map(paper => (
                            <div key={paper.id} className="p-3 bg-white border border-border rounded-lg shadow-sm hover:shadow-md transition-all">
                                <div className="flex justify-between items-start gap-2">
                                    <h4 className="text-sm font-bold text-foreground line-clamp-2">{paper.title}</h4>
                                    <div className="flex items-center gap-1">
                                        <a 
                                            href={paper.sourceURL || (paper.doi ? `https://doi.org/${paper.doi}` : `https://scholar.google.com/scholar?q=${encodeURIComponent(paper.title)}`)}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-muted-foreground hover:text-blue-600 p-1"
                                            title="View Source"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                                        </a>
                                        <button onClick={() => onRemovePaperFromWorkspace(paper)} className="text-muted-foreground hover:text-destructive p-1" title="Remove from Workspace">
                                            <RemoveIcon className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">{paper.authors.substring(0, 50)}{paper.authors.length > 50 ? '...' : ''} ({paper.year})</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
