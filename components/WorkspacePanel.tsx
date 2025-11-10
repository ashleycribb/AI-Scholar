import React, { useState, useEffect } from 'react';
import type { ResearchPaper, AnalysisResult, Project, SearchSourceInfo, ModelDefinition, RagStatus, ChatMessage } from '../types';
import { PaperDetails } from './PaperDetails';
import { AnalysisDashboard } from './AnalysisDashboard';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { SearchIcon } from './icons/SearchIcon';
import { BibliographyGenerator } from './BibliographyGenerator';
import { ProjectWorkspace } from './ProjectWorkspace';


interface RefinedQueriesProps {
  queries: string[];
  isLoading: boolean;
  onQueryClick: (query: string) => void;
}

const RefinedQueries: React.FC<RefinedQueriesProps> = ({ queries, isLoading, onQueryClick }) => {
  if (isLoading || queries.length === 0) {
    return null;
  }
  
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
        <LightbulbIcon className="w-6 h-6 text-yellow-500" />
        <span>AI-Generated Query Suggestions</span>
      </h3>
        <div className="space-y-3">
            {queries.map((query, index) => (
            <div
                key={index}
                className="p-3 bg-muted/50 border border-border rounded-lg group"
            >
                <p className="text-sm text-muted-foreground font-mono mb-2" style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>{query}</p>
                <button
                onClick={() => onQueryClick(query)}
                className="w-full text-center px-3 h-9 bg-secondary text-secondary-foreground text-xs font-semibold rounded-md hover:bg-accent transition-colors flex items-center justify-center gap-2"
                >
                <SearchIcon className="w-4 h-4" />
                <span>Use this query</span>
                </button>
            </div>
            ))}
        </div>
    </div>
  );
};

interface WorkspacePanelProps {
    papers: ResearchPaper[];
    selectedPaper: ResearchPaper | null;
    analysis: AnalysisResult | null;
    summary: string;
    workspacePapers: ResearchPaper[];
    projects: Project[];
    sources: SearchSourceInfo[];
    onToggleWorkspacePaper: (paper: ResearchPaper) => void;
    onFindConnectedPapers: (paper: ResearchPaper) => void;
    isFindingConnected: boolean;
    onAnalyzePaper: (paper: ResearchPaper) => void;
    onCitePaper: (paper: ResearchPaper) => void;
    isAnalyzingPaper: boolean;
    onConceptClick: (concept: string) => void;
    onFindDoi: (paper: ResearchPaper) => void;
    onGenerateSuggestions: (paper: ResearchPaper) => void;
    isGeneratingSuggestions: boolean;
    onVerifyPaper: (paper: ResearchPaper) => void;
    logAnalyticsEvent: (eventName: string, payload: object) => void;
    refinedQueries: string[];
    isGeneratingRefined: boolean;
    onRefinedQuerySearch: (query: string) => void;
    onAnalyzeGaps: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onSynthesizeWorkspace: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onCreateProject: (name: string) => void;
    onDeleteProject: (projectId: string) => void;
    onMovePaperToProject: (paperId: string, projectId: string | null) => void;
    onUpdateProjectColor: (projectId: string, color: string) => void;
    model: ModelDefinition;
    onIndexPaperForRag: (projectId: string, paperId: string) => void;
    projectChats: { [projectId: string]: { history: ChatMessage[], isLoading: boolean } };
    onProjectChat: (projectId: string, message: string) => void;
}

const TabButton: React.FC<{
    onClick: () => void;
    isActive: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ onClick, isActive, disabled, children }) => {
    const baseClasses = "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
    const activeClasses = "bg-background text-foreground shadow-sm";
    const inactiveClasses = "text-muted-foreground hover:bg-accent/50";
    const disabledClasses = "text-muted-foreground/50 cursor-not-allowed";

    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`${baseClasses} ${disabled ? disabledClasses : (isActive ? activeClasses : inactiveClasses)}`}
        >
            {children}
        </button>
    );
};

export const WorkspacePanel: React.FC<WorkspacePanelProps> = (props) => {
    const { 
        papers, selectedPaper, analysis, summary, workspacePapers, projects,
        refinedQueries, isGeneratingRefined, onRefinedQuerySearch, model
    } = props;
    const [activeTab, setActiveTab] = useState<'details' | 'analysis' | 'workspace' | 'bibliography'>('analysis');

    useEffect(() => {
        if (selectedPaper) {
            setActiveTab('details');
        } else if (analysis || refinedQueries.length > 0 || isGeneratingRefined) {
            setActiveTab('analysis');
        } else {
            setActiveTab('workspace');
        }
    }, [selectedPaper, analysis, refinedQueries, isGeneratingRefined, workspacePapers.length]);

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return selectedPaper ? (
                    <PaperDetails
                        paper={selectedPaper}
                        isInWorkspace={workspacePapers.some(p => p.id === selectedPaper.id)}
                        onToggleWorkspacePaper={props.onToggleWorkspacePaper}
                        onConceptClick={props.onConceptClick}
                        onFindDoi={props.onFindDoi}
                        logAnalyticsEvent={props.logAnalyticsEvent}
                        onFindConnectedPapers={props.onFindConnectedPapers}
                        isFindingConnected={props.isFindingConnected}
                        onAnalyzePaper={props.onAnalyzePaper}
                        isAnalyzingPaper={props.isAnalyzingPaper}
                        onVerifyPaper={props.onVerifyPaper}
                        onGenerateSuggestions={props.onGenerateSuggestions}
                        isGeneratingSuggestions={props.isGeneratingSuggestions}
                        onCitePaper={props.onCitePaper}
                    />
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to view its details and tools here.</p>
                    </div>
                );
            case 'analysis':
                return (analysis || refinedQueries.length > 0 || isGeneratingRefined) ? (
                    <div className="space-y-6">
                        <RefinedQueries
                            queries={refinedQueries}
                            isLoading={isGeneratingRefined}
                            onQueryClick={onRefinedQuerySearch}
                        />
                        {analysis && <AnalysisDashboard analysis={analysis} summary={summary} />}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Search Analysis</h2>
                        <p>Insights about your search results will appear here once a search is complete.</p>
                    </div>
                );
            case 'bibliography':
                return <BibliographyGenerator papers={papers} model={model} />;
            case 'workspace':
                return (
                    <ProjectWorkspace
                        workspacePapers={workspacePapers}
                        projects={projects}
                        onCreateProject={props.onCreateProject}
                        onDeleteProject={props.onDeleteProject}
                        onMovePaperToProject={props.onMovePaperToProject}
                        onSynthesizeWorkspace={props.onSynthesizeWorkspace}
                        onAnalyzeGaps={props.onAnalyzeGaps}
                        onRemovePaperFromWorkspace={props.onToggleWorkspacePaper}
                        onUpdateProjectColor={props.onUpdateProjectColor}
                        model={model}
                        onIndexPaperForRag={props.onIndexPaperForRag}
                        projectChats={props.projectChats}
                        onProjectChat={props.onProjectChat}
                    />
                 )
            default:
                return null;
        }
    };

    return (
        <div className="bg-card rounded-lg shadow-sm border sticky top-24">
            <div className="border-b border-border p-1 flex justify-between items-center">
                <nav className="flex space-x-1 bg-muted p-1 rounded-md" aria-label="Tabs">
                    <TabButton onClick={() => setActiveTab('details')} isActive={activeTab === 'details'} disabled={!selectedPaper}>
                        Paper Details
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('analysis')} isActive={activeTab === 'analysis'}>
                        Search Analysis
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('bibliography')} isActive={activeTab === 'bibliography'} disabled={papers.length === 0}>
                        Bibliography
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('workspace')} isActive={activeTab === 'workspace'}>
                       Workspace
                    </TabButton>
                </nav>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
                {renderContent()}
            </div>
        </div>
    );
};