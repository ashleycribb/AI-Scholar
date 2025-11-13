import React, { useMemo } from 'react';
import type { ResearchPaper, SortKey } from './types';
import { useStore } from '@/src/store/useStore';
import { ResultsDisplay } from '@/components/ResultsDisplay';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorMessage } from '@/components/ErrorMessage';
import { InitialSearchScreen } from '@/components/InitialSearchScreen';
import { ExtensionPromo } from '@/components/ExtensionPromo';
import { WorkspacePanel } from '@/components/WorkspacePanel';
import { SuggestionsModal } from '@/components/SuggestionsModal';
import { VerificationModal } from '@/components/VerificationModal';
import { DashboardToggleButton } from '@/components/ResearcherLoginButton';
import { SearchForm } from '@/components/SearchForm';
import { OnboardingModal } from '@/components/OnboardingModal';
import { InfoModal } from '@/components/InfoModal';
import { AboutModalContent } from '@/components/AboutModalContent';
import { ReportModal } from '@/components/ReportModal';
import { PaperAnalysisModal } from '@/components/PaperAnalysisModal';
import { SynthesisModal } from '@/components/SynthesisModal';
import { ResearcherDashboard } from '@/components/ResearcherDashboard';
import { PaperVerificationApp } from '@/components/PaperVerificationApp';
import { HelpButton } from '@/components/HelpButton';
import { AboutButton } from '@/components/AboutButton';
import { CitationModal } from '@/components/CitationModal';
import { DatabaseFinderModal } from '@/components/DatabaseFinderModal';
import { AVAILABLE_MODELS } from '@/src/utils/constants';
import SystematicReview from './pages/SystematicReview';


const App: React.FC = () => {
    const {
        appMode,
        setAppMode,
        query,
        setQuery,
        model,
        setModel,
        papers,
        isLoading,
        error,
        summaryLength,
        summaryStyle,
        hasSearched,
        sortConfig,
        selectedPaper,
        workspacePapers,
        projects,
        analysis,
        isScreeningMode,
        isReranking,
        projectChats,
        searchSources,
        isVerificationModalOpen,
        paperToVerify,
        isOnboardingOpen,
        isAboutModalOpen,
        isGapAnalysisModalOpen,
        isAnalyzingGaps,
        gapAnalysisResult,
        gapAnalysisError,
        isAnalysisModalOpen,
        isAnalyzingPaper,
        analysisError,
        analysisResult,
        isSynthesisModalOpen,
        isSynthesizing,
        synthesisResult,
        synthesisError,
        isCitationModalOpen,
        paperForCitation,
        isDbFinderOpen,
        isSuggestionsModalOpen,
        suggestionsResult,
        isGeneratingSuggestions,
        suggestionsError,
        handleSearch,
        handleSelectPaper,
        toggleWorkspacePaper,
        openVerificationModal,
        closeVerificationModal,
        handleVerificationComplete,
        analyzeGaps,
        analyzePaper,
        saveAnalysis,
        conceptSearch,
        openCitationModal,
        closeCitationModal,
        setSortConfig,
        setScreeningMode,
        screenPaper,
        aiRerank,
        generateSuggestions,
        suggestionSearch,
        createProject,
        deleteProject,
        movePaperToProject,
        updateProjectColor,
        synthesizeWorkspace,
        indexPaperForRag,
        projectChat,
        addSource,
        closeOnboarding,
        openAboutModal,
        closeAboutModal,
        closeGapAnalysisModal,
        closeAnalysisModal,
        closeSynthesisModal,
        openDbFinder,
        closeDbFinder,
        closeSuggestionsModal,
    } = useStore();

    const sortedPapers = useMemo(() => {
        return [...papers].sort((a, b) => {
            const { key, direction } = sortConfig;
            const dir = direction === 'asc' ? 1 : -1;

            const getVal = (p: ResearchPaper, k: SortKey) => {
                switch(k) {
                    case 'relevance': return p.combinedScore;
                    case 'year': return p.year;
                    case 'citations': return p.citations;
                    case 'validationScore': return p.validation?.score;
                    case 'screeningFitScore': return p.screeningFitScore;
                    default: return 0;
                }
            };

            const aVal = getVal(a, key) ?? -1;
            const bVal = getVal(b, key) ?? -1;

            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
        });
    }, [papers, sortConfig]);

    const handleSortChange = (key: SortKey) => {
        setSortConfig(key);
    };

    const renderAppMode = () => {
        switch (appMode) {
            case 'dashboard':
                return <ResearcherDashboard
                            dataset={[]}
                            setDataset={() => {}}
                            testResults={[]}
                            runTestHarness={() => {}}
                            userStudyData={[]}
                            onStartUserStudy={() => setAppMode('evaluation')}
                        />;
            case 'evaluation':
                return <PaperVerificationApp
                            dataset={[]}
                            onComplete={() => {
                                alert('Study task complete! Thank you.');
                                setAppMode('dashboard');
                            }}
                        />;
            case 'review':
                return <SystematicReview />;
            case 'search':
            default:
                return (
                    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                            <main className={hasSearched ? "lg:col-span-3" : "lg:col-span-5"}>
                                {!hasSearched ? (
                                    <InitialSearchScreen query={query} onQueryChange={setQuery} onSearch={handleSearch} isLoading={isLoading} summaryLength={summaryLength} onLengthChange={useStore.setState} summaryStyle={summaryStyle} onStyleChange={useStore.setState} model={model} onModelChange={setModel} availableModels={AVAILABLE_MODELS} logAnalyticsEvent={() => {}} onOpenDbFinder={openDbFinder} searchSources={searchSources}>
                                        <ExtensionPromo />
                                    </InitialSearchScreen>
                                ) : (
                                    <div className="space-y-6">
                                        <SearchForm query={query} onQueryChange={setQuery} onSearch={handleSearch} isLoading={isLoading} summaryLength={summaryLength} onLengthChange={useStore.setState} summaryStyle={summaryStyle} onStyleChange={useStore.setState} model={model} onModelChange={setModel} availableModels={AVAILABLE_MODELS} logAnalyticsEvent={() => {}} />
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
                                                onSetScreeningMode={setScreeningMode}
                                                onScreenPaper={screenPaper}
                                                onAiRerank={aiRerank}
                                                isReranking={isReranking}
                                            />
                                        )}
                                    </div>
                                )}
                            </main>

                            {hasSearched && (
                                <aside className="lg:col-span-2">
                                <WorkspacePanel papers={papers} selectedPaper={selectedPaper} analysis={analysis} workspacePapers={workspacePapers} projects={projects} sources={[]} onToggleWorkspacePaper={toggleWorkspacePaper} onFindConnectedPapers={() => {}} isFindingConnected={false} onAnalyzePaper={analyzePaper} onCitePaper={openCitationModal} isAnalyzingPaper={isAnalyzingPaper} onConceptClick={conceptSearch} onFindDoi={() => {}} onGenerateSuggestions={generateSuggestions} isGeneratingSuggestions={isGeneratingSuggestions} onVerifyPaper={openVerificationModal} logAnalyticsEvent={() => {}} refinedQueries={[]} isGeneratingRefined={false} onRefinedQuerySearch={() => {}} onAnalyzeGaps={(papersToAnalyze, modelToUse) => analyzeGaps(papersToAnalyze, modelToUse)} onSynthesizeWorkspace={(papersToSynthesize, modelToUse) => synthesizeWorkspace(papersToSynthesize, modelToUse)} onCreateProject={createProject} onDeleteProject={deleteProject} onMovePaperToProject={movePaperToProject} onUpdateProjectColor={updateProjectColor} model={model} onIndexPaperForRag={indexPaperForRag} projectChats={projectChats} onProjectChat={projectChat} onUpload={useStore.getState().uploadPdf} isUploadingPdf={useStore.getState().isUploadingPdf} pdfUploadError={useStore.getState().pdfUploadError} />
                                </aside>
                            )}
                        </div>
                    </div>
                );
        }
    }

    return (
        <div className="min-h-screen bg-background text-foreground">
            <div className="absolute top-4 right-4 sm:top-6 sm:right-6 lg:top-8 lg:right-8 flex items-center gap-2 z-10">
                <AboutButton onClick={openAboutModal} />
                <HelpButton onClick={() => useStore.setState({ isOnboardingOpen: true })} />
                <button
                    onClick={() => setAppMode('review')}
                    className="px-4 py-2 text-sm font-medium text-white bg-gray-800 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
                >
                    Systematic Review
                </button>
                <DashboardToggleButton appMode={appMode} onModeChange={setAppMode} />
            </div>
            {renderAppMode()}

            {isOnboardingOpen && <OnboardingModal onComplete={closeOnboarding} onSkip={closeOnboarding} />}
            {isAboutModalOpen && <InfoModal isOpen={isAboutModalOpen} onClose={closeAboutModal} title="About AI Research Explorer"> <AboutModalContent /> </InfoModal>}
            <VerificationModal isOpen={isVerificationModalOpen} onClose={closeVerificationModal} paper={paperToVerify} onVerificationComplete={handleVerificationComplete} />
            <ReportModal isOpen={isGapAnalysisModalOpen} onClose={closeGapAnalysisModal} isLoading={isAnalyzingGaps} content={gapAnalysisResult} error={gapAnalysisError} />
            <PaperAnalysisModal isOpen={isAnalysisModalOpen} onClose={closeAnalysisModal} isLoading={isAnalyzingPaper} error={analysisError} result={analysisResult} onSaveAnalysis={saveAnalysis} isAnalysisSaved={!!analysisResult?.paper.savedAnalysis} />
            <SynthesisModal isOpen={isSynthesisModalOpen} onClose={closeSynthesisModal} isLoading={isSynthesizing} result={synthesisResult} error={synthesisError} />
            <CitationModal isOpen={isCitationModalOpen} onClose={closeCitationModal} paper={paperForCitation} model={model} />
            <DatabaseFinderModal isOpen={isDbFinderOpen} onClose={closeDbFinder} onAddSource={addSource} existingSources={searchSources} />
            <SuggestionsModal isOpen={isSuggestionsModalOpen} onClose={closeSuggestionsModal} result={suggestionsResult} isLoading={isGeneratingSuggestions} error={suggestionsError} onSuggestionClick={suggestionSearch} />
        </div>
    );
};

export default App;
