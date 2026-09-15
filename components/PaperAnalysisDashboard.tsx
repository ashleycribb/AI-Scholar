
import React, { useState, useEffect } from 'react';
import type { ResearchPaper, ModelDefinition, ConnectedPaper, AuthorProfile } from '../types';
import { LoadingSpinner } from './LoadingSpinner';
import { ErrorMessage } from './ErrorMessage';
import { NetworkIcon } from './icons/NetworkIcon';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { ChatIcon } from './icons/ChatIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { JournalIcon } from './icons/JournalIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { PaperChat } from './PaperChat';
import { KnowledgeGraphDisplay } from './KnowledgeGraphDisplay';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import * as apiService from '../services/apiService';

interface PaperAnalysisDashboardProps {
    isOpen: boolean;
    onClose: () => void;
    paper: ResearchPaper;
    model: ModelDefinition;
    onAnalyzePaper: (paper: ResearchPaper) => void;
    isAnalyzingPaper: boolean;
    onVerifyPaper: (paper: ResearchPaper) => void;
    onGenerateSuggestions: (paper: ResearchPaper) => void;
    isGeneratingSuggestions: boolean;
    onFindJournals: (paper: ResearchPaper) => void;
    isFindingJournals: boolean;
    onFindSimilar: (paper: ResearchPaper) => void;
    isFindingSimilar: boolean;
    onFindConnectedPapers: (paper: ResearchPaper) => void;
    isFindingConnected: boolean;
    logAnalyticsEvent: (eventName: string, payload: object) => void;
}

const DashboardTab: React.FC<{
    isActive: boolean;
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
}> = ({ isActive, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            isActive
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
        }`}
    >
        {icon}
        {label}
    </button>
);

const ToolCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    actionText: string;
    onAction: () => void;
    isLoading?: boolean;
    disabled?: boolean;
}> = ({ icon, title, description, actionText, onAction, isLoading = false, disabled = false }) => {
    return (
        <div className={`bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between gap-4 ${disabled ? 'opacity-60 grayscale' : ''}`}>
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center">
                    {icon}
                </div>
                <div>
                    <h4 className="font-semibold text-foreground">{title}</h4>
                    <p className="text-sm text-muted-foreground">{description}</p>
                </div>
            </div>
            <button
                onClick={onAction}
                disabled={isLoading || disabled}
                className="h-9 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 flex-shrink-0"
            >
                {isLoading ? 'Loading...' : actionText}
            </button>
        </div>
    );
};

const ConnectionItem: React.FC<{ paper: ConnectedPaper }> = ({ paper }) => (
    <div className="p-3 rounded-md hover:bg-muted/50 transition-colors border border-transparent hover:border-border group">
        <div className="flex justify-between items-start gap-2">
            <h5 className="text-sm font-medium text-foreground leading-tight">{paper.title}</h5>
            {paper.sourceURL && (
                <a 
                    href={paper.sourceURL} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-muted-foreground hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
                    title="View Source"
                >
                    <ScholarIcon className="w-4 h-4" />
                </a>
            )}
        </div>
        <p className="text-xs text-muted-foreground mt-1">{paper.authors} • {paper.year}</p>
        {paper.summary && paper.summary !== 'Abstract not available.' && (
            <p className="text-xs text-muted-foreground mt-2 line-clamp-2 italic">"{paper.summary}"</p>
        )}
    </div>
);

const CollapsibleSection: React.FC<{ title: string; count?: number; children: React.ReactNode; defaultOpen?: boolean }> = ({ title, count, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    return (
        <div className="border border-border rounded-lg overflow-hidden bg-card">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3 bg-muted/30 hover:bg-muted/50 transition-colors"
            >
                <span className="font-semibold text-sm flex items-center gap-2">
                    {title} 
                    {count !== undefined && <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full border border-border">{count}</span>}
                </span>
                <ChevronDownIcon className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && <div className="p-3 border-t border-border">{children}</div>}
        </div>
    );
};

export const PaperAnalysisDashboard: React.FC<PaperAnalysisDashboardProps> = ({
    isOpen,
    onClose,
    paper,
    model,
    onAnalyzePaper,
    isAnalyzingPaper,
    onVerifyPaper,
    onGenerateSuggestions,
    isGeneratingSuggestions,
    onFindJournals,
    isFindingJournals,
    onFindSimilar,
    isFindingSimilar,
    onFindConnectedPapers: propsFindConnected,
    isFindingConnected,
}) => {
    const [activeTab, setActiveTab] = useState<'tools' | 'connections' | 'graph' | 'chat'>('tools');
    const [connectedPapers, setConnectedPapers] = useState<ConnectedPaper[] | null>(null);
    const [isLoadingConnections, setIsLoadingConnections] = useState(false);

    // Reset state when paper changes
    useEffect(() => {
        setConnectedPapers(null);
        setActiveTab('tools');
    }, [paper.id]);

    // Fetch connections logic moved here
    useEffect(() => {
        if (activeTab === 'connections' && !connectedPapers && !isLoadingConnections) {
            setIsLoadingConnections(true);
            apiService.findConnectedPapers(paper, model)
                .then(setConnectedPapers)
                .catch(err => {
                    console.error("Failed to load connections inline:", err);
                })
                .finally(() => setIsLoadingConnections(false));
        }
    }, [activeTab, paper, model, connectedPapers, isLoadingConnections]);

    const renderConnections = () => {
        if (isLoadingConnections) {
            return (
                <div className="py-8">
                    <LoadingSpinner message="Mapping citation network via Semantic Scholar..." />
                </div>
            );
        }

        if (!connectedPapers || connectedPapers.length === 0) {
            return (
                <div className="text-center py-12 text-muted-foreground bg-muted/30 rounded-lg border border-dashed border-border">
                    <NetworkIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No connected papers found.</p>
                </div>
            );
        }

        const citedBy = connectedPapers.filter(p => p.connection === 'Cited by this paper');
        const references = connectedPapers.filter(p => p.connection === 'This paper cites');
        const others = connectedPapers.filter(p => p.connection !== 'Cited by this paper' && p.connection !== 'This paper cites');

        return (
            <div className="space-y-4">
                {citedBy.length > 0 && (
                    <CollapsibleSection title="Cited By" count={citedBy.length} defaultOpen={true}>
                        <div className="space-y-2">
                            {citedBy.map((p, i) => <ConnectionItem key={i} paper={p} />)}
                        </div>
                    </CollapsibleSection>
                )}
                {references.length > 0 && (
                    <CollapsibleSection title="References" count={references.length}>
                        <div className="space-y-2">
                            {references.map((p, i) => <ConnectionItem key={i} paper={p} />)}
                        </div>
                    </CollapsibleSection>
                )}
                {others.length > 0 && (
                    <CollapsibleSection title="Related Papers" count={others.length}>
                        <div className="space-y-2">
                            {others.map((p, i) => <ConnectionItem key={i} paper={p} />)}
                        </div>
                    </CollapsibleSection>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 overflow-hidden"
            aria-labelledby="paper-analysis-title"
            role="dialog"
            aria-modal="true"
        >
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
                aria-hidden="true"
                onClick={onClose}
            ></div>

            <div
                className="fixed inset-y-0 right-0 w-full md:w-3/4 lg:w-2/3 xl:w-1/2 bg-card shadow-2xl flex flex-col transform transition-transform duration-300 ease-in-out"
                style={{ transform: isOpen ? 'translateX(0%)' : 'translateX(100%)' }}
                onClick={(e) => e.stopPropagation()}
            >
                <header className="flex items-center justify-between p-4 border-b border-border flex-shrink-0 bg-card z-10">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                            <AnalyzeIcon className="w-6 h-6" />
                        </div>
                        <div className="overflow-hidden">
                            <h2 id="paper-analysis-title" className="text-xl font-bold text-foreground">
                                Paper Analysis
                            </h2>
                            <p className="text-xs text-muted-foreground font-medium truncate max-w-[300px]">
                                {paper.title}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-muted-foreground hover:bg-accent rounded-full focus:outline-none focus:ring-2 focus:ring-ring"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </header>

                <div className="border-b border-border bg-muted/30 px-4 overflow-x-auto">
                    <nav className="flex space-x-4 min-w-max" aria-label="Tabs">
                        <DashboardTab 
                            isActive={activeTab === 'tools'} 
                            onClick={() => setActiveTab('tools')} 
                            icon={<AnalyzeIcon className="w-4 h-4" />}
                            label="Analysis Tools"
                        />
                        <DashboardTab 
                            isActive={activeTab === 'connections'} 
                            onClick={() => setActiveTab('connections')} 
                            icon={<NetworkIcon className="w-4 h-4" />}
                            label="Connections"
                        />
                        <DashboardTab 
                            isActive={activeTab === 'graph'} 
                            onClick={() => setActiveTab('graph')} 
                            icon={<ShareIcon className="w-4 h-4" />} // Reusing ShareIcon as graph-like icon or generic
                            label="Knowledge Graph"
                        />
                        <DashboardTab 
                            isActive={activeTab === 'chat'} 
                            onClick={() => setActiveTab('chat')} 
                            icon={<ChatIcon className="w-4 h-4" />}
                            label="Paper Chat"
                        />
                    </nav>
                </div>

                <main className="flex-grow overflow-y-auto p-6 bg-background">
                    {activeTab === 'tools' && (
                        <div className="space-y-6 animate-fade-in">
                            <div className="space-y-3">
                                <h3 className="text-base font-bold text-foreground pt-2">Refinement & Insights</h3>
                                <ToolCard
                                    icon={<SearchIcon className="w-5 h-5" />}
                                    title="Find Similar Papers (Pivot Search)"
                                    description="Run a new semantic search based on the content of this abstract."
                                    actionText="Find Similar"
                                    onAction={() => onFindSimilar(paper)}
                                    isLoading={isFindingSimilar}
                                />
                                <ToolCard
                                    icon={<NetworkIcon className="w-5 h-5" />}
                                    title="Find Connected Papers"
                                    description="Discover prior work, derivative research, and contrasting studies."
                                    actionText="Find Connections"
                                    onAction={() => propsFindConnected(paper)}
                                    isLoading={isFindingConnected}
                                />
                                <ToolCard
                                    icon={<AnalyzeIcon className="w-5 h-5" />}
                                    title="Structured Analysis"
                                    description="Extract research question, methodology, key findings, and limitations."
                                    actionText="Analyze Paper"
                                    onAction={() => onAnalyzePaper(paper)}
                                    isLoading={isAnalyzingPaper}
                                />
                                <ToolCard
                                    icon={<ShieldCheckIcon className="w-5 h-5" />}
                                    title="Advanced Verification (VACS)"
                                    description="Verify a claim using the paper's text, citations, and metadata."
                                    actionText="Verify Claim"
                                    onAction={() => onVerifyPaper(paper)}
                                    disabled={!paper.doi}
                                />
                                <ToolCard
                                    icon={<LightbulbIcon className="w-5 h-5" />}
                                    title="Generate Search Ideas"
                                    description="Get AI-powered suggestions for new search queries based on this paper."
                                    actionText="Generate Ideas"
                                    onAction={() => onGenerateSuggestions(paper)}
                                    isLoading={isGeneratingSuggestions}
                                />
                                <ToolCard
                                    icon={<JournalIcon className="w-5 h-5" />}
                                    title="Find Journals"
                                    description="Suggest suitable publication venues based on the abstract."
                                    actionText="Suggest Journals"
                                    onAction={() => onFindJournals(paper)}
                                    isLoading={isFindingJournals}
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'connections' && (
                        <div className="animate-fade-in">
                            <div className="mb-4">
                                <h4 className="font-semibold text-foreground flex items-center gap-2">
                                    <NetworkIcon className="w-5 h-5 text-primary" />
                                    Citation Network
                                </h4>
                                <p className="text-xs text-muted-foreground">Exploring references and citations via Semantic Scholar.</p>
                            </div>
                            {renderConnections()}
                        </div>
                    )}

                    {activeTab === 'graph' && (
                        <div className="animate-fade-in">
                            <KnowledgeGraphDisplay 
                                graph={paper.knowledgeGraph}
                                state={paper.knowledgeGraphState}
                            />
                        </div>
                    )}

                    {activeTab === 'chat' && (
                        <div className="animate-fade-in h-full flex flex-col">
                            <div className="mb-3">
                                <h4 className="font-semibold text-foreground flex items-center gap-2">
                                    <ChatIcon className="w-5 h-5 text-primary" />
                                    Chat with this Paper
                                </h4>
                                <p className="text-xs text-muted-foreground">Ask questions specifically about "{paper.title}".</p>
                            </div>
                            <PaperChat paper={paper} />
                        </div>
                    )}
                </main>
                
                <footer className="flex-shrink-0 p-4 border-t border-border flex justify-end bg-card">
                    <button
                        onClick={onClose}
                        className="h-9 px-6 text-sm font-semibold rounded-md bg-secondary text-secondary-foreground hover:bg-accent"
                    >
                        Close Dashboard
                    </button>
                </footer>
            </div>
        </div>
    );
};

// Reusing ShareIcon as a graph icon placeholder
const ShareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.186 2.25 2.25 0 00-3.933 2.186z" />
    </svg>
);
