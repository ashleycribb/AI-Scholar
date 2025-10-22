


import React, { useState, useEffect } from 'react';
import type { ResearchPaper, AnalysisResult } from '../types';
import { PaperDetails } from './PaperDetails';
import { AnalysisDashboard } from './AnalysisDashboard';
import { NetworkIcon } from './icons/NetworkIcon';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { VerificationIcon } from './icons/VerificationIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';
import { SearchIcon } from './icons/SearchIcon';
import * as extensionService from '../services/extensionService';

interface RefinedQueriesProps {
  queries: string[];
  isLoading: boolean;
  onQueryClick: (query: string) => void;
}

const RefinedQueries: React.FC<RefinedQueriesProps> = ({ queries, isLoading, onQueryClick }) => {
  if (!isLoading && queries.length === 0) {
    return null;
  }
  
  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
        <LightbulbIcon className="w-6 h-6 text-yellow-500" />
        <span>AI-Generated Query Suggestions</span>
      </h3>
      {isLoading ? (
         <div className="py-8">
            <p className="text-center text-muted-foreground">Generating new angles...</p>
        </div>
      ) : (
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
      )}
    </div>
  );
};

interface DetailsPanelProps {
    selectedPaper: ResearchPaper | null;
    summary: string;
    analysis: AnalysisResult | null;
    isFavorite: boolean;
    onToggleFavorite: (paper: ResearchPaper) => void;
    onFindConnectedPapers: (paper: ResearchPaper) => void;
    isFindingConnected: boolean;
    onAnalyzePaper: (paper: ResearchPaper) => void;
    isAnalyzingPaper: boolean;
    onVerifyPaper: (paper: ResearchPaper) => void;
    isVerifying: boolean;
    onConceptClick: (concept: string) => void;
    onFindDoi: (paper: ResearchPaper) => void;
    onGenerateSuggestions: (paper: ResearchPaper) => void;
    isGeneratingSuggestions: boolean;
    logAnalyticsEvent: (eventName: string, payload: object) => void;
    refinedQueries: string[];
    isGeneratingRefined: boolean;
    onRefinedQuerySearch: (query: string) => void;
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

const ToolCard: React.FC<{
    icon: React.ReactNode;
    title: string;
    description: string;
    actionText: string;
    onAction: () => void;
    isLoading: boolean;
}> = ({ icon, title, description, actionText, onAction, isLoading }) => {
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
                disabled={isLoading}
                className="h-9 px-4 py-2 bg-primary text-primary-foreground text-sm font-semibold rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring disabled:opacity-50 flex-shrink-0"
            >
                {isLoading ? 'Loading...' : actionText}
            </button>
        </div>
    );
};

export const DetailsPanel: React.FC<DetailsPanelProps> = (props) => {
    const { selectedPaper, summary, analysis, refinedQueries, isGeneratingRefined, onRefinedQuerySearch } = props;
    const [activeTab, setActiveTab] = useState<'details' | 'analysis' | 'tools'>('details');

    useEffect(() => {
        if (selectedPaper) {
            setActiveTab('details');
        } else if (analysis || summary || isGeneratingRefined || refinedQueries.length > 0) {
            setActiveTab('analysis');
        }
    }, [selectedPaper, analysis, summary, isGeneratingRefined, refinedQueries]);

    const renderContent = () => {
        switch (activeTab) {
            case 'details':
                return selectedPaper ? (
                    <PaperDetails
                        paper={selectedPaper}
                        isFavorite={props.isFavorite}
                        onToggleFavorite={props.onToggleFavorite}
                        onVerifyPaper={props.onVerifyPaper}
                        isVerifying={props.isVerifying}
                        onConceptClick={props.onConceptClick}
                        onFindDoi={props.onFindDoi}
                        logAnalyticsEvent={props.logAnalyticsEvent}
                    />
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to view its details here.</p>
                    </div>
                );
            case 'analysis':
                return (analysis || summary || refinedQueries.length > 0 || isGeneratingRefined) ? (
                    <div className="space-y-6">
                        <RefinedQueries
                            queries={refinedQueries}
                            isLoading={isGeneratingRefined}
                            onQueryClick={onRefinedQuerySearch}
                        />
                        {(analysis || summary) && <AnalysisDashboard analysis={analysis} summary={summary} />}
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Analysis Panel</h2>
                        <p>Insights about your search results will appear here once a search is complete.</p>
                    </div>
                );
            case 'tools':
                return selectedPaper ? (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-foreground">Refinement Tools</h3>
                        <ToolCard
                            icon={<NetworkIcon className="w-5 h-5" />}
                            title="Find Connected Papers"
                            description="Discover prior work, derivative research, and contrasting studies."
                            actionText="Find Connections"
                            onAction={() => props.onFindConnectedPapers(selectedPaper)}
                            isLoading={props.isFindingConnected}
                        />
                        <ToolCard
                            icon={<AnalyzeIcon className="w-5 h-5" />}
                            title="Structured Analysis"
                            description="Use AI to extract the research question, methodology, and findings."
                            actionText="Analyze Paper"
                            onAction={() => props.onAnalyzePaper(selectedPaper)}
                            isLoading={props.isAnalyzingPaper}
                        />
                        <ToolCard
                            icon={<VerificationIcon type="unverified" className="w-5 h-5" />}
                            title="Verify Source"
                            description="Confirm the paper's existence and find an accessible source link."
                            actionText="Verify"
                            onAction={() => props.onVerifyPaper(selectedPaper)}
                            isLoading={props.isVerifying}
                        />
                        <ToolCard
                            icon={<LightbulbIcon className="w-5 h-5" />}
                            title="Generate Search Ideas"
                            description="Get AI-powered suggestions for new search queries based on this paper."
                            actionText="Generate Ideas"
                            onAction={() => props.onGenerateSuggestions(selectedPaper)}
                            isLoading={props.isGeneratingSuggestions}
                        />
                    </div>
                ) : (
                    <div className="text-center text-muted-foreground py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to use the refinement tools.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-card rounded-lg shadow-sm border sticky top-24">
            <div className="border-b border-border p-1">
                <nav className="flex space-x-1 bg-muted rounded-md p-1" aria-label="Tabs">
                    <TabButton onClick={() => setActiveTab('details')} isActive={activeTab === 'details'} disabled={!selectedPaper}>
                        Details
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('analysis')} isActive={activeTab === 'analysis'} disabled={!analysis && !summary && !isGeneratingRefined && refinedQueries.length === 0}>
                        Search Analysis
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('tools')} isActive={activeTab === 'tools'} disabled={!selectedPaper}>
                        Refinement Tools
                    </TabButton>
                </nav>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(100vh-12rem)]">
                {renderContent()}
            </div>
        </div>
    );
};