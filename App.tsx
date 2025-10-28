
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
  ConnectedPaper,
  PaperAnalysis,
  Project,
  ResearchPaper,
  SortConfig,
  SummaryLength,
  SummaryStyle,
  SearchSourceInfo,
  SynthesisResult,
} from './types';

// Components
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { AboutIcon } from './components/icons/AboutIcon';
import { InitialSearchScreen } from './components/InitialSearchScreen';
import { ExtensionPromo } from './components/ExtensionPromo';
import { WorkspacePanel } from './components/WorkspacePanel';
import { SearchResultFeedback } from './components/SearchResultFeedback';

// Modals and Buttons
import { InfoModal } from './components/InfoModal';
import { FeedbackButton } from './components/FeedbackButton';
import { FeedbackForm } from './components/FeedbackModal';
import { ConnectedPapersModal } from './components/ConnectedPapersModal';
import { PaperAnalysisModal } from './components/PaperAnalysisModal';
import { DatabaseFinderModal } from './components/DatabaseFinderModal';
import { SummaryFeedbackModal } from './components/SummaryFeedbackModal';
import { SuggestionsModal } from './components/SuggestionsModal';
import { ReportModal } from './components/ReportModal';
import { SynthesisModal } from './components/SynthesisModal';
import { Toast } from './components/Toast';

const PROJECT_COLORS = ['sky', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo', 'teal'];

const App: React.FC = () => {
  // Main search state
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [executedQuery, setExecutedQuery] = useState('');
  const [originalQuery, setOriginalQuery] = useState('');

  // Search options state
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });
  const [lastSearchOptions, setLastSearchOptions] = useState<AdvancedSearchOptions>({ startYear: '', endYear: '', authors: '', excludeKeywords: '' });
  const [showHighRelevanceOnly, setShowHighRelevanceOnly] = useState(false);


  // UI/Modal states
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
  const [isDbFinderModalOpen, setIsDbFinderModalOpen] = useState(false);
  const [isSummaryFeedbackModalOpen, setIsSummaryFeedbackModalOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Workspace state
  const [workspacePapers, setWorkspacePapers] = useState<ResearchPaper[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  
  // Per-paper action states
  const [connectedPapersResult, setConnectedPapersResult] = useState<{ seedPaper: ResearchPaper, connections: ConnectedPaper[] } | null>(null);
  const [isFindingConnected, setIsFindingConnected] = useState(false);
  const [paperBeingConnected, setPaperBeingConnected] = useState<string | null>(null);
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
  
  // Synthesis state
  const [isSynthesisModalOpen, setIsSynthesisModalOpen] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
  const [synthesisError, setSynthesisError] = useState<string | null>(null);

  const [sources, setSources] = useState<SearchSourceInfo[]>([]);
  const initialSearchHandled = useRef(false);

  // State for AI-generated refined queries
  const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
  const [isGeneratingRefined, setIsGeneratingRefined] = useState(false);

  // Load workspace from local storage on initial mount
  useEffect(() => {
      try {
          const storedWorkspace = localStorage.getItem('workspacePapers');
          const storedProjects = localStorage.getItem('workspaceProjects');
          if (storedWorkspace) setWorkspacePapers(JSON.parse(storedWorkspace));
          if (storedProjects) setProjects(JSON.parse(storedProjects));
      } catch (e) {
          console.error("Failed to load workspace from localStorage", e);
      }
  }, []);

  // Sync workspace to local storage whenever it changes
  useEffect(() => {
      try {
          localStorage.setItem('workspacePapers', JSON.stringify(workspacePapers));
          localStorage.setItem('workspaceProjects', JSON.stringify(projects));
      } catch (e) {
          console.error("Failed to save workspace to localStorage", e);
      }
  }, [workspacePapers, projects]);
  
  // Effect to automatically clear the toast message after a delay
  useEffect(() => {
    if (toastMessage) {
        const timer = setTimeout(() => {
            setToastMessage(null);
        }, 3000); // Toast disappears after 3 seconds
        return () => clearTimeout(timer);
    }
  }, [toastMessage]);


  // Listen for messages from the browser extension
  useEffect(() => {
      const cleanup = extensionService.listenForExtensionMessages(
          (savedPaper) => {
              setWorkspacePapers(prev => {
                  const existingIndex = prev.findIndex(p => p.id === savedPaper.id);
                  if (existingIndex > -1) {
                      const updated = [...prev];
                      updated[existingIndex] = savedPaper;
                      return updated;
                  }
                  return [savedPaper, ...prev];
              });
          },
          (removedPaperId) => {
              setWorkspacePapers(prev => prev.filter(p => p.id !== removedPaperId));
          }
      );
      return cleanup;
  }, []);

  const logAnalyticsEvent = useCallback((eventName: string, payload: object) => {
    analyticsService.logEvent(eventName, payload);
  }, []);

  useEffect(() => {
    if (initialSearchHandled.current) return;
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title');
    const text = params.get('text');
    const url = params.get('url');
    const sharedQuery = [title, text].filter(Boolean).join(' ').trim() || url;
    if (sharedQuery) {
      initialSearchHandled.current = true;
      logAnalyticsEvent('shared_content_received', { source: 'web_share_target', query: sharedQuery });
      setQuery(sharedQuery);
      handleSearch(sharedQuery, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [logAnalyticsEvent]);

  const handleSelectPaper = useCallback((paper: ResearchPaper) => {
    setSelectedPaper(paper);
    if (!paper.keyConcepts) {
        setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, keyConceptsState: 'loading' } : p));
        geminiService.extractKeyConcepts(paper.abstract)
            .then(concepts => setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, keyConcepts: concepts, keyConceptsState: 'loaded' } : p)))
            .catch(() => setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, keyConceptsState: 'error' } : p)));
    }
    logAnalyticsEvent('paper_selected', { title: paper.title });
  }, [logAnalyticsEvent]);

  const executeSearch = useCallback(async (searchQuery: string, options: AdvancedSearchOptions) => {
    if (!searchQuery.trim()) return;
    setHasSearched(true);
    setIsLoading(true);
    setError(null);
    setPapers([]);
    setAnalysis(null);
    setSelectedPaper(null);
    setLastSearchOptions(options);
    setOriginalQuery(searchQuery);
    logAnalyticsEvent('search_started', { query: searchQuery, options });
    setLoadingMessage('Initializing search...');
    
    setIsGeneratingRefined(true);
    setRefinedQueries([]);
    geminiService.generateRefinedQueries(searchQuery)
      .then(queries => setRefinedQueries(queries))
      .finally(() => setIsGeneratingRefined(false));

    try {
      setExecutedQuery(searchQuery);
      
      const onProgress = (message: string) => setLoadingMessage(message);
      const result = await apiService.search(searchQuery, options, summaryLength, summaryStyle, onProgress);
      setPapers(result.papers);
      setAnalysis(result.analysis);
      logAnalyticsEvent('search_success', { query: searchQuery, resultsCount: result.papers.length });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(errorMessage);
      logAnalyticsEvent('search_failed', { query: searchQuery, error: errorMessage });
    } finally {
      setIsLoading(false);
      setLoadingMessage('');
    }
  }, [summaryLength, summaryStyle, logAnalyticsEvent]);

  const handleSearch = useCallback((currentQuery: string, options: AdvancedSearchOptions) => {
      executeSearch(currentQuery, options);
  }, [executeSearch]);
  
  const handleOriginalSearch = useCallback(() => {
      if (originalQuery) {
          executeSearch(originalQuery, lastSearchOptions);
          logAnalyticsEvent('original_query_search_triggered', { query: originalQuery });
      }
  }, [executeSearch, originalQuery, lastSearchOptions, logAnalyticsEvent]);
  
  const filteredPapers = useMemo(() => {
    if (!showHighRelevanceOnly) {
        return papers;
    }
    return papers.filter(p => (p.combinedScore ?? 0) >= 75);
  }, [papers, showHighRelevanceOnly]);

  const sortedPapers = useMemo(() => {
    return [...filteredPapers].sort((a, b) => {
        const key = sortConfig.key;

        if (key === 'relevance') {
            const aVal = a.combinedScore ?? 0;
            const bVal = b.combinedScore ?? 0;
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }

        if (key === 'validationScore') {
            const aVal = a.validation?.score || 0;
            const bVal = b.validation?.score || 0;
            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        }

        const aVal = a[key as keyof ResearchPaper] as number || 0;
        const bVal = b[key as keyof ResearchPaper] as number || 0;

        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [filteredPapers, sortConfig]);

  const handleToggleWorkspacePaper = useCallback((paper: ResearchPaper) => {
    const isCurrentlyInWorkspace = workspacePapers.some(p => p.id === paper.id);

    if (!isCurrentlyInWorkspace) {
        logAnalyticsEvent('paper_added_to_workspace', { title: paper.title });
        setWorkspacePapers(prev => [...prev, paper]);
        extensionService.notifyExtensionFavoriteToggled(paper, true);
        setToastMessage("Paper added to workspace");
    } else {
        logAnalyticsEvent('paper_removed_from_workspace', { title: paper.title });
        setWorkspacePapers(prev => prev.filter(p => p.id !== paper.id));
        // Also remove from any project it might be in
        setProjects(prevProjects => 
            prevProjects.map(project => ({
                ...project,
                paperIds: project.paperIds.filter(id => id !== paper.id)
            }))
        );
        extensionService.notifyExtensionFavoriteToggled(paper, false);
    }
  }, [workspacePapers, projects, logAnalyticsEvent]);
  
  const handleFindConnectedPapers = useCallback(async (paper: ResearchPaper) => {
      if (isFindingConnected) return; // Prevent multiple simultaneous requests
      setIsFindingConnected(true);
      setPaperBeingConnected(paper.id);
      setConnectedPapersError(null);
      setConnectedPapersResult(null);
      logAnalyticsEvent('find_connected_papers_started', { title: paper.title });
      try {
          const result = await geminiService.findConnectedPapers(paper);
          setConnectedPapersResult(result);
      } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
          setConnectedPapersError(errorMessage);
          setConnectedPapersResult({ seedPaper: paper, connections: [] });
      } finally {
          setIsFindingConnected(false);
          setPaperBeingConnected(null);
      }
  }, [isFindingConnected, logAnalyticsEvent]);

  const handleAnalyzePaper = useCallback(async (paper: ResearchPaper) => {
    setIsAnalyzingPaper(true);
    setPaperAnalysisError(null);
    // Open the modal immediately in a loading state with dummy data
    setPaperAnalysisResult({ paper, analysis: { researchQuestion: '', methodology: '', keyFindings: [], limitations: [] } });
    try {
        const analysisResult = await geminiService.analyzeSinglePaper(paper);
        // On success, update the result with the actual analysis
        setPaperAnalysisResult({ paper, analysis: analysisResult });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setPaperAnalysisError(errorMessage);
        // On error, the modal is already open, and now the error will be displayed.
    } finally {
        setIsAnalyzingPaper(false);
    }
  }, []);
  
  const handleGenerateSuggestions = useCallback(async (paper: ResearchPaper) => {
    setIsGeneratingSuggestions(true);
    setSuggestionsError(null);
    setSuggestionsResult({ seedPaper: paper, suggestions: [] });
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
      setSuggestionsResult(null);
      setQuery(newQuery);
      handleSearch(newQuery, { startYear: '', endYear: '', authors: '', excludeKeywords: '' });
  }, [handleSearch]);

  const handleFindDoi = useCallback(async (paper: ResearchPaper) => {
    setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, doiState: 'loading' } : p));
    try {
      const doi = await crossrefService.findDoiForPaper(paper);
      setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, doi: doi || undefined, doiState: 'loaded' } : p));
    } catch (err) {
      setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, doiState: 'error' } : p));
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
    setAnalysis(null);
    setSelectedPaper(null);
    setQuery('');
    setError(null);
    setExecutedQuery('');
    setOriginalQuery('');
  }, []);

  const handleRemovePaperFromResults = useCallback((paperToRemove: ResearchPaper) => {
      setPapers(prev => prev.filter(p => p.id !== paperToRemove.id));
  }, []);
  
  const handleRefinedQuerySearch = useCallback((newQuery: string) => {
      setQuery(newQuery);
      const newOptions = { ...lastSearchOptions, excludeKeywords: '' };
      handleSearch(newQuery, newOptions);
      logAnalyticsEvent('refined_query_search', { query: newQuery });
  }, [handleSearch, lastSearchOptions, logAnalyticsEvent]);

  const handleAnalyzeGaps = useCallback(async (papersToAnalyze: ResearchPaper[]) => {
    setIsGapAnalysisModalOpen(true);
    setIsAnalyzingGaps(true);
    setGapAnalysisContent(null);
    setGapAnalysisError(null);
    if (papersToAnalyze.length < 2) {
        setGapAnalysisError("Please select at least two papers to analyze.");
        setIsAnalyzingGaps(false);
        return;
    }
    logAnalyticsEvent('gap_analysis_started', { paperCount: papersToAnalyze.length });
    try {
        const report = await geminiService.analyzeResearchGaps(papersToAnalyze);
        setGapAnalysisContent(report);
        logAnalyticsEvent('gap_analysis_success', { reportLength: report.length });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setGapAnalysisError(errorMessage);
        logAnalyticsEvent('gap_analysis_failed', { error: errorMessage });
    } finally {
        setIsAnalyzingGaps(false);
    }
  }, [logAnalyticsEvent]);
  
  const handleSynthesizeWorkspace = useCallback(async (papersToSynthesize: ResearchPaper[]) => {
    setIsSynthesisModalOpen(true);
    setIsSynthesizing(true);
    setSynthesisResult(null);
    setSynthesisError(null);
    if (papersToSynthesize.length < 2) {
        setSynthesisError("Please select at least two papers to synthesize.");
        setIsSynthesizing(false);
        return;
    }
    logAnalyticsEvent('synthesis_started', { paperCount: papersToSynthesize.length });
    try {
        const result = await geminiService.synthesizePapers(papersToSynthesize);
        setSynthesisResult(result);
        logAnalyticsEvent('synthesis_success', { resultCount: result.length });
    } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred.';
        setSynthesisError(errorMessage);
        logAnalyticsEvent('synthesis_failed', { error: errorMessage });
    } finally {
        setIsSynthesizing(false);
    }
  }, [logAnalyticsEvent]);

  const handleCreateProject = useCallback((name: string) => {
    setProjects(prev => {
        const newProject: Project = {
            id: `proj_${Date.now()}`,
            name,
            paperIds: [],
            createdAt: Date.now(),
            color: PROJECT_COLORS[prev.length % PROJECT_COLORS.length],
        };
        logAnalyticsEvent('project_created', { projectName: name });
        return [...prev, newProject];
    });
  }, [logAnalyticsEvent]);

  const handleDeleteProject = useCallback((projectId: string) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    logAnalyticsEvent('project_deleted', { projectId });
  }, [logAnalyticsEvent]);

  const handleMovePaperToProject = useCallback((paperId: string, projectId: string | null) => {
    setProjects(prevProjects => {
        // First, remove the paper from any project it might currently be in.
        const projectsWithoutPaper = prevProjects.map(p => ({
            ...p,
            paperIds: p.paperIds.filter(id => id !== paperId),
        }));
        // If a new project is specified, add it there.
        if (projectId) {
            return projectsWithoutPaper.map(p => 
                p.id === projectId 
                ? { ...p, paperIds: [...p.paperIds, paperId] } 
                : p
            );
        }
        return projectsWithoutPaper;
    });
    logAnalyticsEvent('paper_moved_to_project', { paperId, projectId });
  }, [logAnalyticsEvent]);

  const handleAddAndAssignToProject = useCallback((paper: ResearchPaper, projectId: string) => {
      // Ensure paper is in the main workspace list
      if (!workspacePapers.some(p => p.id === paper.id)) {
          setWorkspacePapers(prev => [...prev, paper]);
          extensionService.notifyExtensionFavoriteToggled(paper, true);
      }
      
      // Now, assign it to the project
      handleMovePaperToProject(paper.id, projectId);

      const projectName = projects.find(p => p.id === projectId)?.name || 'a project';
      setToastMessage(`Paper added to project "${projectName}"`);
      logAnalyticsEvent('paper_added_to_project', { paperId: paper.id, projectId });
  }, [workspacePapers, projects, handleMovePaperToProject, logAnalyticsEvent]);

  const handleExcludeLowScoring = useCallback(() => {
    const papersToExclude = papers.filter(p => (p.semanticScore ?? 100) < 30);
    if (papersToExclude.length === 0) {
        setToastMessage("No papers met the low-score threshold for exclusion.");
        return;
    }

    const titlesToExclude = papersToExclude.map(p => p.title);
    
    // Update the papers list for immediate UI feedback
    setPapers(prev => prev.filter(p => (p.semanticScore ?? 100) >= 30));

    // Update the advanced search options for the next search
    setLastSearchOptions(prev => {
        const existingExcludes = prev.excludeKeywords ? prev.excludeKeywords.split('|||').filter(Boolean) : [];
        const newExcludes = new Set([...existingExcludes, ...titlesToExclude]);
        return { ...prev, excludeKeywords: Array.from(newExcludes).join('|||') };
    });

    setToastMessage(`${titlesToExclude.length} low-scoring paper(s) hidden and excluded from future searches.`);
    logAnalyticsEvent('low_scoring_papers_excluded', { count: titlesToExclude.length });
  }, [papers, logAnalyticsEvent]);
  
  const handleChangeProjectColor = useCallback((projectId: string, color: string) => {
    setProjects(prev => 
        prev.map(p => p.id === projectId ? { ...p, color } : p)
    );
    logAnalyticsEvent('project_color_changed', { projectId, color });
  }, [logAnalyticsEvent]);

  const selectedPaperFromList = useMemo(() => {
    if (!selectedPaper) return null;
    return papers.find(p => p.id === selectedPaper.id) ?? selectedPaper;
  }, [selectedPaper, papers]);

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
          <div className="flex items-center gap-4">
            <button
                onClick={() => setIsDbFinderModalOpen(true)}
                className="text-sm font-medium text-primary hover:underline"
            >
                Find Databases
            </button>
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

                    {isLoading && <LoadingSpinner message={loadingMessage} />}
                    {error && <ErrorMessage message={error} />}
                    {!isLoading && !error && papers.length > 0 && (
                        <div>
                            <ResultsDisplay
                                papers={sortedPapers}
                                selectedPaper={selectedPaperFromList}
                                onSelectPaper={handleSelectPaper}
                                sortConfig={sortConfig}
                                onSortChange={setSortConfig}
                                onRemovePaper={handleRemovePaperFromResults}
                                onToggleWorkspacePaper={handleToggleWorkspacePaper}
                                workspacePapers={workspacePapers}
                                onFindConnectedPapers={handleFindConnectedPapers}
                                paperBeingConnected={paperBeingConnected}
                                projects={projects}
                                onAddAndAssignToProject={handleAddAndAssignToProject}
                                onExcludeLowScoring={handleExcludeLowScoring}
                                showHighRelevanceOnly={showHighRelevanceOnly}
                                onShowHighRelevanceOnlyChange={setShowHighRelevanceOnly}
                            />
                            <SearchResultFeedback query={query} onOpenFeedbackModal={() => setIsSummaryFeedbackModalOpen(true)} />
                        </div>
                    )}
                </div>

                <div className="lg:col-span-7">
                    <WorkspacePanel
                        papers={papers}
                        selectedPaper={selectedPaperFromList}
                        analysis={analysis}
                        workspacePapers={workspacePapers}
                        projects={projects}
                        sources={sources}
                        onToggleWorkspacePaper={handleToggleWorkspacePaper}
                        onFindConnectedPapers={handleFindConnectedPapers}
                        isFindingConnected={isFindingConnected}
                        onAnalyzePaper={handleAnalyzePaper}
                        isAnalyzingPaper={isAnalyzingPaper}
                        onConceptClick={handleConceptClick}
                        onFindDoi={handleFindDoi}
                        onGenerateSuggestions={handleGenerateSuggestions}
                        isGeneratingSuggestions={isGeneratingSuggestions}
                        logAnalyticsEvent={logAnalyticsEvent}
                        refinedQueries={refinedQueries}
                        isGeneratingRefined={isGeneratingRefined}
                        onRefinedQuerySearch={handleRefinedQuerySearch}
                        onAnalyzeGaps={handleAnalyzeGaps}
                        onSynthesizeWorkspace={handleSynthesizeWorkspace}
                        onCreateProject={handleCreateProject}
                        onDeleteProject={handleDeleteProject}
                        onMovePaperToProject={handleMovePaperToProject}
                        onUpdateProjectColor={handleChangeProjectColor}
                    />
                </div>
            </div>
        )}
      </main>

      <div className="fixed bottom-6 right-6 flex flex-col items-center gap-4 z-30">
        <FeedbackButton onClick={() => setIsFeedbackModalOpen(true)} />
      </div>
      
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
      
      <InfoModal
        isOpen={isFeedbackModalOpen}
        onClose={() => setIsFeedbackModalOpen(false)}
        title="Provide Feedback"
      >
        <FeedbackForm onSubmit={(feedback) => logAnalyticsEvent('feedback_submitted', feedback)} />
      </InfoModal>

      <ConnectedPapersModal
          result={connectedPapersResult}
          onClose={() => setConnectedPapersResult(null)}
          error={connectedPapersError}
      />
      <PaperAnalysisModal
          result={paperAnalysisResult}
          onClose={() => {
            setPaperAnalysisResult(null);
            setPaperAnalysisError(null);
          }}
          error={paperAnalysisError}
          isLoading={isAnalyzingPaper}
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
                  <li><strong>Paper Deep-Dive:</strong> For any paper, you can find connected works (citations, derivatives), perform a structured analysis, and verify its source.</li>
                  <li><strong>Bibliography Generation:</strong> Automatically generate a formatted reference list from your search results in multiple styles and export for tools like Zotero.</li>
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
        
        <SynthesisModal
            isOpen={isSynthesisModalOpen}
            onClose={() => setIsSynthesisModalOpen(false)}
            isLoading={isSynthesizing}
            result={synthesisResult}
            error={synthesisError}
        />
    </div>
  );
};

export default App;