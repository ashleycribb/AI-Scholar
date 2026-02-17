import React, { useState, useEffect } from 'react';
import type { AppMode, ModelDefinition, ResearchPaper } from './types';
import { AVAILABLE_MODELS, PROJECT_COLORS } from './constants';
import { useSearch } from './hooks/useSearch';
import { useWorkspace } from './hooks/useWorkspace';
import { usePaperInteractions } from './hooks/usePaperInteractions';
import { useDissertation } from './hooks/useDissertation';

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


const App: React.FC = () => {
    // App mode
    const [appMode, setAppMode] = useState<AppMode>('search');
    
    // Model state (Global)
    const [model, setModel] = useState<ModelDefinition>(AVAILABLE_MODELS[0]);
    
    // Selected Paper (Shared state)
    const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);

    // Modals (App Level)
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

    // Hooks
    const search = useSearch(model, () => setSelectedPaper(null));
    const workspace = useWorkspace(model);
    
    const paperInteractions = usePaperInteractions(
        search.papers,
        search.setPapers,
        workspace.workspacePapers,
        workspace.setWorkspacePapers,
        selectedPaper,
        setSelectedPaper,
        model,
        (paperId) => workspace.handleMovePaperToProject(paperId, null) // Callback for removing from projects
    );

    const dissertation = useDissertation();

    // Effect to auto-select paper found by DOI search
    useEffect(() => {
        if (search.justFoundDoiPaper) {
            paperInteractions.handleSelectPaper(search.justFoundDoiPaper);
            search.setJustFoundDoiPaper(null);
        }
    }, [search.justFoundDoiPaper]);

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
                            <main className={search.hasSearched ? "lg:col-span-3" : "lg:col-span-5"}>
                                {!search.hasSearched ? (
                                    <InitialSearchScreen 
                                        query={search.query}
                                        onQueryChange={search.setQuery}
                                        onSearch={search.handleSearch}
                                        isLoading={search.isLoading}
                                        summaryLength={search.summaryLength}
                                        onLengthChange={search.setSummaryLength}
                                        summaryStyle={search.summaryStyle}
                                        onStyleChange={search.setSummaryStyle}
                                        model={model} 
                                        onModelChange={setModel} 
                                        availableModels={AVAILABLE_MODELS} 
                                        logAnalyticsEvent={() => {}} 
                                        onOpenDbFinder={() => paperInteractions.setIsDbFinderOpen(true)}
                                        searchSources={search.searchSources}
                                        suggestions={search.searchSuggestions}
                                        isSuggestionsLoading={search.isGeneratingSearchSuggestions}
                                        onSuggestionClick={search.handleSuggestionClick}
                                    >
                                        <ExtensionPromo />
                                    </InitialSearchScreen>
                                ) : (
                                    <div className="space-y-6">
                                        <SearchForm 
                                            query={search.query}
                                            onQueryChange={search.setQuery}
                                            onSearch={search.handleSearch}
                                            isLoading={search.isLoading}
                                            summaryLength={search.summaryLength}
                                            onLengthChange={search.setSummaryLength}
                                            summaryStyle={search.summaryStyle}
                                            onStyleChange={search.setSummaryStyle}
                                            model={model} 
                                            onModelChange={setModel} 
                                            availableModels={AVAILABLE_MODELS} 
                                            logAnalyticsEvent={() => {}}
                                            suggestions={search.searchSuggestions}
                                            isSuggestionsLoading={search.isGeneratingSearchSuggestions}
                                            onSuggestionClick={search.handleSuggestionClick}
                                        />
                                        {search.isLoading && <LoadingSpinner message={"Searching..."} />}
                                        {search.error && <ErrorMessage message={search.error} />}
                                        {!search.isLoading && !search.error && search.hasSearched && (
                                            <ResultsDisplay 
                                                papers={search.sortedPapers}
                                                selectedPaperId={selectedPaper?.id || null} 
                                                onSelectPaper={paperInteractions.handleSelectPaper}
                                                sortConfig={search.sortConfig}
                                                onSortChange={search.handleSortChange}
                                                isScreeningMode={search.isScreeningMode}
                                                onSetScreeningMode={search.handleSetScreeningMode}
                                                onScreenPaper={search.handleScreenPaper}
                                                onAiRerank={() => search.handleAiRerank(workspace.workspacePapers)}
                                                isReranking={search.isReranking}
                                                onLoadMore={search.handleLoadMore}
                                                hasMore={search.hasMore}
                                                isLoadingMore={search.isLoadingMore}
                                            />
                                        )}
                                    </div>
                                )}
                            </main>

                            {search.hasSearched && (
                                <aside className="lg:col-span-2">
                                <WorkspacePanel
                                    papers={search.papers}
                                    selectedPaper={selectedPaper}
                                    analysis={search.analysis}
                                    summary={search.summary}
                                    workspacePapers={workspace.workspacePapers}
                                    projects={workspace.projects}
                                    sources={[]}
                                    onToggleWorkspacePaper={paperInteractions.handleToggleWorkspacePaper}
                                    onFindConnectedPapers={paperInteractions.handleFindConnectedPapers}
                                    isFindingConnected={paperInteractions.isFindingConnections}
                                    onAnalyzePaper={paperInteractions.handleAnalyzePaper}
                                    onCitePaper={paperInteractions.handleOpenCitationModal}
                                    isAnalyzingPaper={paperInteractions.isAnalyzingPaper}
                                    onConceptClick={search.handleConceptSearch}
                                    onFindDoi={paperInteractions.handleFindDoi}
                                    onGenerateSuggestions={paperInteractions.handleGenerateSuggestions}
                                    isGeneratingSuggestions={paperInteractions.isGeneratingSuggestions}
                                    onVerifyPaper={paperInteractions.handleOpenVerificationModal}
                                    logAnalyticsEvent={() => {}}
                                    refinedQueries={search.refinedQueries}
                                    isGeneratingRefined={false}
                                    onRefinedQuerySearch={() => {}}
                                    onAnalyzeGaps={(papers, overrideModel) => paperInteractions.handleAnalyzeGaps(papers, overrideModel)}
                                    onSynthesizeWorkspace={(papers, overrideModel) => paperInteractions.handleSynthesizeWorkspace(papers, overrideModel)}
                                    onCreateProject={workspace.handleCreateProject}
                                    onDeleteProject={workspace.handleDeleteProject}
                                    onMovePaperToProject={workspace.handleMovePaperToProject}
                                    onUpdateProjectColor={workspace.handleUpdateProjectColor}
                                    model={model}
                                    onIndexPaperForRag={workspace.handleIndexPaperForRag}
                                    projectChats={workspace.projectChats}
                                    onProjectChat={workspace.handleProjectChat}
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
            <VerificationModal isOpen={paperInteractions.isVerificationModalOpen} onClose={() => paperInteractions.setIsVerificationModalOpen(false)} paper={paperInteractions.paperToVerify} onVerificationComplete={paperInteractions.handleVerificationComplete} />
            <ReportModal isOpen={paperInteractions.isGapAnalysisModalOpen} onClose={() => paperInteractions.setIsGapAnalysisModalOpen(false)} isLoading={paperInteractions.isAnalyzingGaps} content={paperInteractions.gapAnalysisResult} error={paperInteractions.gapAnalysisError} />
            <PaperAnalysisModal isOpen={paperInteractions.isAnalysisModalOpen} onClose={() => paperInteractions.setIsAnalysisModalOpen(false)} isLoading={paperInteractions.isAnalyzingPaper} error={paperInteractions.analysisError} result={paperInteractions.analysisResult} onSaveAnalysis={paperInteractions.handleSaveAnalysis} isAnalysisSaved={!!paperInteractions.analysisResult?.paper.savedAnalysis} />
            <SynthesisModal isOpen={paperInteractions.isSynthesisModalOpen} onClose={() => paperInteractions.setIsSynthesisModalOpen(false)} isLoading={paperInteractions.isSynthesizing} result={paperInteractions.synthesisResult} error={paperInteractions.synthesisError} />
            <CitationModal isOpen={paperInteractions.isCitationModalOpen} onClose={() => paperInteractions.setIsCitationModalOpen(false)} paper={paperInteractions.paperForCitation} model={model} />
            <DatabaseFinderModal isOpen={paperInteractions.isDbFinderOpen} onClose={() => paperInteractions.setIsDbFinderOpen(false)} onAddSource={search.handleAddSource} existingSources={search.searchSources} />
            <SuggestionsModal isOpen={paperInteractions.isSuggestionsModalOpen} onClose={() => paperInteractions.setIsSuggestionsModalOpen(false)} result={paperInteractions.suggestionsResult} isLoading={paperInteractions.isGeneratingSuggestions} error={paperInteractions.suggestionsError} onSuggestionClick={search.handleSuggestionClick} />
            <ConnectedPapersModal isOpen={paperInteractions.isConnectionsModalOpen} onClose={() => paperInteractions.setIsConnectionsModalOpen(false)} result={paperInteractions.connectionsResult} error={paperInteractions.connectionsError} isLoading={paperInteractions.isFindingConnections} />
        </div>
    );
};

export default App;
