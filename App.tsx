import React, { useState } from 'react';
import type { AppMode, ResearchPaper } from '@/types';
import { AVAILABLE_MODELS } from '@/src/constants';
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

// Hooks
import { useSearch } from '@/src/hooks/useSearch';
import { usePapers } from '@/src/hooks/usePapers';
import { usePaperInteractions } from '@/src/hooks/usePaperInteractions';
import { useDissertation } from '@/src/hooks/useDissertation';

const App: React.FC = () => {
    // App mode
    const [appMode, setAppMode] = useState<AppMode>('search');

    // 1. Papers & Projects Hook
    const {
        workspacePapers,
        // setWorkspacePapers, // exposed but not used directly here
        projects,
        projectChats,
        handleToggleWorkspacePaper,
        handleCreateProject,
        handleDeleteProject,
        handleMovePaperToProject,
        handleUpdateProjectColor,
        handleIndexPaperForRag,
        handleProjectChat,
        updateWorkspacePaper
    } = usePapers();

    // Handler for search hook to update workspace papers
    const handleSearchPaperUpdate = (id: string, updates: Partial<ResearchPaper>) => {
        updateWorkspacePaper(id, updates);
    };

    // 2. Search Hook
    const {
        query, setQuery,
        model, setModel,
        papers,
        isLoading,
        error,
        summaryLength, setSummaryLength,
        summaryStyle, setSummaryStyle,
        hasSearched,
        sortConfig,
        selectedPaper, // setSelectedPaper is handled internally by updateSearchPaper interactions
        analysis,
        refinedQueries,
        isScreeningMode,
        isReranking,
        searchSources,
        searchSuggestions,
        isGeneratingSearchSuggestions,
        summary,
        isLoadingMore,
        hasMore,
        lastUsedOptions,
        sortedPapers,
        
        handleSearch,
        handleSuggestionSearch,
        handleLoadMore,
        handleSelectPaper,
        handleSortChange,
        handleSetScreeningMode,
        handleScreenPaper,
        handleAiRerank,
        handleAddSource,
        updatePaperState: updateSearchPaper
    } = useSearch(handleSearchPaperUpdate);

    // Handler for interaction hook to update papers (both search and workspace)
    const handleExternalPaperUpdate = (id: string, updates: Partial<ResearchPaper>) => {
        updateSearchPaper(id, updates);
        // updateSearchPaper triggers handleSearchPaperUpdate -> updateWorkspacePaper
    };

    // 3. Interactions Hook (Modals)
    const {
        isVerificationModalOpen, setIsVerificationModalOpen,
        paperToVerify,
        isOnboardingOpen, setIsOnboardingOpen,
        isAboutModalOpen, setIsAboutModalOpen,
        isGapAnalysisModalOpen, setIsGapAnalysisModalOpen,
        isAnalyzingGaps, gapAnalysisResult, gapAnalysisError,
        isAnalysisModalOpen, setIsAnalysisModalOpen,
        isAnalyzingPaper, analysisError, analysisResult,
        isSynthesisModalOpen, setIsSynthesisModalOpen,
        isSynthesizing, synthesisResult, synthesisError,
        isCitationModalOpen, setIsCitationModalOpen,
        paperForCitation,
        isDbFinderOpen, setIsDbFinderOpen,
        isSuggestionsModalOpen, setIsSuggestionsModalOpen,
        suggestionsResult, isGeneratingSuggestions, suggestionsError,
        isConnectionsModalOpen, setIsConnectionsModalOpen,
        connectionsResult, isFindingConnections, connectionsError,

        handleOpenVerificationModal,
        handleVerificationComplete,
        handleAnalyzeGaps,
        handleAnalyzePaper,
        handleSaveAnalysis,
        handleOpenCitationModal,
        handleGenerateSuggestions,
        handleFindDoi,
        handleFindConnectedPapers,
        handleSynthesizeWorkspace,
    } = usePaperInteractions(model, handleExternalPaperUpdate);
    
    // 4. Dissertation Hook
    const {
        goldStandardDataset, setGoldStandardDataset,
        testHarnessResults,
        userStudyData,
        handleUpdateGoldStandardPaper,
        handleRunTestHarness,
        handleSaveUserStudyData
    } = useDissertation();

    const handleSuggestionClick = (newQuery: string) => {
        setIsSuggestionsModalOpen(false);
        setQuery(newQuery);
        handleSearch(newQuery, lastUsedOptions);
    };

    // Implementation of handleConceptSearch using the hook values
    const onConceptSearch = (concept: string) => {
        const currentQuery = query;
        setQuery(concept);
        handleSearch(concept, { ...lastUsedOptions, inclusionCriteria: `"${concept}" OR "${currentQuery}"` });
    };


    const renderAppMode = () => {
        switch (appMode) {
            case 'dashboard':
                return <ResearcherDashboard 
                            dataset={goldStandardDataset}
                            setDataset={setGoldStandardDataset}
                            testResults={testHarnessResults}
                            runTestHarness={handleRunTestHarness}
                            userStudyData={userStudyData}
                            onStartUserStudy={() => setAppMode('evaluation')}
                        />;
            case 'evaluation':
                return <PaperVerificationApp 
                            dataset={goldStandardDataset} 
                            onComplete={(data) => {
                                handleSaveUserStudyData(data);
                                alert('Study task complete! Thank you.');
                                setAppMode('dashboard');
                            }}
                        />;
            case 'search':
            default:
                return (
                    <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-6">
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                            <main className={hasSearched ? "lg:col-span-3" : "lg:col-span-5"}>
                                {!hasSearched ? (
                                    <InitialSearchScreen 
                                        query={query} 
                                        onQueryChange={setQuery} 
                                        onSearch={handleSearch} 
                                        isLoading={isLoading} 
                                        summaryLength={summaryLength} 
                                        onLengthChange={setSummaryLength} 
                                        summaryStyle={summaryStyle} 
                                        onStyleChange={setSummaryStyle} 
                                        model={model} 
                                        onModelChange={setModel} 
                                        availableModels={AVAILABLE_MODELS} 
                                        logAnalyticsEvent={() => {}} 
                                        onOpenDbFinder={() => setIsDbFinderOpen(true)} 
                                        searchSources={searchSources}
                                        suggestions={searchSuggestions}
                                        isSuggestionsLoading={isGeneratingSearchSuggestions}
                                        onSuggestionClick={handleSuggestionSearch}
                                    >
                                        <ExtensionPromo />
                                    </InitialSearchScreen>
                                ) : (
                                    <div className="space-y-6">
                                        <SearchForm 
                                            query={query} 
                                            onQueryChange={setQuery} 
                                            onSearch={handleSearch} 
                                            isLoading={isLoading} 
                                            summaryLength={summaryLength} 
                                            onLengthChange={setSummaryLength} 
                                            summaryStyle={summaryStyle} 
                                            onStyleChange={setSummaryStyle} 
                                            model={model} 
                                            onModelChange={setModel} 
                                            availableModels={AVAILABLE_MODELS} 
                                            logAnalyticsEvent={() => {}}
                                            suggestions={searchSuggestions}
                                            isSuggestionsLoading={isGeneratingSearchSuggestions}
                                            onSuggestionClick={handleSuggestionSearch}
                                        />
                                        {isLoading && <LoadingSpinner message={"Searching..."} />}
                                        {error && <ErrorMessage message={error} />}
                                        {!isLoading && !error && hasSearched && (
                                            <ResultsDisplay 
                                                papers={sortedPapers} 
                                                selectedPaperId={selectedPaper?.id || null} 
                                                onSelectPaper={handleSelectPaper} 
                                                sortConfig={sortConfig} 
                                                onSortChange={handleSortChange}
                                                isScreeningMode={isScreeningMode}
                                                onSetScreeningMode={handleSetScreeningMode}
                                                onScreenPaper={handleScreenPaper}
                                                onAiRerank={() => handleAiRerank(workspacePapers)} // Pass workspacePapers
                                                isReranking={isReranking}
                                                onLoadMore={handleLoadMore}
                                                hasMore={hasMore}
                                                isLoadingMore={isLoadingMore}
                                            />
                                        )}
                                    </div>
                                )}
                            </main>

                            {hasSearched && (
                                <aside className="lg:col-span-2">
                                <WorkspacePanel
                                    papers={papers}
                                    selectedPaper={selectedPaper}
                                    analysis={analysis}
                                    summary={summary}
                                    workspacePapers={workspacePapers}
                                    projects={projects}
                                    sources={[]}
                                    onToggleWorkspacePaper={handleToggleWorkspacePaper}
                                    onFindConnectedPapers={handleFindConnectedPapers}
                                    isFindingConnected={isFindingConnections}
                                    onAnalyzePaper={handleAnalyzePaper}
                                    onCitePaper={handleOpenCitationModal}
                                    isAnalyzingPaper={isAnalyzingPaper}
                                    onConceptClick={onConceptSearch}
                                    onFindDoi={handleFindDoi}
                                    onGenerateSuggestions={handleGenerateSuggestions}
                                    isGeneratingSuggestions={isGeneratingSuggestions}
                                    onVerifyPaper={handleOpenVerificationModal}
                                    logAnalyticsEvent={() => {}}
                                    refinedQueries={refinedQueries}
                                    isGeneratingRefined={false}
                                    onRefinedQuerySearch={() => {}}
                                    onAnalyzeGaps={handleAnalyzeGaps}
                                    onSynthesizeWorkspace={handleSynthesizeWorkspace}
                                    onCreateProject={handleCreateProject}
                                    onDeleteProject={handleDeleteProject}
                                    onMovePaperToProject={handleMovePaperToProject}
                                    onUpdateProjectColor={handleUpdateProjectColor}
                                    model={model}
                                    onIndexPaperForRag={handleIndexPaperForRag}
                                    projectChats={projectChats}
                                    onProjectChat={(projectId, message) => handleProjectChat(projectId, message, model)}
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
            
            {/* Modals */}
            {isOnboardingOpen && <OnboardingModal onComplete={() => setIsOnboardingOpen(false)} onSkip={() => setIsOnboardingOpen(false)} />}
            {isAboutModalOpen && <InfoModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About AI Research Explorer"> <AboutModalContent /> </InfoModal>}
            <VerificationModal isOpen={isVerificationModalOpen} onClose={() => setIsVerificationModalOpen(false)} paper={paperToVerify} onVerificationComplete={handleVerificationComplete} />
            <ReportModal isOpen={isGapAnalysisModalOpen} onClose={() => setIsGapAnalysisModalOpen(false)} isLoading={isAnalyzingGaps} content={gapAnalysisResult} error={gapAnalysisError} />
            <PaperAnalysisModal isOpen={isAnalysisModalOpen} onClose={() => setIsAnalysisModalOpen(false)} isLoading={isAnalyzingPaper} error={analysisError} result={analysisResult} onSaveAnalysis={handleSaveAnalysis} isAnalysisSaved={!!analysisResult?.paper.savedAnalysis} />
            <SynthesisModal isOpen={isSynthesisModalOpen} onClose={() => setIsSynthesisModalOpen(false)} isLoading={isSynthesizing} result={synthesisResult} error={synthesisError} />
            <CitationModal isOpen={isCitationModalOpen} onClose={() => setIsCitationModalOpen(false)} paper={paperForCitation} model={model} />
            <DatabaseFinderModal isOpen={isDbFinderOpen} onClose={() => setIsDbFinderOpen(false)} onAddSource={handleAddSource} existingSources={searchSources} />
            <SuggestionsModal isOpen={isSuggestionsModalOpen} onClose={() => setIsSuggestionsModalOpen(false)} result={suggestionsResult} isLoading={isGeneratingSuggestions} error={suggestionsError} onSuggestionClick={handleSuggestionClick} />
            <ConnectedPapersModal isOpen={isConnectionsModalOpen} onClose={() => setIsConnectionsModalOpen(false)} result={connectionsResult} error={connectionsError} isLoading={isFindingConnections} />
        </div>
    );
};

export default App;
