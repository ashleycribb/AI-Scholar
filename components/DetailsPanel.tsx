
import React, { useState, useEffect } from 'react';
import type { ResearchPaper, AnalysisResult } from '../types';
import { PaperDetails } from './PaperDetails';
import { AnalysisDashboard } from './AnalysisDashboard';
import { NetworkIcon } from './icons/NetworkIcon';
import { AnalyzeIcon } from './icons/AnalyzeIcon';
import { VerificationIcon } from './icons/VerificationIcon';
import { LightbulbIcon } from './icons/LightbulbIcon';

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
}

const TabButton: React.FC<{
    onClick: () => void;
    isActive: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}> = ({ onClick, isActive, disabled, children }) => {
    const baseClasses = "px-4 py-3 text-sm font-medium transition-colors focus:outline-none";
    const activeClasses = "border-b-2 border-blue-600 text-blue-600";
    const inactiveClasses = "border-b-2 border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100";
    const disabledClasses = "text-gray-300 cursor-not-allowed";

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
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                    {icon}
                </div>
                <div>
                    <h4 className="font-semibold text-gray-800">{title}</h4>
                    <p className="text-sm text-gray-600">{description}</p>
                </div>
            </div>
            <button
                onClick={onAction}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors duration-200 flex-shrink-0"
            >
                {isLoading ? 'Loading...' : actionText}
            </button>
        </div>
    );
};

export const DetailsPanel: React.FC<DetailsPanelProps> = (props) => {
    const { selectedPaper, summary, analysis } = props;
    const [activeTab, setActiveTab] = useState<'details' | 'analysis' | 'tools'>('details');

    useEffect(() => {
        if (selectedPaper) {
            setActiveTab('details');
        } else if (analysis || summary) {
            setActiveTab('analysis');
        }
    }, [selectedPaper, analysis, summary]);

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
                    />
                ) : (
                    <div className="text-center text-gray-500 py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to view its details here.</p>
                    </div>
                );
            case 'analysis':
                return (analysis || summary) ? (
                    <AnalysisDashboard analysis={analysis} summary={summary} />
                ) : (
                    <div className="text-center text-gray-500 py-16">
                        <h2 className="text-lg font-semibold">Analysis Panel</h2>
                        <p>Insights about your search results will appear here once a search is complete.</p>
                    </div>
                );
            case 'tools':
                return selectedPaper ? (
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800">Refinement Tools</h3>
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
                    <div className="text-center text-gray-500 py-16">
                        <h2 className="text-lg font-semibold">Select a Paper</h2>
                        <p>Select a paper from the list to use the refinement tools.</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-white rounded-lg shadow-sm border sticky top-24">
            <div className="border-b border-gray-200">
                <nav className="flex space-x-2" aria-label="Tabs">
                    <TabButton onClick={() => setActiveTab('details')} isActive={activeTab === 'details'} disabled={!selectedPaper}>
                        Details
                    </TabButton>
                    <TabButton onClick={() => setActiveTab('analysis')} isActive={activeTab === 'analysis'} disabled={!analysis && !summary}>
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
