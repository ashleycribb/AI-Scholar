
import React, { useState, useEffect } from 'react';
import type { ResearchPaper, AnalysisResult, Project, SearchSourceInfo, ModelDefinition, ChatMessage, AuthorProfile, SynthesisResult, CitationStyle, UserSettings } from '../types';
import * as apiService from '../services/apiService';
import { PaperDetails } from './PaperDetails';
import { SearchResultsAnalysis } from './SearchResultsAnalysis';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { SearchIcon } from './icons/SearchIcon';
import { BibliographyGenerator } from './BibliographyGenerator';
import { ProjectWorkspace } from './ProjectWorkspace';
import { WorkspaceAnalysisDashboard } from './WorkspaceAnalysisDashboard';
import { PaperAnalysisDashboard } from './PaperAnalysisDashboard';
import { LocalLibraryPanel } from './LocalLibraryPanel';
import { LocalNanobotPanel } from './LocalNanobotPanel';
import { Library } from 'lucide-react';
import { InnovationEngine } from './InnovationEngine';
import type { InnovationResult } from '../types';
import { GnoPanel } from './GnoPanel';


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
    onCitePaper: (paper: ResearchPaper, style?: CitationStyle) => void;
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
    onAnalyzeWorkspace: (papers: ResearchPaper[], model: ModelDefinition) => void;
    onCreateProject: (name: string) => void;
    onDeleteProject: (projectId: string) => void;
    onMovePaperToProject: (paperId: string, projectId: string | null) => void;
    onUpdateProjectColor: (projectId: string, color: string) => void;
    model: ModelDefinition;
    onIndexPaperForRag: (projectId: string, paperId: string) => void;
    isSummaryLoading: boolean; 
    isAnalysisLoading: boolean;
    onFindJournals: (paper: ResearchPaper) => void;
    isFindingJournals: boolean;
    onAuthorClick: (author: AuthorProfile) => void;
    onFindSimilar: (paper: ResearchPaper) => void;
    isFindingSimilar: boolean;
    userSettings: UserSettings;

    // Workspace Analysis Dashboard Props
    showWorkspaceAnalysisDrawer: boolean;
    onCloseWorkspaceAnalysisDrawer: () => void;
    workspaceAnalysisResult: AnalysisResult | null;
    workspaceSynthesisSummary: SynthesisResult | null;
    workspaceGapAnalysisReport: string | null;
    isWorkspaceAnalysisLoading: boolean;
    isWorkspaceSynthesisLoading: boolean;
    isWorkspaceGapAnalysisLoading: boolean;
    
    // Workspace Chat Props
    workspaceChatHistory: ChatMessage[];
    isWorkspaceChatLoading: boolean;
    onWorkspaceChat: (message: string) => void;
    onGenerateLaymanSummary?: (paper: ResearchPaper) => void;
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
        papers = [], selectedPaper, analysis, summary, workspacePapers = [], projects = [],
        refinedQueries = [], isGeneratingRefined, onRefinedQuerySearch, model, isSummaryLoading,
        isAnalysisLoading,
        isFindingSimilar,
        onAnalyzeWorkspace,
        isWorkspaceAnalysisLoading, isWorkspaceSynthesisLoading, isWorkspaceGapAnalysisLoading,
        workspaceChatHistory = [], isWorkspaceChatLoading, onWorkspaceChat,
        showWorkspaceAnalysisDrawer, onCloseWorkspaceAnalysisDrawer,
        workspaceAnalysisResult, workspaceSynthesisSummary, workspaceGapAnalysisReport,
        userSettings,
        onSynthesizeWorkspace, onAnalyzeGaps
    } = props;
    const [activeTab, setActiveTab] = useState<'details' | 'analysis' | 'workspace' | 'library' | 'bibliography' | 'innovation' | 'gno' | 'logician'>('analysis');
    const [showPaperAnalysisDrawer, setShowPaperAnalysisDrawer] = useState(false);

    // Innovation Engine State
    const [innovationResult, setInnovationResult] = useState<InnovationResult | null>(null);
    const [isInnovationLoading, setIsInnovationLoading] = useState(false);

    useEffect(() => {
        if (selectedPaper) {
            setActiveTab('details');
        } else if (analysis || refinedQueries.length > 0 || isGeneratingRefined || isSummaryLoading || isAnalysisLoading) {
            setActiveTab('analysis');
        } else {
            setActiveTab('workspace');
        }
    }, [selectedPaper, analysis, refinedQueries, isGeneratingRefined, isSummaryLoading, isAnalysisLoading, workspacePapers.length]);

    const handleGenerateInnovation = async () => {
        if (workspacePapers.length === 0) return;
        setIsInnovationLoading(true);
        try {
            const result = await apiService.generateInnovationInsights(workspacePapers, model);
            setInnovationResult(result);
        } catch (e) {
            console.error("Innovation generation failed", e);
        } finally {
            setIsInnovationLoading(false);
        }
    };

    const handleOpenPaperAnalysis = (paper: ResearchPaper) => {
        setShowPaperAnalysisDrawer(true);
    };

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
                        onCitePaper={props.onCitePaper}
                        onAuthorClick={props.onAuthorClick}
                        model={model}
                        onOpenAnalysis={handleOpenPaperAnalysis}
                        onFindSimilar={props.onFindSimilar}
                        isFindingSimilar={props.isFindingSimilar}
                        userSettings={userSettings}
                        onGenerateLaymanSummary={props.onGenerateLaymanSummary}
                    />
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to view its details and tools here.</p>
                    </div>
                );
            case 'analysis':
                return (analysis || refinedQueries.length > 0 || isGeneratingRefined || isSummaryLoading || isAnalysisLoading) ? (
                    <div className="space-y-6">
                        <RefinedQueries
                            queries={refinedQueries}
                            isLoading={isGeneratingRefined}
                            onQueryClick={onRefinedQuerySearch}
                        />
                        {(analysis || isSummaryLoading || isAnalysisLoading) && (
                            <SearchResultsAnalysis 
                                analysis={analysis} 
                                summary={summary} 
                                isSummaryLoading={isSummaryLoading} 
                                isAnalysisLoading={isAnalysisLoading}
                                papers={papers} 
                            />
                        )}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Search Analysis</h2>
                        <p>Insights about your search results will appear here once a search is complete.</p>
                    </div>
                );
            case 'bibliography':
                return <BibliographyGenerator papers={papers} model={model} />;
            case 'library':
                return <LocalLibraryPanel userSettings={userSettings} onUpdateSettings={() => {}} />;
            case 'logician':
                return <LocalNanobotPanel />;
            case 'gno':
                return <GnoPanel userSettings={userSettings} />;
            case 'innovation':
                return (
                    <InnovationEngine
                        result={innovationResult}
                        isLoading={isInnovationLoading}
                        onGenerate={handleGenerateInnovation}
                        paperCount={workspacePapers.length}
                    />
                );
            case 'workspace':
                return (
                    <ProjectWorkspace
                        workspacePapers={workspacePapers}
                        projects={projects}
                        onCreateProject={props.onCreateProject}
                        onDeleteProject={props.onDeleteProject}
                        onMovePaperToProject={props.onMovePaperToProject}
                        onAnalyzeWorkspace={onAnalyzeWorkspace}
                        onRemovePaperFromWorkspace={props.onToggleWorkspacePaper}
                        onUpdateProjectColor={props.onUpdateProjectColor}
                        model={model}
                        onIndexPaperForRag={props.onIndexPaperForRag}
                        isWorkspaceAnalysisLoading={isWorkspaceAnalysisLoading}
                        onAddPapersToWorkspace={() => {}} 
                    />
                 )
            default:
                return null;
        }
    };

    return (
        <div className="bg-card rounded-lg shadow-sm border sticky top-24">
            <div className="border-b border-border p-1 flex justify-between items-center overflow-x-auto">
                <nav className="flex space-x-1 bg-muted p-1 rounded-md min-w-max" aria-label="Tabs">
                    <TabButton onClick={() => setActiveTab('details')} isActive={activeTab === 'details'} disabled={!selectedPaper}>
                        Details
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('analysis')} isActive={activeTab === 'analysis'}>
                        Analysis
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('workspace')} isActive={activeTab === 'workspace'}>
                       Workspace
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('innovation')} isActive={activeTab === 'innovation'}>
                       Innovation
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('library')} isActive={activeTab === 'library'}>
                       Local Library
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('gno')} isActive={activeTab === 'gno'}>
                       Local GNO
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('logician')} isActive={activeTab === 'logician'}>
                       Logician
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('bibliography')} isActive={activeTab === 'bibliography'} disabled={papers.length === 0}>
                        Cite All
                    </TabButton>
                </nav>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
                {renderContent()}
            </div>

            <WorkspaceAnalysisDashboard
                isOpen={showWorkspaceAnalysisDrawer}
                onClose={onCloseWorkspaceAnalysisDrawer}
                workspacePapers={workspacePapers}
                analysisResult={workspaceAnalysisResult}
                synthesisResult={workspaceSynthesisSummary}
                gapAnalysisReport={workspaceGapAnalysisReport}
                isAnalysisLoading={isWorkspaceAnalysisLoading}
                isSynthesisLoading={isWorkspaceSynthesisLoading}
                isGapAnalysisLoading={isWorkspaceGapAnalysisLoading}
                chatHistory={workspaceChatHistory}
                isChatLoading={isWorkspaceChatLoading}
                onChat={onWorkspaceChat}
                onSynthesizeWorkspace={() => onSynthesizeWorkspace(workspacePapers, model)}
                onAnalyzeGaps={() => onAnalyzeGaps(workspacePapers, model)}
            />

            {selectedPaper && (
                <PaperAnalysisDashboard
                    isOpen={showPaperAnalysisDrawer}
                    onClose={() => setShowPaperAnalysisDrawer(false)}
                    paper={selectedPaper}
                    model={model}
                    onAnalyzePaper={props.onAnalyzePaper}
                    isAnalyzingPaper={props.isAnalyzingPaper}
                    onVerifyPaper={props.onVerifyPaper}
                    onGenerateSuggestions={props.onGenerateSuggestions}
                    isGeneratingSuggestions={props.isGeneratingSuggestions}
                    onFindJournals={props.onFindJournals}
                    isFindingJournals={props.isFindingJournals}
                    onFindSimilar={props.onFindSimilar}
                    isFindingSimilar={isFindingSimilar}
                    onFindConnectedPapers={props.onFindConnectedPapers}
                    isFindingConnected={props.isFindingConnected}
                    logAnalyticsEvent={props.logAnalyticsEvent}
                />
            )}
        </div>
    );
};
