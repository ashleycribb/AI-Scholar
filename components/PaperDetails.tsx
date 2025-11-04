import React, { useState } from 'react';
import type { ResearchPaper, PaperAnalysis } from '../types';
import { AddIcon } from './icons/AddIcon';
import { PdfIcon } from './icons/PdfIcon';
import { ScholarIcon } from './icons/ScholarIcon';
import { WarningIcon } from './icons/WarningIcon';
import { TagIcon } from './icons/TagIcon';
import { DoiIcon } from './icons/DoiIcon';
import { SearchIcon } from './icons/SearchIcon';
import { ArxivIcon } from './icons/ArxivIcon';
import { CheckIcon } from './icons/CheckIcon';
import { ValidationScoreDisplay } from './ValidationScoreDisplay';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { ShieldCheckIcon } from './icons/ShieldCheckIcon';
import { NetworkIcon } from './icons/NetworkIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { CitationIcon } from './icons/CitationIcon';

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
        <div className="bg-muted/50 border border-border rounded-lg p-4 flex items-center justify-between gap-4">
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


interface PaperDetailsProps {
    paper: ResearchPaper;
    isInWorkspace: boolean;
    onToggleWorkspacePaper: (paper: ResearchPaper) => void;
    onConceptClick: (concept: string) => void;
    onFindDoi: (paper: ResearchPaper) => void;
    logAnalyticsEvent: (eventName: string, payload: object) => void;
    onFindConnectedPapers: (paper: ResearchPaper) => void;
    isFindingConnected: boolean;
    onAnalyzePaper: (paper: ResearchPaper) => void;
    isAnalyzingPaper: boolean;
    onVerifyPaper: (paper: ResearchPaper) => void;
    onGenerateSuggestions: (paper: ResearchPaper) => void;
    isGeneratingSuggestions: boolean;
    onCitePaper: (paper: ResearchPaper) => void;
}

const ShareIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M7.217 10.907a2.25 2.25 0 100 2.186m0-2.186c.18.324.283.696.283 1.093s-.103.77-.283 1.093m0-2.186l9.566-5.314m-9.566 7.5l9.566 5.314m0 0a2.25 2.25 0 103.935 2.186 2.25 2.25 0 00-3.935-2.186zm0-12.814a2.25 2.25 0 103.933-2.186 2.25 2.25 0 00-3.933 2.186z" />
    </svg>
);

const DoiDisplay: React.FC<{ paper: ResearchPaper; onFindDoi: () => void }> = ({ paper, onFindDoi }) => {
    const { doi, doiState } = paper;

    if (doiState === 'loading') {
        return (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <svg className="animate-spin h-4 w-4 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <span>Finding DOI...</span>
            </div>
        );
    }

    if (doiState === 'error') {
        return (
            <div className="flex items-center gap-1 text-xs text-destructive" title="Could not find DOI">
                <WarningIcon className="w-4 h-4" />
                <span>DOI lookup failed</span>
            </div>
        );
    }

    if (doi) {
        return (
            <a href={`https://doi.org/${doi}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                <DoiIcon className="w-4 h-4" />
                <span>{doi}</span>
            </a>
        );
    }
    
    if (paper.validation?.status === 'validated' && !doi) {
        return <span className="text-xs text-muted-foreground italic flex items-center gap-1.5"><DoiIcon className="w-4 h-4" /> Not found</span>;
    }

    return (
        <button onClick={onFindDoi} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <SearchIcon className="w-4 h-4" />
            <span>Find DOI</span>
        </button>
    );
};

const SavedAnalysis: React.FC<{ analysis: PaperAnalysis }> = ({ analysis }) => (
    <div className="bg-muted/50 p-4 rounded-lg border space-y-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
            <AnalyzeIcon className="w-4 h-4 text-muted-foreground" />
            Saved AI Analysis
        </h4>
        <div>
            <h5 className="text-sm font-semibold text-foreground">Research Question</h5>
            <p className="text-sm text-muted-foreground mt-1">{analysis.researchQuestion}</p>
        </div>
        <div>
            <h5 className="text-sm font-semibold text-foreground">Methodology</h5>
            <p className="text-sm text-muted-foreground mt-1">{analysis.methodology}</p>
        </div>
        <div>
            <h5 className="text-sm font-semibold text-foreground">Key Findings</h5>
            <ul className="list-disc list-inside mt-1 text-sm text-muted-foreground space-y-1 pl-2">
                {analysis.keyFindings.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
        </div>
        {analysis.limitations && analysis.limitations.length > 0 && (
             <div>
                <h5 className="text-sm font-semibold text-foreground">Potential Limitations</h5>
                <ul className="list-disc list-inside mt-1 text-sm text-muted-foreground space-y-1 pl-2">
                    {analysis.limitations.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
            </div>
        )}
    </div>
);

const TabButton: React.FC<{
    isActive: boolean;
    onClick: () => void;
    children: React.ReactNode;
}> = ({ isActive, onClick, children }) => {
    return (
        <button
            onClick={onClick}
            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
        >
            {children}
        </button>
    );
};


export const PaperDetails: React.FC<PaperDetailsProps> = (props) => {
    const { paper, isInWorkspace, onToggleWorkspacePaper, onConceptClick, onFindDoi, logAnalyticsEvent } = props;
    const { onFindConnectedPapers, isFindingConnected, onAnalyzePaper, isAnalyzingPaper, onVerifyPaper, onGenerateSuggestions, isGeneratingSuggestions, onCitePaper } = props;
    const [activeTab, setActiveTab] = useState<'overview' | 'analysis' | 'metadata'>('overview');

    const googleScholarSearchUrl = `https://scholar.google.com/scholar?hl=en&as_sdt=0,34&q=${encodeURIComponent(`"${paper.title}"`)}`;
    
    const handleShare = async () => {
        if (!navigator.share) return;
        try {
            await navigator.share({
                title: paper.title,
                text: `Check out this research paper: "${paper.title}"`,
                url: paper.sourceURL || window.location.href,
            });
            logAnalyticsEvent('paper_shared', { title: paper.title });
        } catch (error) {
            console.error('Error sharing paper:', error);
        }
    };
    
    const renderKeyConcepts = () => {
        if (!paper.keyConceptsState || paper.keyConceptsState === 'idle' || paper.keyConceptsState === 'loading') {
            if (paper.abstract.length < 150) return null;
            return (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <span>Extracting concepts...</span>
                </div>
            );
        }
    
        if (paper.keyConceptsState === 'error') {
            return <p className="text-sm text-destructive">Could not extract concepts.</p>;
        }
    
        if (paper.keyConceptsState === 'loaded' && paper.keyConcepts && paper.keyConcepts.length > 0) {
            return (
                <div className="flex flex-wrap gap-2">
                    {paper.keyConcepts.map((concept) => (
                        <button
                            key={concept}
                            onClick={() => onConceptClick(concept)}
                            className="group flex items-center gap-1.5 px-2.5 py-1 bg-secondary text-secondary-foreground text-xs font-medium rounded-full hover:bg-primary/10 hover:text-primary transition-colors"
                            title={`Search for "${concept}"`}
                        >
                            <span>{concept}</span>
                            <SearchIcon className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                    ))}
                </div>
            );
        }
        
        return <p className="text-sm text-muted-foreground italic">No distinct concepts identified.</p>;
    }

    return (
        <div className="flex flex-col h-full space-y-4">
             <div>
                <div className="flex justify-between items-start gap-4">
                    <h3 className="text-lg font-bold text-foreground flex-grow pr-2">{paper.title}</h3>
                    <button 
                        onClick={() => onToggleWorkspacePaper(paper)} 
                        aria-label={isInWorkspace ? "Remove from Workspace" : "Add to Workspace"} 
                        className={`flex-shrink-0 flex items-center gap-2 h-9 px-4 rounded-md text-sm font-semibold transition-colors ${
                            isInWorkspace 
                            ? 'bg-green-100 text-green-800 hover:bg-green-200' 
                            : 'bg-secondary text-secondary-foreground hover:bg-accent'
                        }`}
                    >
                        {isInWorkspace ? <CheckIcon className="w-4 h-4" /> : <AddIcon className="w-4 h-4" />}
                        <span>{isInWorkspace ? 'In Workspace' : 'Add to Workspace'}</span>
                    </button>
                </div>
            </div>
            
            <div className="border-b border-border">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <TabButton isActive={activeTab === 'overview'} onClick={() => setActiveTab('overview')}>Overview</TabButton>
                    <TabButton isActive={activeTab === 'analysis'} onClick={() => setActiveTab('analysis')}>Analysis & Tools</TabButton>
                    <TabButton isActive={activeTab === 'metadata'} onClick={() => setActiveTab('metadata')}>Metadata & Validation</TabButton>
                </nav>
            </div>

            <div className="pt-2">
                {activeTab === 'overview' && (
                    <div className="space-y-4 animate-fade-in">
                        <div>
                            <h4 className="font-semibold text-foreground">Abstract</h4>
                            <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{paper.abstract}</p>
                        </div>
                         <div>
                            <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                                <TagIcon className="w-4 h-4 text-muted-foreground" />
                                Key Concepts
                            </h4>
                            {renderKeyConcepts()}
                        </div>
                    </div>
                )}

                {activeTab === 'analysis' && (
                     <div className="space-y-6 animate-fade-in">
                        {paper.savedAnalysis && <SavedAnalysis analysis={paper.savedAnalysis} />}
                        <div className="space-y-3">
                             <h3 className="text-base font-bold text-foreground pt-2">Refinement Tools</h3>
                             <ToolCard
                                 icon={<NetworkIcon className="w-5 h-5" />}
                                 title="Find Connected Papers"
                                 description="Discover prior work, derivative research, and contrasting studies."
                                 actionText="Find Connections"
                                 onAction={() => onFindConnectedPapers(paper)}
                                 isLoading={isFindingConnected}
                             />
                             <ToolCard
                                 icon={<AnalyzeIcon className="w-5 h-5" />}
                                 title="Structured Analysis"
                                 description="Use AI to extract the research question, methodology, and findings."
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
                                icon={<CitationIcon className="w-5 h-5" />}
                                title="Generate Citation"
                                description="Create a formatted citation in various styles (APA, MLA, etc.)."
                                actionText="Cite Paper"
                                onAction={() => onCitePaper(paper)}
                            />
                        </div>
                    </div>
                )}
                
                {activeTab === 'metadata' && (
                     <div className="space-y-6 animate-fade-in">
                        {paper.validation && <ValidationScoreDisplay validation={paper.validation} />}

                        <div className="space-y-3">
                             <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-semibold text-foreground text-sm">Authors</h4>
                                    <p className="text-sm text-muted-foreground">{paper.authors}</p>
                                </div>
                                <div className="text-right">
                                    <h4 className="font-semibold text-foreground text-sm">Year</h4>
                                    <p className="text-sm text-muted-foreground">{paper.year}</p>
                                </div>
                            </div>
                             <div>
                                <h4 className="font-semibold text-foreground text-sm">Journal</h4>
                                <p className="text-sm text-muted-foreground">{paper.journal || 'N/A'}</p>
                            </div>
                            {paper.citations !== undefined && (
                                <div>
                                    <h4 className="font-semibold text-foreground text-sm">Citations</h4>
                                    <p className="text-sm text-muted-foreground">{paper.citations.toLocaleString()}</p>
                                </div>
                            )}
                        </div>

                        <div className="pt-3 border-t border-border flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                            <div className="flex items-center gap-4">
                                <a href={googleScholarSearchUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                    <ScholarIcon className="w-4 h-4" /> Google Scholar
                                </a>
                                {paper.pdfURL && <a href={paper.pdfURL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"><PdfIcon className="w-4 h-4" /> PDF</a>}
                                <DoiDisplay paper={paper} onFindDoi={() => onFindDoi(paper)} />
                                {navigator.share && (
                                    <button onClick={handleShare} className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
                                        <ShareIcon className="w-4 h-4" />
                                        <span>Share</span>
                                    </button>
                                )}
                            </div>
                            {paper.enrichmentSource === 'arXiv' && (
                                <div className="flex items-center gap-1.5 text-xs font-medium bg-gray-100 text-gray-800 px-2 py-1 rounded-full" title="Metadata was fetched directly from arXiv for higher accuracy.">
                                    <ArxivIcon className="w-4 h-4" />
                                    <span>Enriched from arXiv</span>
                                </div>
                            )}
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};