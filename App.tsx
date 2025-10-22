
import React, { useState, useCallback, useMemo, useEffect } from 'react';

// Services
import * as apiService from './services/apiService';
import * as geminiService from './services/geminiService';
import * as crossrefService from './services/crossrefService';
import { analyticsService } from './services/analyticsService';

// Types
import type {
  AdvancedSearchOptions,
  AnalysisResult,
  ChatMessage,
  ConnectedPaper,
  PaperAnalysis,
  ResearchPaper,
  SortConfig,
  SummaryLength,
  SummaryStyle,
  SearchSourceInfo,
} from './types';

// Components
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { FavoritesList } from './components/FavoritesList';
import { SearchResultFeedback } from './components/SearchResultFeedback';
import { AboutIcon } from './components/icons/AboutIcon';
import { InitialSearchScreen } from './components/InitialSearchScreen';
import { DetailsPanel } from './components/DetailsPanel';

// Modals and Buttons
import { ChatButton } from './components/ChatButton';
import { ChatModal } from './components/ChatModal';
import { CitationButton } from './components/CitationButton';
import { InfoModal } from './components/InfoModal';
import { CitationGenerator } from './components/CitationModal';
import { FeedbackButton } from './components/FeedbackButton';
import { FeedbackForm } from './components/FeedbackModal';
import { AnalyticsButton } from './components/AnalyticsButton';
import { AnalyticsDashboard } from './components/AnalyticsModal';
import { ConnectedPapersModal } from './components/ConnectedPapersModal';
import { PaperAnalysisModal } from './components/PaperAnalysisModal';
import { DatabaseFinderModal } from './components/DatabaseFinderModal';
import { SummaryFeedbackModal } from './components/SummaryFeedbackModal';
import { SuggestionsModal } from './components/SuggestionsModal';

const App: React.FC = () => {
  // Main search state
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);

  // Search options state
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });

  // UI/Modal states
  const [isChatModalOpen, setIsChatModalOpen] = useState(false);
  const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isDbFinderModalOpen, setIsDbFinderModalOpen] = useState(false);
  const [isSummaryFeedbackModalOpen, setIsSummaryFeedbackModalOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);


  // Chat state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  // Favorite papers state
  const [favoritePapers, setFavoritePapers] = useState<ResearchPaper[]>([]);

  // Per-paper action states
  const [connectedPapersResult, setConnectedPapersResult] = useState<{ seedPaper: ResearchPaper, connections: ConnectedPaper[] } | null>(null);
  const [isFindingConnected, setIsFindingConnected] = useState(false);
  const [connectedPapersError, setConnectedPapersError] = useState<string | null>(null);

  const [paperAnalysisResult, setPaperAnalysisResult] = useState<{ paper: ResearchPaper, analysis: PaperAnalysis } | null>(null);
  const [isAnalyzingPaper, setIsAnalyzingPaper] = useState(false);
  const [paperAnalysisError, setPaperAnalysisError] = useState<string | null>(null);
  
  const [suggestionsResult, setSuggestionsResult] = useState<{ seedPaper: ResearchPaper, suggestions: string[] } | null>(null);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

  const [sources, setSources] = useState<SearchSourceInfo[]>([]);

  // Get user location and check for admin status
  useEffect(() => {
    // Check for admin flag in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        setIsAdmin(true);
    }

    // Get user location for maps grounding
    navigator.geolocation.getCurrentPosition(
        (position) => setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
        (err) => console.warn(`Could not get location: ${err.message}`)
    );
  }, []);

  const logAnalyticsEvent = useCallback((eventName: string, payload: object) => {
    analyticsService.logEvent(eventName, payload);
  }, []);

  const handleSearch = useCallback(async (currentQuery: string, options: AdvancedSearchOptions) => {
    if (!currentQuery.trim()) return;
    setHasSearched(true);
    setIsLoading(true);
    setError(null);
    setPapers([]);
    setSummary('');
    setAnalysis(null);
    setSelectedPaper(null);
    logAnalyticsEvent('search_started', { query: currentQuery, options });

    try {
      const enhancedQuery = await geminiService.enhanceSearchQuery(currentQuery);
      setQuery(enhancedQuery.refined_query); // Update query to the enhanced one
      const result = await apiService.search(enhancedQuery.refined_query, options, summaryLength, summaryStyle);
      setPapers(result.papers);
      setSummary(result.summary);
      setAnalysis(result.analysis);
      if (result.papers.length > 0) {
        handleSelectPaper(result.papers[0]);
      }
      logAnalyticsEvent('search_success', { query: currentQuery, resultsCount: result.papers.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      logAnalyticsEvent('search_failed', { query: currentQuery, error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [summaryLength, summaryStyle, logAnalyticsEvent]);
  
  const sortedPapers = useMemo(() => {
    return [...papers].sort((a, b) => {
        if (sortConfig.key === 'relevance') return 0; // Keep original order
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [papers, sortConfig]);

  const handleSelectPaper = useCallback((paper: ResearchPaper) => {
    setSelectedPaper(paper);
    if (!paper.keyConcepts) {
        setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, keyConceptsState: 'loading' } : p));
        geminiService.extractKeyConcepts(paper.abstract)
            .then(concepts => setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, keyConcepts: concepts, keyConceptsState: 'loaded' } : p)))
            .catch(() => setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, keyConceptsState: 'error' } : p)));
    }
    logAnalyticsEvent('paper_selected', { title: paper.title });
  }, [logAnalyticsEvent]);

  const handleToggleFavorite = useCallback((paper: ResearchPaper) => {
    setFavoritePapers(prev => {
        const isFav = prev.some(p => p.title === paper.title);
        if (isFav) {
            logAnalyticsEvent('paper_unfavorited', { title: paper.title });
            return prev.filter(p => p.title !== paper.title);
        } else {
            logAnalyticsEvent('paper_favorited', { title: paper.title });
            return [...prev, paper];
        }
    });
  }, [logAnalyticsEvent]);

  const handleSendMessage = useCallback(async (message: string) => {
    const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory);
    setIsChatLoading(true);
    setChatError(null);
    logAnalyticsEvent('chat_message_sent', { message });

    try {
      const response = await geminiService.chatWithResults(newHistory, papers, location);
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: response.text }], sources: response.sources };
      setChatHistory(prev => [...prev, modelMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setChatError(errorMessage);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatHistory, papers, location, logAnalyticsEvent]);

  const handleVerifyPaper = useCallback(async (paper: ResearchPaper) => {
    setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, verification: { state: 'verifying' } } : p));
    try {
        const status = await geminiService.verifyPaper(paper);
        setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, verification: status, pdfURL: status.pdfURL || p.pdfURL } : p));
    } catch (err) {
        setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, verification: { state: 'error', reason: 'Verification failed' } } : p));
    }
  }, []);
  
  const handleFindConnectedPapers = useCallback(async (paper: ResearchPaper) => {
      setIsFindingConnected(true);
      setConnectedPapersError(null);
      setConnectedPapersResult(null);
      try {
          const result = await geminiService.findConnectedPapers(paper);
          setConnectedPapersResult(result);
      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setConnectedPapersError(errorMessage);
          setConnectedPapersResult({ seedPaper: paper, connections: [] }); // Still open modal with error
      } finally {
          setIsFindingConnected(false);
      }
  }, []);

  const handleAnalyzePaper = useCallback(async (paper: ResearchPaper) => {
      setIsAnalyzingPaper(true);
      setPaperAnalysisError(null);
      setPaperAnalysisResult(null);
      try {
          const analysisResult = await geminiService.analyzeSinglePaper(paper);
          setPaperAnalysisResult({ paper, analysis: analysisResult });
      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setPaperAnalysisError(errorMessage);
          setPaperAnalysisResult({ paper, analysis: { researchQuestion: '', methodology: '', keyFindings: [], limitations: [] } });
      } finally {
          setIsAnalyzingPaper(false);
      }
  }, []);
  
  const handleGenerateSuggestions = useCallback(async (paper: ResearchPaper) => {
    setIsGeneratingSuggestions(true);
    setSuggestionsError(null);
    setSuggestionsResult({ seedPaper: paper, suggestions: [] }); // Open modal immediately with loading state
    try {
        const suggestions = await geminiService.generatePaperBasedSuggestions(paper);
        setSuggestionsResult({ seedPaper: paper, suggestions });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setSuggestionsError(errorMessage);
    } finally {
        setIsGeneratingSuggestions(false);
    }
  }, []);

  const handleSuggestionSearch = useCallback((newQuery: string) => {
      setSuggestionsResult(null); // Close modal
      setQuery(newQuery);
      handleSearch(newQuery, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
  }, [handleSearch]);

  const handleFindDoi = useCallback(async (paper: ResearchPaper) => {
    setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, doiState: 'loading' } : p));
    try {
      const doi = await crossrefService.findDoiForPaper(paper);
      setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, doi: doi || undefined, doiState: 'loaded' } : p));
    } catch (err) {
      setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, doiState: 'error' } : p));
    }
  }, []);
  
  // FIX: Wrapped handleConceptClick in useCallback to prevent unnecessary re-renders.
  const handleConceptClick = useCallback((concept: string) => {
    setQuery(concept);
    handleSearch(concept, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
  }, [handleSearch]);
  
  // FIX: Wrapped handleAddSource in useCallback to prevent unnecessary re-renders and use the latest `sources` state.
  const handleAddSource = useCallback((source: SearchSourceInfo) => {
    if (!sources.some(s => s.id === source.id)) {
        setSources(prev => [...prev, source]);
    }
  }, [sources]);

  // FIX: Wrapped handleNewSearch in useCallback as it's a stable function that only uses state setters.
  const handleNewSearch = useCallback(() => {
    setHasSearched(false);
    setPapers([]);
    setSummary('');
    setAnalysis(null);
    setSelectedPaper(null);
    setQuery('');
    setError(null);
  }, []);

  return (
    <div className="bg-gray-50 min-h-screen font-sans">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <AboutIcon className="w-8 h-8 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">AI Research Explorer</h1>
              <p className="text-sm text-gray-500">Your intelligent gateway to academic literature.</p>
            </div>
          </div>
          {hasSearched ? (
            <button onClick={handleNewSearch} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                New Search
            </button>
          ) : (
            <button onClick={() => setIsAboutModalOpen(true)} className="text-sm font-medium text-blue-600 hover:text-blue-800">
                About
            </button>
          )}
        </div>
      </header>

      <main className="max-w-screen-2xl mx-auto p-4 sm:p-6 lg:p-8">
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
                logAnalyticsEvent={logAnalyticsEvent}
            />
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Search & Results */}
                <div className="lg:col-span-5 space-y-6">
                    <SearchForm
                        query={query}
                        onQueryChange={setQuery}
                        onSearch={handleSearch}
                        isLoading={isLoading}
                        summaryLength={summaryLength}
                        onLengthChange={setSummaryLength}
                        summaryStyle={summaryStyle}
                        onStyleChange={setSummaryStyle}
                        logAnalyticsEvent={logAnalyticsEvent}
                    />
                    <FavoritesList favoritePapers={favoritePapers} onToggleFavorite={handleToggleFavorite} />
                    <div className="p-4 bg-white rounded-lg shadow-sm border">
                        <button onClick={() => setIsDbFinderModalOpen(true)} className="w-full text-center text-sm font-medium text-blue-600 hover:text-blue-800">Find More Databases</button>
                    </div>
                    {isLoading && <LoadingSpinner message="Searching for papers..." />}
                    {error && <ErrorMessage message={error} />}
                    {!isLoading && !error && papers.length > 0 && (
                        <div>
                            <ResultsDisplay
                                papers={sortedPapers}
                                selectedPaper={selectedPaper}
                                onSelectPaper={handleSelectPaper}
                                sortConfig={sortConfig}
                                onSortChange={setSortConfig}
                            />
                            <SearchResultFeedback query={query} onOpenFeedbackModal={() => setIsSummaryFeedbackModalOpen(true)} />
                        </div>
                    )}
                </div>

                {/* Right Column: Details Panel */}
                <div className="lg:col-span-7">
                    <DetailsPanel
                        selectedPaper={selectedPaper}
                        summary={summary}
                        analysis={analysis}
                        isFavorite={selectedPaper ? favoritePapers.some(p => p.title === selectedPaper.title) : false}
                        onToggleFavorite={handleToggleFavorite}
                        onFindConnectedPapers={handleFindConnectedPapers}
                        isFindingConnected={isFindingConnected}
                        onAnalyzePaper={handleAnalyzePaper}
                        isAnalyzingPaper={isAnalyzingPaper}
                        onVerifyPaper={handleVerifyPaper}
                        isVerifying={!!selectedPaper?.verification && selectedPaper.verification.state === 'verifying'}
                        onConceptClick={handleConceptClick}
                        onFindDoi={handleFindDoi}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                    />
                </div>
            </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col items-center gap-4 z-30">
        {isAdmin && <AnalyticsButton onClick={() => setIsAnalyticsModalOpen(true)} />}
        <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
        <CitationButton onClick={() => setIsCitationModalOpen(true)} disabled={papers.length === 0} />
        <ChatButton onClick={() => setIsChatModalOpen(true)} disabled={papers.length === 0} />
      </div>

      {/* Modals */}
      <ChatModal
        isOpen={isChatModalOpen}
        onClose={() => setIsChatModalOpen(false)}
        history={chatHistory}
        isLoading={isChatLoading}
        error={chatError}
        onSendMessage={handleSendMessage}
      />
      
       <InfoModal
          isOpen={isCitationModalOpen}
          onClose={() => setIsCitationModalOpen(false)}
          title="Citation Generator"
      >
          <CitationGenerator
              papers={papers}
              onGenerate={() => { /* Handled internally now */}}
              isLoading={false}
              citations={[]}
              error={null}
              citationStyle="apa"
              onStyleChange={() => {}}
          />
      </InfoModal>


      <InfoModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        title="Provide Feedback"
      >
        <FeedbackForm onSubmit={(feedback) => logAnalyticsEvent('feedback_submitted', feedback)} />
      </InfoModal>

      <InfoModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        title="Analytics Dashboard"
      >
        <AnalyticsDashboard />
      </InfoModal>

      <ConnectedPapersModal
          result={connectedPapersResult}
          onClose={() => setConnectedPapersResult(null)}
          error={connectedPapersError}
      />
      <PaperAnalysisModal
          result={paperAnalysisResult}
          onClose={() => setPaperAnalysisResult(null)}
          error={paperAnalysisError}
      />

      <DatabaseFinderModal
        isOpen={isDbFinderModalOpen}
        onClose={() => setIsDbFinderModalOpen(false)}
        onAddSource={handleAddSource}
        findDatabasesForField={geminiService.findDatabasesForField}
        existingSources={sources}
      />
      
       <InfoModal isOpen={isAboutModalOpen} onClose={() => setIsAboutModalOpen(false)} title="About AI Research Explorer">
          <div className="space-y-4">
              <p>This application is an advanced research tool designed to accelerate literature reviews and knowledge discovery. By leveraging the power of Google's Gemini models, it goes beyond simple keyword searching to provide a rich, contextual understanding of academic landscapes.</p>
              <h3 className="font-bold">Core Features:</h3>
              <ul className="list-disc list-inside">
                  <li><strong>Enhanced Search:</strong> User queries are refined by an AI librarian to create more effective search terms for academic databases like OpenAlex.</li>
                  <li><strong>AI-Generated Summaries:</strong> Get a quick overview of search results with summaries generated in various styles (paragraph, bullets, Q&A).</li>
                  <li><strong>Thematic Analysis:</strong> Automatically identifies and clusters papers into thematic groups, helping you see the bigger picture.</li>
                  <li><strong>Interactive Chat:</strong> Ask follow-up questions about your search results and get answers grounded in the provided papers.</li>
                  <li><strong>Paper Deep-Dive:</strong> For any paper, you can find connected works (citations, derivatives), perform a structured analysis, and verify its source.</li>
                  <li><strong>Citation Management:</strong> Generate formatted citations in multiple styles and export them for use in tools like Zotero.</li>
              </ul>
              <p>This tool is a demonstration of how generative AI can be applied to create more powerful and intuitive research workflows.</p>
          </div>
       </InfoModal>

        <SummaryFeedbackModal
            isOpen={isSummaryFeedbackModalOpen}
            onClose={() => setIsSummaryFeedbackModalOpen(false)}
            onSubmit={(feedback) => logAnalyticsEvent('summary_feedback_provided', { ...feedback, query })}
        />

        <SuggestionsModal
            result={suggestionsResult}
            onClose={() => setSuggestionsResult(null)}
            error={suggestionsError}
            isLoading={isGeneratingSuggestions}
            onSuggestionClick={handleSuggestionSearch}
        />
    </div>
  );
};

export default App;
