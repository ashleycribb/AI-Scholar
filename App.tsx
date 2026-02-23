import React, { useState } from 'react';
import type { AppMode, ModelDefinition } from './types';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { InitialSearchScreen } from './components/InitialSearchScreen';
import { ExtensionPromo } from './components/ExtensionPromo';
import { WorkspacePanel } from './components/WorkspacePanel';
import { SuggestionsModal } from './components/SuggestionsModal';
import { VerificationModal } from './components/VerificationModal';
import { SearchForm } from './components/SearchForm';
import { OnboardingModal } from './components/OnboardingModal';
import { InfoModal } from './components/InfoModal';
import { AboutModalContent } from './components/AboutModalContent';
import { ReportModal } from './components/ReportModal';
import { PaperAnalysisModal } from './components/PaperAnalysisModal';
import { SynthesisModal } from './components/SynthesisModal';
import { ResearcherDashboard } from './components/ResearcherDashboard';
import { PaperVerificationApp } from './components/PaperVerificationApp';
import { CitationModal } from './components/CitationModal';
import { DatabaseFinderModal } from './components/DatabaseFinderModal';
import { Header } from './components/Header';
import { ConnectedPapersModal } from './components/ConnectedPapersModal';

import { usePapers } from './src/hooks/usePapers';
import { useSearch } from './src/hooks/useSearch';
import { usePaperInteractions } from './src/hooks/usePaperInteractions';
import { useDissertation } from './src/hooks/useDissertation';

export const AVAILABLE_MODELS: ModelDefinition[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini Pro', provider: 'gemini' },
  { id: 'gpt-4-turbo', name: 'OpenAI GPT-4 Turbo', provider: 'openai', isMock: true },
  { id: 'claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet', provider: 'anthropic', isMock: true },
];

const App: React.FC = () => {
    // App mode
    const [appMode, setAppMode] = useState<AppMode>('search');
    const [model, setModel] = useState<ModelDefinition>(AVAILABLE_MODELS[0]);
    
    // UI State for top-level modals
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

    // Hooks
    const papersData = usePapers(model);
    const searchData = useSearch(model, papersData);
    const interactions = usePaperInteractions(model, papersData, searchData);
    const dissertation = useDissertation();

    const renderAppMode = () => {
        switch (appMode) {
            case 'dashboard':
                return <ResearcherDashboard 
                            dataset={dissertation.goldStandardDataset}
                            setDataset={dissertation.setGoldStandardDataset}
                            testResults={dissertation.testHarnessResults}
                            runTestHarness={dissertation.handleRunTestHarness}
                            userStudyData={dissertation.userStudyData}
                            onStartUserStudy={() => setAppMode('evaluation')}
                        />;
            case 'evaluation':
                return <PaperVerificationApp 
                            dataset={dissertation.goldStandardDataset}
                            onComplete={(data) => {
                                dissertation.handleSaveUserStudyData(data);
                                alert('Study task complete! Thank you.');
                                setAppMode('dashboard');
                            }}
                        />;
            case 'search':
            default:
                return (
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                            <main className={searchData.hasSearched ? "lg:col-span-3" : "lg:col-span-5"}>
                                {!searchData.hasSearched ? (
                                    <InitialSearchScreen 
                                        query={searchData.query}
                                        onQueryChange={searchData.setQuery}
                                        onSearch={searchData.handleSearch}
                                        isLoading={searchData.isLoading}
                                        summaryLength={searchData.summaryLength}
                                        onLengthChange={searchData.setSummaryLength}
                                        summaryStyle={searchData.summaryStyle}
                                        onStyleChange={searchData.setSummaryStyle}
                                        model={model} 
                                        onModelChange={setModel} 
                                        availableModels={AVAILABLE_MODELS} 
                                        logAnalyticsEvent={() => {}} 
                                        onOpenDbFinder={() => interactions.setIsDbFinderOpen(true)}
                                        searchSources={searchData.searchSources}
                                        suggestions={searchData.searchSuggestions}
                                        isSuggestionsLoading={searchData.isGeneratingSearchSuggestions}
                                        onSuggestionClick={searchData.handleSuggestionSearch}
                                    >
                                        <ExtensionPromo />
                                    </InitialSearchScreen>
                                ) : (
                                    <div className="space-y-6">
                                        <SearchForm 
                                            query={searchData.query}
                                            onQueryChange={searchData.setQuery}
                                            onSearch={searchData.handleSearch}
                                            isLoading={searchData.isLoading}
                                            summaryLength={searchData.summaryLength}
                                            onLengthChange={searchData.setSummaryLength}
                                            summaryStyle={searchData.summaryStyle}
                                            onStyleChange={searchData.setSummaryStyle}
                                            model={model} 
                                            onModelChange={setModel} 
                                            availableModels={AVAILABLE_MODELS} 
                                            logAnalyticsEvent={() => {}}
                                            suggestions={searchData.searchSuggestions}
                                            isSuggestionsLoading={searchData.isGeneratingSearchSuggestions}
                                            onSuggestionClick={searchData.handleSuggestionSearch}
                                        />
                                        {searchData.isLoading && <LoadingSpinner message={"Searching..."} />}
                                        {searchData.error && <ErrorMessage message={searchData.error} />}
                                        {!searchData.isLoading && !searchData.error && searchData.hasSearched && (
                                            <ResultsDisplay 
                                                papers={searchData.sortedPapers}
                                                selectedPaperId={papersData.selectedPaper?.id || null}
                                                onSelectPaper={papersData.handleSelectPaper}
                                                sortConfig={searchData.sortConfig}
                                                onSortChange={searchData.handleSortChange}
                                                isScreeningMode={searchData.isScreeningMode}
                                                onSetScreeningMode={searchData.handleSetScreeningMode}
                                                onScreenPaper={searchData.handleScreenPaper}
                                                onAiRerank={searchData.handleAiRerank}
                                                isReranking={searchData.isReranking}
                                                onLoadMore={searchData.handleLoadMore}
                                                hasMore={searchData.hasMore}
                                                isLoadingMore={searchData.isLoadingMore}
                                            />
                                        )}
                                    </div>
                                )}
                            </main>

                            {searchData.hasSearched && (
                                <aside className="lg:col-span-2">
                                <WorkspacePanel
                                    papers={papersData.papers}
                                    selectedPaper={papersData.selectedPaper}
                                    analysis={papersData.analysis}
                                    summary={searchData.summary}
                                    workspacePapers={papersData.workspacePapers}
                                    projects={papersData.projects}
                                    sources={[]}
                                    onToggleWorkspacePaper={papersData.handleToggleWorkspacePaper}
                                    onFindConnectedPapers={interactions.handleFindConnectedPapers}
                                    isFindingConnected={interactions.isFindingConnections}
                                    onAnalyzePaper={interactions.handleAnalyzePaper}
                                    onCitePaper={interactions.handleOpenCitationModal}
                                    isAnalyzingPaper={interactions.isAnalyzingPaper}
                                    onConceptClick={interactions.handleConceptSearch}
                                    onFindDoi={interactions.handleFindDoi}
                                    onGenerateSuggestions={interactions.handleGenerateSuggestions}
                                    isGeneratingSuggestions={interactions.isGeneratingSuggestions}
                                    onVerifyPaper={interactions.handleOpenVerificationModal}
                                    logAnalyticsEvent={() => {}}
                                    refinedQueries={searchData.refinedQueries}
                                    isGeneratingRefined={false}
                                    onRefinedQuerySearch={() => {}}
                                    onAnalyzeGaps={interactions.handleAnalyzeGaps}
                                    onSynthesizeWorkspace={interactions.handleSynthesizeWorkspace}
                                    onCreateProject={papersData.handleCreateProject}
                                    onDeleteProject={papersData.handleDeleteProject}
                                    onMovePaperToProject={papersData.handleMovePaperToProject}
                                    onUpdateProjectColor={papersData.handleUpdateProjectColor}
                                    model={model}
                                    onIndexPaperForRag={papersData.handleIndexPaperForRag}
                                    projectChats={papersData.projectChats}
                                    onProjectChat={papersData.handleProjectChat}
                                />
                                </aside>
                            )}
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            <Header
                onOpenAbout={() => setIsAboutModalOpen(true)}
                onOpenHelp={() => setIsOnboardingOpen(true)}
                appMode={appMode}
                onModeChange={setAppMode}
            />
            <div className="flex-grow">
                {renderAppMode()}
            </div>
            
            {/* Modals are kept at the top level to be accessible from any mode */}
            {isOnboardingOpen && <OnboardingModal onComplete={() => setIsOnboardingOpen(false)} onSkip={() => setIsOnboardingOpen(false)} />}
            {isAboutModalOpen && <InfoModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About AI Research Explorer"> <AboutModalContent /> </InfoModal>}
            <VerificationModal isOpen={interactions.isVerificationModalOpen} onClose={() => interactions.setIsVerificationModalOpen(false)} paper={interactions.paperToVerify} onVerificationComplete={interactions.handleVerificationComplete} />
            <ReportModal isOpen={interactions.isGapAnalysisModalOpen} onClose={() => interactions.setIsGapAnalysisModalOpen(false)} isLoading={interactions.isAnalyzingGaps} content={interactions.gapAnalysisResult} error={interactions.gapAnalysisError} />
            <PaperAnalysisModal isOpen={interactions.isAnalysisModalOpen} onClose={() => interactions.setIsAnalysisModalOpen(false)} isLoading={interactions.isAnalyzingPaper} error={interactions.analysisError} result={interactions.analysisResult} onSaveAnalysis={interactions.handleSaveAnalysis} isAnalysisSaved={!!interactions.analysisResult?.paper.savedAnalysis} />
            <SynthesisModal isOpen={interactions.isSynthesisModalOpen} onClose={() => interactions.setIsSynthesisModalOpen(false)} isLoading={interactions.isSynthesizing} result={interactions.synthesisResult} error={interactions.synthesisError} />
            <CitationModal isOpen={interactions.isCitationModalOpen} onClose={() => interactions.setIsCitationModalOpen(false)} paper={interactions.paperForCitation} model={model} />
            <DatabaseFinderModal isOpen={interactions.isDbFinderOpen} onClose={() => interactions.setIsDbFinderOpen(false)} onAddSource={searchData.handleAddSource} existingSources={searchData.searchSources} />
            <SuggestionsModal isOpen={interactions.isSuggestionsModalOpen} onClose={() => interactions.setIsSuggestionsModalOpen(false)} result={interactions.suggestionsResult} isLoading={interactions.isGeneratingSuggestions} error={interactions.suggestionsError} onSuggestionClick={interactions.handleSuggestionClick} />
            <ConnectedPapersModal isOpen={interactions.isConnectionsModalOpen} onClose={() => interactions.setIsConnectionsModalOpen(false)} result={interactions.connectionsResult} error={interactions.connectionsError} isLoading={interactions.isFindingConnections} />
        </div>
    );
};

export default App;
