
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';

// Services
import * as apiService from './services/apiService';
import * as geminiService from './services/geminiService';
import * as crossrefService from './services/crossrefService';
import { analyticsService } from './services/analyticsService';
import * as extensionService from './services/extensionService';

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
import { ExtensionPromo } from './components/ExtensionPromo';

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
import { ReportButton } from './components/ReportButton';
import { ReportModal } from './components/ReportModal';

const App: React.FC = () => {
  // Main search state
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [executedQuery, setExecutedQuery] = useState('');
  const [originalQuery, setOriginalQuery] = useState('');

  // Search options state
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });
  const [lastSearchOptions, setLastSearchOptions] = useState<AdvancedSearchOptions>({ startYear: '', endYear: '', authors: '', excludeKeywords: '' });

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
  
  // Relevance feedback state
  const [irrelevantPaperTitles, setIrrelevantPaperTitles] = useState<Set<string>>(new Set());

  // Favorite papers state
  const [favoritePapers, setFavoritePapers] = useState<ResearchPaper[]>([]);
  
  // Bibliography generation state
  const [papersForCitation, setPapersForCitation] = useState<Set<string>>(new Set());

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

  // Research Gap Analysis state
  const [isGapAnalysisModalOpen, setIsGapAnalysisModalOpen] = useState(false);
  const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
  const [gapAnalysisContent, setGapAnalysisContent] = useState<string | null>(null);
  const [gapAnalysisError, setGapAnalysisError] = useState<string | null>(null);

  const [sources, setSources] = useState<SearchSourceInfo[]>([]);
  const initialSearchHandled = useRef(false);

  // State for AI-generated refined queries
  const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
  const [isGeneratingRefined, setIsGeneratingRefined] = useState(false);

  // check for admin status
  useEffect(() => {
    // Check for admin flag in URL
    const params = new URLSearchParams(window.location.search);
    if (params.get('admin') === 'true') {
        setIsAdmin(true);
    }
  }, []);

  // Load favorites from local storage on initial mount
  useEffect(() => {
      try {
          const storedFavorites = localStorage.getItem('favoritePapers');
          if (storedFavorites) {
              setFavoritePapers(JSON.parse(storedFavorites));
          }
      } catch (e) {
          console.error("Failed to load favorites from localStorage", e);
      }
  }, []);

  // Sync favorites to local storage whenever they change
  useEffect(() => {
      try {
          localStorage.setItem('favoritePapers', JSON.stringify(favoritePapers));
      } catch (e) {
          console.error("Failed to save favorites to localStorage", e);
      }
  }, [favoritePapers]);

  // Listen for messages from the browser extension
  useEffect(() => {
      const cleanup = extensionService.listenForExtensionMessages(
          (savedPaper) => {
              // Add or update paper in favorites
              setFavoritePapers(prev => {
                  const paperId = extensionService.createPaperId(savedPaper);
                  const existingIndex = prev.findIndex(p => extensionService.createPaperId(p) === paperId);
                  if (existingIndex > -1) {
                      const updated = [...prev];
                      updated[existingIndex] = savedPaper;
                      return updated;
                  }
                  return [savedPaper, ...prev];
              });
          },
          (removedPaperId) => {
              // Remove paper from favorites
              setFavoritePapers(prev => prev.filter(p => extensionService.createPaperId(p) !== removedPaperId));
          }
      );
      
      return cleanup;
  }, []);

  const logAnalyticsEvent = useCallback((eventName: string, payload: object) => {
    analyticsService.logEvent(eventName, payload);
  }, []);

  // Handle content shared to the app via Web Share Target API
  useEffect(() => {
    if (initialSearchHandled.current) return;

    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const text = params.get('text');
    const url = params.get('url');

    // Combine title and text for a more robust query, use URL as fallback.
    const sharedQuery = [title, text].filter(Boolean).join(' ').trim() || url;

    if (sharedQuery) {
      initialSearchHandled.current = true;
      logAnalyticsEvent('shared_content_received', { source: 'web_share_target', query: sharedQuery });
      
      // Update the input field and trigger the search
      setQuery(sharedQuery);
      handleSearch(sharedQuery, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
      
      // Clean the URL to avoid re-triggering on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [logAnalyticsEvent]);

  // FIX: Moved handleSelectPaper before executeSearch as it is a dependency of executeSearch.
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

  const executeSearch = useCallback(async (currentQuery: string, options: AdvancedSearchOptions, bypassEnhancement = false) => {
    if (!currentQuery.trim()) return;
    setHasSearched(true);
    setIsLoading(true);
    setError(null);
    setPapers([]);
    setSummary('');
    setAnalysis(null);
    setSelectedPaper(null);
    setLastSearchOptions(options);
    setPapersForCitation(new Set());
    setOriginalQuery(currentQuery);
    logAnalyticsEvent('search_started', { query: currentQuery, options, enhanced: !bypassEnhancement });
    
    setIsGeneratingRefined(true);
    setRefinedQueries([]);
    geminiService.generateRefinedQueries(currentQuery)
      .then(queries => setRefinedQueries(queries))
      .finally(() => setIsGeneratingRefined(false));

    try {
      let queryToExecute = currentQuery;
      if (!bypassEnhancement) {
        const enhancedQuery = await geminiService.enhanceSearchQuery(currentQuery);
        queryToExecute = enhancedQuery.refined_query;
      }
      setExecutedQuery(queryToExecute);
      
      const result = await apiService.search(queryToExecute, options, summaryLength, summaryStyle);
      setPapers(result.papers);
      setSummary(result.summary);
      setAnalysis(result.analysis);
      if (result.papers.length > 0) {
        handleSelectPaper(result.papers[0]);
      }
      logAnalyticsEvent('search_success', { query: queryToExecute, resultsCount: result.papers.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      logAnalyticsEvent('search_failed', { query: currentQuery, error: errorMessage });
    } finally {
      setIsLoading(false);
    }
  }, [summaryLength, summaryStyle, logAnalyticsEvent, handleSelectPaper]);

  const handleSearch = useCallback((currentQuery: string, options: AdvancedSearchOptions) => {
      setIrrelevantPaperTitles(new Set());
      executeSearch(currentQuery, options, false);
  }, [executeSearch]);
  
  const handleOriginalSearch = useCallback(() => {
      if (originalQuery) {
          executeSearch(originalQuery, lastSearchOptions, true);
          logAnalyticsEvent('original_query_search_triggered', { query: originalQuery });
      }
  }, [executeSearch, originalQuery, lastSearchOptions, logAnalyticsEvent]);

  const papersWithRelevance = useMemo(() => {
    return papers.map(p => ({ ...p, isIrrelevant: irrelevantPaperTitles.has(p.title) }));
  }, [papers, irrelevantPaperTitles]);
  
  const sortedPapers = useMemo(() => {
    const relevantPapers = papersWithRelevance.filter(p => !p.isIrrelevant);
    const irrelevantPapers = papersWithRelevance.filter(p => p.isIrrelevant);

    const sortedRelevant = [...relevantPapers].sort((a, b) => {
        if (sortConfig.key === 'relevance') return 0; // Keep original order
        const aVal = a[sortConfig.key] || 0;
        const bVal = b[sortConfig.key] || 0;
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    return [...sortedRelevant, ...irrelevantPapers];
  }, [papersWithRelevance, sortConfig]);

  const handleToggleFavorite = useCallback((paper: ResearchPaper) => {
    const paperId = extensionService.createPaperId(paper);
    let isNowFavorite = false;
    
    setFavoritePapers(prev => {
        const isCurrentlyFav = prev.some(p => extensionService.createPaperId(p) === paperId);
        if (isCurrentlyFav) {
            logAnalyticsEvent('paper_unfavorited', { title: paper.title });
            isNowFavorite = false;
            return prev.filter(p => extensionService.createPaperId(p) !== paperId);
        } else {
            logAnalyticsEvent('paper_favorited', { title: paper.title });
            isNowFavorite = true;
            return [...prev, paper];
        }
    });
    
    // Notify the extension about the change
    extensionService.notifyExtensionFavoriteToggled(paper, isNowFavorite);
  }, [logAnalyticsEvent]);

  const handleSendMessage = useCallback(async (message: string) => {
    const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
    const newHistory = [...chatHistory, userMessage];
    setChatHistory(newHistory);
    setIsChatLoading(true);
    setChatError(null);
    logAnalyticsEvent('chat_message_sent', { message });

    try {
      const response = await geminiService.chatWithResults(newHistory, papers);
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: response.text }], sources: response.sources };
      setChatHistory(prev => [...prev, modelMessage]);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setChatError(errorMessage);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatHistory, papers, logAnalyticsEvent]);

  const handleVerifyPaper = useCallback(async (paper: ResearchPaper) => {
    setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, verification: { state: 'verifying' } } : p));
    try {
        let status = await geminiService.verifyPaper(paper);

        // If verified but the link is bad or missing, try to find a better one via DOI as a fallback.
        if (status.state === 'verified' && (!status.pdfURL || status.linkState === 'paywalled' || status.linkState === 'invalid')) {
            // Use existing DOI if available, otherwise fetch it.
            const doi = paper.doi || await crossrefService.findDoiForPaper(paper);
            
            if (doi) {
                 // Update paper with DOI if it was newly found, so the user sees it.
                if (!paper.doi) {
                    setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, doi: doi, doiState: 'loaded' } : p));
                }

                const doiUrl = `https://doi.org/${doi}`;
                
                // Only perform the check if the new URL is different from the one we already have.
                if (doiUrl !== status.pdfURL) {
                    const checkResult = await geminiService.checkPdfUrl(doiUrl);
                    
                    // If the new link is 'valid' (a direct PDF), it's definitely an improvement.
                    if (checkResult.linkState === 'valid') {
                        status = {
                            ...status,
                            pdfURL: doiUrl,
                            linkState: 'valid',
                            reason: `Found direct PDF via DOI lookup. ${checkResult.reason}`
                        };
                    }
                }
            }
        }

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
  
  const handleConceptClick = useCallback((concept: string) => {
    setQuery(concept);
    handleSearch(concept, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
  }, [handleSearch]);
  
  const handleAddSource = useCallback((source: SearchSourceInfo) => {
    if (!sources.some(s => s.id === source.id)) {
        setSources(prev => [...prev, source]);
    }
  }, [sources]);

  const handleNewSearch = useCallback(() => {
    setHasSearched(false);
    setPapers([]);
    setSummary('');
    setAnalysis(null);
    setSelectedPaper(null);
    setQuery('');
    setError(null);
    setIrrelevantPaperTitles(new Set());
    setPapersForCitation(new Set());
    setExecutedQuery('');
    setOriginalQuery('');
  }, []);

  const handleMarkAsIrrelevant = useCallback((paperToMark: ResearchPaper) => {
    logAnalyticsEvent('paper_marked_irrelevant', { title: paperToMark.title });
    
    // Immediately update UI for responsiveness by adding the paper's title to the set.
    setIrrelevantPaperTitles(prev => new Set(prev).add(paperToMark.title));
  }, [logAnalyticsEvent]);
  
  const handleRefineSearch = useCallback(async () => {
    if (irrelevantPaperTitles.size === 0) return;

    logAnalyticsEvent('rerun_search_with_feedback', { count: irrelevantPaperTitles.size });

    try {
        const irrelevantPapers = papers.filter(p => irrelevantPaperTitles.has(p.title));
        
        // Ensure key concepts are available for all irrelevant papers
        const conceptPromises = irrelevantPapers.map(async (paper) => {
            if (paper.keyConcepts) {
                return paper.keyConcepts;
            }
            try {
                const concepts = await geminiService.extractKeyConcepts(paper.abstract);
                // Update paper in state with new concepts for caching
                setPapers(prev => prev.map(p => p.title === paper.title ? { ...p, keyConcepts: concepts, keyConceptsState: 'loaded' } : p));
                return concepts;
            } catch (e) {
                console.error(`Failed to extract concepts for ${paper.title}`, e);
                return []; // Return empty array on failure for this paper
            }
        });

        const allConceptsNested = await Promise.all(conceptPromises);
        const allConcepts = allConceptsNested.flat();

        // Combine new concepts with existing exclusion keywords, ensuring uniqueness
        const currentExcludes = new Set((lastSearchOptions.excludeKeywords || '').split(',').map(k => k.trim()).filter(Boolean));
        allConcepts.forEach(c => currentExcludes.add(c.trim().toLowerCase()));
        const newExcludeKeywords = Array.from(currentExcludes).join(',');
        
        // Trigger a refined search
        const newOptions = { ...lastSearchOptions, excludeKeywords: newExcludeKeywords };
        executeSearch(query, newOptions);

    } catch (err) {
        console.error("Failed to refine search:", err);
        setError("Failed to refine search based on your feedback. Please try again.");
    }
  }, [papers, irrelevantPaperTitles, lastSearchOptions, executeSearch, query, logAnalyticsEvent]);
  
  const handleRefinedQuerySearch = useCallback((newQuery: string) => {
      setQuery(newQuery);
      // Use last search options, but clear exclude keywords as it's a new conceptual search
      const newOptions = { ...lastSearchOptions, excludeKeywords: '' };
      handleSearch(newQuery, newOptions);
      logAnalyticsEvent('refined_query_search', { query: newQuery });
  }, [handleSearch, lastSearchOptions, logAnalyticsEvent]);

  const handleAnalyzeGaps = useCallback(async () => {
    setIsGapAnalysisModalOpen(true);
    setIsAnalyzingGaps(true);
    setGapAnalysisContent(null);
    setGapAnalysisError(null);

    const relevantPapers = papers.filter(p => !irrelevantPaperTitles.has(p.title));
    if (relevantPapers.length < 2) {
        setGapAnalysisError("Please perform a search with at least two relevant results to analyze for research gaps.");
        setIsAnalyzingGaps(false);
        return;
    }

    logAnalyticsEvent('gap_analysis_started', { paperCount: relevantPapers.length });

    try {
        const report = await geminiService.analyzeResearchGaps(relevantPapers);
        setGapAnalysisContent(report);
        logAnalyticsEvent('gap_analysis_success', { reportLength: report.length });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setGapAnalysisError(errorMessage);
        logAnalyticsEvent('gap_analysis_failed', { error: errorMessage });
    } finally {
        setIsAnalyzingGaps(false);
    }
  }, [papers, irrelevantPaperTitles, logAnalyticsEvent]);

  const selectedPaperFromList = useMemo(() => {
    if (!selectedPaper) {
        return null;
    }
    // Find the most up-to-date version of the paper from the main 'papers' state
    return papers.find(p => p.title === selectedPaper.title) ?? selectedPaper;
  }, [selectedPaper, papers]);

  const handleTogglePaperForCitation = useCallback((paper: ResearchPaper) => {
    setPapersForCitation(prev => {
        const newSet = new Set(prev);
        if (newSet.has(paper.title)) {
            newSet.delete(paper.title);
        } else {
            newSet.add(paper.title);
        }
        return newSet;
    });
  }, []);

  const handleSelectAllForCitation = useCallback(() => {
      const relevantPaperTitles = papers.filter(p => !p.isIrrelevant).map(p => p.title);
      if (papersForCitation.size === relevantPaperTitles.length) {
          setPapersForCitation(new Set()); // Deselect all
      } else {
          setPapersForCitation(new Set(relevantPaperTitles)); // Select all relevant
      }
  }, [papers, papersForCitation, irrelevantPaperTitles]);

  const selectedPapersForCitation = useMemo(() => {
    return papers.filter(p => papersForCitation.has(p.title));
  }, [papers, papersForCitation]);


  return (
    <div className="bg-background min-h-screen font-sans">
      <header className="bg-card border-b border-border sticky top-0 z-20">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <AboutIcon className="w-8 h-8 text-primary" />
            <div>
              <h1 className="text-xl font-bold text-foreground">AI Research Explorer</h1>
              <p className="text-sm text-muted-foreground">Your intelligent gateway to academic literature.</p>
            </div>
          </div>
          {hasSearched ? (
            <button onClick={handleNewSearch} className="text-sm font-medium text-primary hover:underline">
                New Search
            </button>
          ) : (
            <button onClick={() => setIsAboutModalOpen(true)} className="text-sm font-medium text-primary hover:underline">
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
            >
              <ExtensionPromo />
            </InitialSearchScreen>
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
                        excludeKeywords={lastSearchOptions.excludeKeywords}
                        hideSuggestions={true}
                    />
                    <FavoritesList favoritePapers={favoritePapers} onToggleFavorite={handleToggleFavorite} />
                    <div className="p-4 bg-card rounded-lg shadow-sm border">
                        <button onClick={() => setIsDbFinderModalOpen(true)} className="w-full text-center text-sm font-medium text-primary hover:underline">Find More Databases</button>
                    </div>
                    {isLoading && <LoadingSpinner message="Refining search results..." />}
                    {error && <ErrorMessage message={error} />}
                    {!isLoading && !error && papers.length > 0 && (
                        <div>
                             <div className="p-3 mb-4 bg-muted/50 rounded-lg border text-sm">
                                <p className="text-muted-foreground">Showing results for:</p>
                                <p className="font-mono text-primary my-1 break-words">{executedQuery}</p>
                                {executedQuery !== originalQuery && originalQuery && (
                                    <button onClick={handleOriginalSearch} className="font-semibold text-primary hover:underline">
                                        Search instead for: <span className="font-normal italic">"{originalQuery}"</span>
                                    </button>
                                )}
                            </div>
                            <ResultsDisplay
                                papers={sortedPapers}
                                selectedPaper={selectedPaperFromList}
                                onSelectPaper={handleSelectPaper}
                                sortConfig={sortConfig}
                                onSortChange={setSortConfig}
                                onMarkAsIrrelevant={handleMarkAsIrrelevant}
                                onRefineSearch={handleRefineSearch}
                                papersForCitation={papersForCitation}
                                onTogglePaperForCitation={handleTogglePaperForCitation}
                                onSelectAllForCitation={handleSelectAllForCitation}
                            />
                            <SearchResultFeedback query={query} onOpenFeedbackModal={() => setIsSummaryFeedbackModalOpen(true)} />
                        </div>
                    )}
                </div>

                {/* Right Column: Details Panel */}
                <div className="lg:col-span-7">
                    <DetailsPanel
                        selectedPaper={selectedPaperFromList}
                        summary={summary}
                        analysis={analysis}
                        isFavorite={selectedPaperFromList ? favoritePapers.some(p => extensionService.createPaperId(p) === extensionService.createPaperId(selectedPaperFromList)) : false}
                        onToggleFavorite={handleToggleFavorite}
                        onFindConnectedPapers={handleFindConnectedPapers}
                        isFindingConnected={isFindingConnected}
                        onAnalyzePaper={handleAnalyzePaper}
                        isAnalyzingPaper={isAnalyzingPaper}
                        onVerifyPaper={handleVerifyPaper}
                        isVerifying={!!selectedPaperFromList?.verification && selectedPaperFromList.verification.state === 'verifying'}
                        onConceptClick={handleConceptClick}
                        onFindDoi={handleFindDoi}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                        logAnalyticsEvent={logAnalyticsEvent}
                        refinedQueries={refinedQueries}
                        isGeneratingRefined={isGeneratingRefined}
                        onRefinedQuerySearch={handleRefinedQuerySearch}
                    />
                </div>
            </div>
        )}
      </main>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-6 right-6 flex flex-col items-center gap-4 z-30">
        {isAdmin && <AnalyticsButton onClick={() => setIsAnalyticsModalOpen(true)} />}
        <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
        <ReportButton onClick={handleAnalyzeGaps} disabled={papers.length < 2} />
        <CitationButton onClick={() => setIsCitationModalOpen(true)} disabled={papersForCitation.size === 0} />
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
          title="Bibliography Generator"
      >
          <CitationGenerator papers={selectedPapersForCitation} />
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

        <ReportModal
          isOpen={isGapAnalysisModalOpen}
          onClose={() => setIsGapAnalysisModalOpen(false)}
          isLoading={isAnalyzingGaps}
          content={gapAnalysisContent}
          error={gapAnalysisError}
        />
    </div>
  );
};

export default App;
