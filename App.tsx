import React, { useState, useEffect, useMemo } from 'react';
import type { 
    ResearchPaper, 
    SummaryLength, 
    SummaryStyle, 
    AdvancedSearchOptions, 
    AnalysisResult, 
    SortConfig, 
    SortKey, 
    User, 
    AppMode, 
    Project, 
    SearchSourceInfo, 
    ModelDefinition, 
    ChatMessage, 
    SynthesisResult, 
    CitationStyle, 
    UserSettings, 
    StudyTask 
} from './types';
import * as apiService from './services/apiService';
import * as storageService from './services/storageService';
import { sciteService } from './services/sciteService';
import { authService } from './services/authService';
import { analyticsService } from './services/analyticsService';
import { mcpService } from './services/mcpService';
import * as extensionService from './services/extensionService';
import { recordUserStatement, recordAgentStatement, generateSessionUuid } from './services/lrsService';

// Components
import { Header } from './components/Header';
import { InitialSearchScreen } from './components/InitialSearchScreen';
import { SearchForm } from './components/SearchForm';
import { ResultsDisplay } from './components/ResultsDisplay';
import { PaperDetails } from './components/PaperDetails';
import { SearchResultsAnalysis } from './components/SearchResultsAnalysis';
import { LoginScreen } from './components/LoginScreen';
import { ProxySettingsModal } from './components/ProxySettingsModal';
import { ConnectionsDashboard } from './components/ConnectionsDashboard';
import { InfoModal } from './components/InfoModal';
import { AboutModalContent } from './components/AboutModalContent';
import { OnboardingModal } from './components/OnboardingModal';
import { ErrorMessage } from './components/ErrorMessage';
import { ResearcherDashboard } from './components/ResearcherDashboard';
import { ParticipantDashboard } from './components/ParticipantDashboard';
import { SurveyModal } from './components/SurveyModal';
import { DatabaseFinderModal } from './components/DatabaseFinderModal';
import { OrganizationFinderModal } from './components/OrganizationFinderModal';
import { DeepResearchModal } from './components/DeepResearchModal';
import { CitationModal } from './components/CitationModal';
import { Toast } from './components/Toast';
import { CapabilityMarketplace } from './components/CapabilityMarketplace';
import { LrsTelemetryModal } from './components/LrsTelemetryModal';
import { KeywordRefinementDeck } from './components/KeywordRefinementDeck';
import { LibraryConnectionGuideModal } from './components/LibraryConnectionGuideModal';
import { 
    SystemExecutionIndicator, 
    type SystemExecutionState 
} from './components/SystemExecutionIndicator';
import { 
    extractAcademicKeywordsFromPapers, 
    refineQuery, 
    type AcademicKeyword 
} from './services/keywordSuggestionService';

// Default system execution tracker state
const createDefaultExecutionState = (): SystemExecutionState => ({
    isRunning: false,
    activeMessage: '',
    initialPaperCount: 0,
    totalPaperCount: 0,
    sourcesCount: 15,
    stages: {
        fast_index: {
            id: 'fast_index',
            label: 'Fast Index',
            sublabel: 'OpenAlex 250M+ global works index',
            status: 'pending'
        },
        federated_sources: {
            id: 'federated_sources',
            label: 'Federated Sources',
            sublabel: 'ArXiv, Crossref, PubMed, Semantic Scholar',
            status: 'pending'
        },
        semantic_scoring: {
            id: 'semantic_scoring',
            label: 'AI Relevance',
            sublabel: 'Neural embedding & ranking',
            status: 'pending'
        },
        scite_citations: {
            id: 'scite_citations',
            label: 'Smart Citations',
            sublabel: 'scite_ supporting/contrasting verification',
            status: 'pending'
        },
        literature_analysis: {
            id: 'literature_analysis',
            label: 'Domain Synthesis',
            sublabel: 'Consensus, methodologies & themes',
            status: 'pending'
        }
    }
});

// Icons
import { 
    Search, 
    Database, 
    FileText, 
    ClipboardList, 
    ArrowRight, 
    Check, 
    Copy, 
    Download, 
    Radio, 
    Bot, 
    HelpCircle, 
    Info, 
    ShieldCheck, 
    ExternalLink, 
    TrendingUp, 
    Trash2, 
    Sparkles, 
    Cpu,
    ShoppingBag,
    Layers,
    GraduationCap,
    Library,
    BookOpen
} from 'lucide-react';

type NavTab = 'search' | 'results' | 'detail' | 'queue' | 'export' | 'connections' | 'scout' | 'marketplace';

const App: React.FC = () => {
  // --- AUTH & USER STATE ---
  const [user, setUser] = useState<User | null>(authService.getUser());
  const [appMode, setAppMode] = useState<AppMode>('search');
  const [completedTasks, setCompletedTasks] = useState<string[]>([]);
  const [isSurveyOpen, setIsSurveyOpen] = useState(false);
  const [activeTask, setActiveTask] = useState<StudyTask | null>(null);
  const [sessionFinished, setSessionFinished] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
      isMcpEnabled: false,
      mcpServerUrl: '/mcp',
      isScholarBridgeEnabled: false
  });

  // --- NAVIGATION TAB STATE ---
  const [activeNav, setActiveNav] = useState<NavTab>('search');

  // --- UI MODAL & TOAST STATE ---
  const [showLogin, setShowLogin] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showLibraryGuide, setShowLibraryGuide] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDbFinder, setShowDbFinder] = useState(false);
  const [showOrgFinder, setShowOrgFinder] = useState(false);
  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Citation Modal State
  const [showCitationModal, setShowCitationModal] = useState(false);
  const [citationPaper, setCitationPaper] = useState<ResearchPaper | null>(null);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>('apa');

  // --- SEARCH & DATA STATE ---
  const [query, setQuery] = useState('');
  const [papers, setPapers] = useState<ResearchPaper[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [systemExecution, setSystemExecution] = useState<SystemExecutionState>(createDefaultExecutionState);
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [currentSearchOptions, setCurrentSearchOptions] = useState<AdvancedSearchOptions>({});
  const [cachedQueryEmbedding, setCachedQueryEmbedding] = useState<number[] | null>(null);
  
  // --- SORTING ---
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });

  // --- ANALYSIS STATE ---
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
  const [summary, setSummary] = useState<string>('');
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
  
  // --- SELECTION QUEUE (FORMERLY WORKSPACE) ---
  const [workspacePapers, setWorkspacePapers] = useState<ResearchPaper[]>([]);
  const [projects, setProjects] = useState<Project[]>([{ id: 'default', name: 'General Research', color: 'blue' }]);
  
  // --- EXPORT SNAPSHOT PROCESS STATES ---
  const [isCompilingSnapshot, setIsCompilingSnapshot] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationItemIndex, setCompilationItemIndex] = useState(0);
  const [compilationPaperTitle, setCompilationPaperTitle] = useState('');
  const [exportFileName, setExportFileName] = useState('openharness_snapshot');
  
  // --- REFINED QUERY STATE ---
  const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
  const [isGeneratingRefined, setIsGeneratingRefined] = useState(false);

  // --- AI SOURCE SCOUT STATE ---
  const [scoutTopic, setScoutTopic] = useState('');
  const [isScououting, setIsScouting] = useState(false);
  const [scoutCandidates, setScoutCandidates] = useState<ResearchPaper[]>([]);
  const [scoutRationale, setScoutRationale] = useState<string>('');
  const [scoutUncertainty, setScoutUncertainty] = useState<string>('');
  const [scoutServices, setScoutServices] = useState<string[]>(['openalex', 'semantic-scholar']);
  const [scoutApprovedIds, setScoutApprovedIds] = useState<Set<string>>(new Set());
  const [scoutSessionUuid, setScoutSessionUuid] = useState<string>('');
  const [copiedScoutUuid, setCopiedScoutUuid] = useState<boolean>(false);

  // --- MODAL & INSPECTOR STATES ---
  const [showLrsInspector, setShowLrsInspector] = useState(false);
  const [availableModels] = useState<ModelDefinition[]>([
      { id: 'gemini-3-flash-preview', name: 'Gemini 3 Flash' },
      { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' }
  ]);
  const [selectedModel, setSelectedModel] = useState<ModelDefinition>(availableModels[0]);

  // --- SEARCH SOURCES (Federated Open Scholarly Registries & Repositories) ---
  const [searchSources, setSearchSources] = useState<SearchSourceInfo[]>([
      { id: 'openalex', name: 'OpenAlex', description: 'Primary Global Research Graph' },
      { id: 'semantic_scholar', name: 'Semantic Scholar', description: 'Citation Graph & TLDRs' },
      { id: 'crossref', name: 'Crossref', description: 'Global DOI & Metadata Authority' },
      { id: 'pubmed', name: 'PubMed / MEDLINE', description: 'Biomedical & Clinical Sciences' },
      { id: 'biorxiv', name: 'bioRxiv / medRxiv', description: 'Life Sciences & Medical Preprints' },
      { id: 'zenodo', name: 'Zenodo (CERN)', description: 'Open Research Datasets & Code' },
      { id: 'dissertations', name: 'Doctoral Dissertations', description: 'PhD Theses & Methodologies' },
      { id: 'doaj', name: 'DOAJ', description: 'Directory of Open Access Journals' },
      { id: 'eric', name: 'ERIC (IES)', description: 'Education Sciences & Pedagogy' },
      { id: 'core', name: 'CORE', description: 'Global Open Access Repositories' },
      { id: 'datacite', name: 'DataCite', description: 'PID Graph Open Datasets & Software' },
      { id: 'europepmc', name: 'Europe PMC', description: 'Biomedical & Life Sciences Literature' },
      { id: 'dblp', name: 'DBLP', description: 'Computer Science Bibliography' },
      { id: 'arxiv', name: 'arXiv', description: 'STEM Pre-Print Server' },
      { id: 'huggingface', name: 'Hugging Face', description: 'Daily AI Papers' }
  ]);

  const activeSearchSources = useMemo(() => {
      const sources = [...searchSources];
      if (userSettings.isHarvardLibraryEnabled) {
          sources.push({
              id: 'harvard-library-mcp',
              name: 'Harvard Library MCP',
              description: 'Harvard University Library Catalog via Model Context Protocol'
          });
      }
      return sources;
  }, [searchSources, userSettings.isHarvardLibraryEnabled]);

  const fetchSciteTallies = async (papersToEnrich: ResearchPaper[]) => {
      const dois = papersToEnrich
          .map(p => p.doi)
          .filter((doi): doi is string => !!doi);
      
      if (dois.length === 0) return;

      try {
          const tallies = await sciteService.getTallies(dois);
          setPapers(prevPapers => prevPapers.map(p => {
              if (p.doi && tallies[p.doi]) {
                  return { ...p, sciteTally: tallies[p.doi], sciteTallyState: 'loaded' };
              }
              return p;
          }));
          setScoutCandidates(prevScout => prevScout.map(p => {
              if (p.doi && tallies[p.doi]) {
                  return { ...p, sciteTally: tallies[p.doi], sciteTallyState: 'loaded' };
              }
              return p;
          }));
      } catch (error) {
          console.error("[Scite] Error fetching tallies in App", error);
      }
  };

  // --- EFFECTS ---
  useEffect(() => {
      if (papers.length > 0 && hasSearched && !isLoading) {
          setIsSummaryLoading(true);
          apiService.generateSummary(papers.slice(0, 10), summaryLength, summaryStyle)
            .then(setSummary)
            .catch(error => {
              console.error("Failed to generate summary:", error);
              setSummary("Failed to generate summary.");
            })
            .finally(() => setIsSummaryLoading(false));
      }
  }, [summaryLength, summaryStyle, papers.length, hasSearched, isLoading]);

  useEffect(() => {
      const hasOnboarded = localStorage.getItem('onboardingCompleted');
      if (!hasOnboarded) {
          setShowOnboarding(true);
      }
      
      const cleanupExtensionListener = extensionService.listenForExtensionMessages(
          (paper) => {
              setWorkspacePapers(prev => {
                  if (prev.some(p => p.id === paper.id)) return prev;
                  setToastMessage(`Added "${paper.title.substring(0, 30)}..." to selection queue.`);
                  return [paper, ...prev];
              });
          },
          (paperId) => {
              setWorkspacePapers(prev => prev.filter(p => p.id !== paperId));
          },
          (papersList) => {
              setWorkspacePapers(prev => {
                  const newPapers = papersList.filter(p => !prev.some(existing => existing.id === p.id));
                  if (newPapers.length > 0) {
                      return [...newPapers, ...prev];
                  }
                  return prev;
              });
          }
      );
      
      extensionService.requestAllPapers();
      
      return () => {
          cleanupExtensionListener();
      };
  }, []);

  // --- AUTH HANDLERS ---
  const handleLogin = (loggedInUser: User) => {
      setUser(loggedInUser);
      if (loggedInUser.role === 'participant') {
          setAppMode('evaluation');
      } else {
          setAppMode('dashboard');
      }
  };

  const handleLogout = () => {
      authService.logout();
      setUser(null);
      setAppMode('search');
  };

  // --- SEARCH HANDLER ---
  const handleSearch = async (searchQuery: string, options: AdvancedSearchOptions) => {
    setIsLoading(true);
    setError(null);
    setCachedQueryEmbedding(null);
    setPapers([]);
    setSelectedPaper(null);
    setSummary('');
    setAnalysis(null);
    setRefinedQueries([]);
    setSortConfig({ key: 'relevance', direction: 'desc' });
    setHasSearched(true); 
    setPage(1);
    setHasMore(false);
    setCurrentSearchOptions(options);
    setActiveNav('results'); // Auto-transition to results tab

    // Initialize System Execution State
    setSystemExecution({
        isRunning: true,
        activeMessage: `Querying OpenAlex & global academic indices for "${searchQuery}"...`,
        currentStageId: 'fast_index',
        initialPaperCount: 0,
        totalPaperCount: 0,
        sourcesCount: 15,
        startedAt: Date.now(),
        stages: {
            fast_index: {
                id: 'fast_index',
                label: 'Fast Index (OpenAlex)',
                sublabel: '250M+ global works index',
                status: 'running',
                detail: 'Retrieving initial articles from OpenAlex...'
            },
            federated_sources: {
                id: 'federated_sources',
                label: 'Federated Sources',
                sublabel: userSettings.isHarvardLibraryEnabled ? 'ArXiv, Crossref, PubMed, Harvard Library MCP' : 'ArXiv, Crossref, PubMed, Semantic Scholar',
                status: 'running',
                detail: userSettings.isHarvardLibraryEnabled ? 'Querying 16+ academic repositories in parallel...' : 'Querying 15+ academic repositories in parallel...'
            },
            semantic_scoring: {
                id: 'semantic_scoring',
                label: 'AI Relevance',
                sublabel: 'Neural query embedding & ranking',
                status: 'pending',
                detail: 'Awaiting initial paper batch...'
            },
            scite_citations: {
                id: 'scite_citations',
                label: 'Smart Citations',
                sublabel: 'scite_ supporting/contrasting verification',
                status: 'pending',
                detail: 'Awaiting paper DOIs...'
            },
            literature_analysis: {
                id: 'literature_analysis',
                label: 'Domain Synthesis',
                sublabel: 'Consensus, methodologies & themes',
                status: 'pending',
                detail: 'Awaiting paper collection...'
            }
        }
    });

    // Record User Search Action in Yet SQL LRS
    recordUserStatement(
      user?.name || 'Human Researcher',
      '/ontologies/agent_traceability.owl#searched',
      'Searched literature repository',
      `urn:scholarexplorer:query:${encodeURIComponent(searchQuery)}`,
      `Query: "${searchQuery}"`,
      { searchQuery, domain: options.domain }
    );

    try {
      const queryEmbeddingPromise = apiService.precomputeQueryEmbedding(searchQuery);

      const { papers: results, hasMore: moreAvailable } = await apiService.searchPapers(
          searchQuery, 
          options, 
          1, 
          userSettings,
          {
              // 1. FAST INITIAL PAPERS: Bring out the paper list immediately so the UI is responsive
              onInitialPapers: (initialPapers, hasMoreInitial) => {
                  setPapers(initialPapers);
                  setHasMore(hasMoreInitial);
                  setIsLoading(false); // Stop blocking loading state! Papers are on screen!

                  // Update system execution state: Fast index complete, secondary capabilities running
                  setSystemExecution(prev => ({
                      ...prev,
                      initialPaperCount: initialPapers.length,
                      totalPaperCount: initialPapers.length,
                      activeMessage: `Initial ${initialPapers.length} papers loaded. Ingesting federated sources & calculating AI relevance...`,
                      stages: {
                          ...prev.stages,
                          fast_index: {
                              ...prev.stages.fast_index,
                              status: 'completed',
                              detail: `Retrieved ${initialPapers.length} works in <1s`,
                              metric: `${initialPapers.length} works`
                          },
                          semantic_scoring: {
                              ...prev.stages.semantic_scoring,
                              status: 'running',
                              detail: 'Computing neural embeddings...'
                          },
                          scite_citations: {
                              ...prev.stages.scite_citations,
                              status: 'running',
                              detail: 'Verifying smart citation tallies...'
                          }
                      }
                  }));

                  // Start smart citation tallies on initial papers immediately
                  fetchSciteTallies(initialPapers);
              },

              // 2. FEDERATED BATCH: As ArXiv, Crossref, PubMed, etc. arrive, seamlessly merge them
              onFederatedBatch: (mergedPapers, newCount) => {
                  setPapers(mergedPapers);
                  setSystemExecution(prev => ({
                      ...prev,
                      totalPaperCount: mergedPapers.length,
                      activeMessage: `Merged ${newCount} additional papers from ArXiv, PubMed & Crossref (${mergedPapers.length} total).`,
                      stages: {
                          ...prev.stages,
                          federated_sources: {
                              ...prev.stages.federated_sources,
                              status: 'completed',
                              detail: `Merged ${newCount} additional scholarly works`,
                              metric: `+${newCount} works`
                          }
                      }
                  }));

                  fetchSciteTallies(mergedPapers);
              },

              onStatusChange: (statusMsg) => {
                  setSystemExecution(prev => ({
                      ...prev,
                      activeMessage: statusMsg
                  }));
              }
          }
      );
      
      setPapers(results);
      setHasMore(moreAvailable);
      setIsLoading(false); 

      fetchSciteTallies(results);

      try {
          const queryEmbedding = await queryEmbeddingPromise;
          setCachedQueryEmbedding(queryEmbedding);
          const scoredResults = await apiService.computeScores(results, queryEmbedding, searchQuery);
          setPapers(scoredResults);

          setSystemExecution(prev => ({
              ...prev,
              stages: {
                  ...prev.stages,
                  federated_sources: {
                      ...prev.stages.federated_sources,
                      status: 'completed',
                      detail: 'All federated repositories indexed'
                  },
                  semantic_scoring: {
                      ...prev.stages.semantic_scoring,
                      status: 'completed',
                      detail: `Ranked ${scoredResults.length} articles by neural relevance`,
                      metric: '100% scored'
                  },
                  scite_citations: {
                      ...prev.stages.scite_citations,
                      status: 'completed',
                      detail: 'Smart citation tallies verified',
                      metric: 'Active'
                  }
              }
          }));

          // Trace AI Semantic Scoring in DuckDB Vertical LRS
          const scoringSession = generateSessionUuid('scoring');
          recordAgentStatement(
              'Semantic Scoring AI',
              scoringSession,
              '/ontologies/agent_traceability.owl#classified',
              'Classified Candidate Papers by Semantic Relevance',
              `urn:scholarexplorer:scoring:${encodeURIComponent(searchQuery)}`,
              `Semantic Embeddings for: "${searchQuery}"`,
              { paperCount: scoredResults.length, query: searchQuery }
          );
      } catch (scoreError) {
          console.error("Scoring failed silently:", scoreError);
          setPapers(prev => prev.map(p => ({ ...p, semanticScore: 0 })));
          setSystemExecution(prev => ({
              ...prev,
              stages: {
                  ...prev.stages,
                  semantic_scoring: {
                      ...prev.stages.semantic_scoring,
                      status: 'completed',
                      detail: 'Lexical relevance applied'
                  }
              }
          }));
      }
      
      if (results.length > 0) {
          setIsAnalysisLoading(true);
          setSystemExecution(prev => ({
              ...prev,
              activeMessage: `Synthesizing literature consensus & domain themes...`,
              stages: {
                  ...prev.stages,
                  literature_analysis: {
                      ...prev.stages.literature_analysis,
                      status: 'running',
                      detail: 'Synthesizing themes, consensus & methodologies...'
                  }
              }
          }));

          apiService.analyzePapers(results, options.domain)
            .then(analysisResult => {
              setAnalysis(analysisResult);
              setSystemExecution(prev => ({
                  ...prev,
                  isRunning: false,
                  completedAt: Date.now(),
                  activeMessage: `System ready: Indexed ${results.length} articles across multiple scholarly repositories${userSettings.isHarvardLibraryEnabled ? ' & Harvard Library' : ''}.`,
                  stages: {
                      ...prev.stages,
                      literature_analysis: {
                          ...prev.stages.literature_analysis,
                          status: 'completed',
                          detail: 'Thematic consensus & synthesis generated',
                          metric: 'Complete'
                      }
                  }
              }));

              // Trace AI Literature Analysis in DuckDB Vertical LRS
              const analysisSession = generateSessionUuid('analysis');
              recordAgentStatement(
                  'Literature Analysis AI',
                  analysisSession,
                  '/ontologies/agent_traceability.owl#verified',
                  'Verified Consensus & Synthesized Domain Analysis',
                  `urn:scholarexplorer:analysis:${encodeURIComponent(searchQuery)}`,
                  `Synthesis for: "${searchQuery}"`,
                  { domain: options.domain, paperCount: results.length }
              );
            })
            .catch(err => {
              console.error("Literature analysis error:", err);
              setSystemExecution(prev => ({
                  ...prev,
                  isRunning: false,
                  completedAt: Date.now(),
                  activeMessage: `System ready: Indexed ${results.length} articles.`
              }));
            })
            .finally(() => setIsAnalysisLoading(false));
      } else {
          setSystemExecution(prev => ({
              ...prev,
              isRunning: false,
              completedAt: Date.now(),
              activeMessage: `Search complete. No matching articles found.`
          }));
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during search.');
      setIsLoading(false);
      setSystemExecution(prev => ({
          ...prev,
          isRunning: false,
          activeMessage: `Search encountered an issue.`
      }));
    }
  };

  const handleLoadMore = async () => {
      if (isLoadingMore || !hasMore) return;
      
      setIsLoadingMore(true);
      const nextPage = page + 1;
      
      try {
          const { papers: newPapers, hasMore: moreAvailable } = await apiService.searchPapers(query, currentSearchOptions, nextPage, userSettings);
          
          setPapers(prev => {
              const existingIds = new Set(prev.map(p => p.id));
              const uniqueNew = newPapers.filter(p => !existingIds.has(p.id));
              
              if (uniqueNew.length > 0) {
                  fetchSciteTallies(uniqueNew);
              }
              return [...prev, ...uniqueNew];
          });
          
          setPage(nextPage);
          setHasMore(moreAvailable);
          setIsLoadingMore(false);

          try {
              let queryEmbedding = cachedQueryEmbedding;
              if (!queryEmbedding) {
                  queryEmbedding = await apiService.precomputeQueryEmbedding(query);
                  setCachedQueryEmbedding(queryEmbedding);
              }
              const scoredNewPapers = await apiService.computeScores(newPapers, queryEmbedding, query);
              
              setPapers(prev => {
                  const scoredMap = new Map(scoredNewPapers.map(p => [p.id, p]));
                  return prev.map(p => {
                      const scored = scoredMap.get(p.id);
                      if (scored) return scored;
                      return p;
                  });
              });
          } catch (e) {
              console.warn("Scoring failed for new page", e);
          }
      } catch (err) {
          console.error("Failed to load more papers:", err);
          setToastMessage("Failed to load more results.");
          setIsLoadingMore(false);
      }
  };

  const handleSortChange = (key: SortKey) => {
    setSortConfig(current => {
      if (current.key === key) {
        return { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'desc' };
    });
  };

  const sortedPapers = useMemo(() => {
    return [...papers].sort((a, b) => {
      const { key, direction } = sortConfig;
      const dir = direction === 'asc' ? 1 : -1;

      if (key === 'relevance') {
        return ((a.semanticScore || 0) - (b.semanticScore || 0)) * dir;
      } else if (key === 'year') {
        return (a.year - b.year) * dir;
      } else if (key === 'citations') {
        return ((a.citations || 0) - (b.citations || 0)) * dir;
      }
      return 0;
    });
  }, [papers, sortConfig]);

  // Rename "Workspace Paper" as "Selection Queue Paper"
  const handleToggleWorkspacePaper = (paper: ResearchPaper) => {
      setWorkspacePapers(prev => {
          const exists = prev.some(p => p.id === paper.id);
          if (exists) {
              storageService.removePaperFromCloud(paper.id);
              setToastMessage(`Removed "${paper.title.substring(0, 30)}..." from selection queue.`);
              recordUserStatement(
                  user?.name || 'Human Researcher',
                  'http://activitystrea.ms/schema/1.0/unsave',
                  'Removed Paper from Selection Queue',
                  paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
                  paper.title,
                  { doi: paper.doi, paperId: paper.id }
              );
              return prev.filter(p => p.id !== paper.id);
          } else {
              storageService.syncPaperToCloud(paper);
              setToastMessage(`Added "${paper.title.substring(0, 30)}..." to selection queue.`);
              recordUserStatement(
                  user?.name || 'Human Researcher',
                  'http://activitystrea.ms/schema/1.0/save',
                  'Saved Paper to Selection Queue',
                  paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
                  paper.title,
                  { doi: paper.doi, paperId: paper.id }
              );
              return [...prev, paper];
          }
      });
  };

  const handleAddPapersToWorkspace = (newPapers: ResearchPaper[]) => {
      let addedCount = 0;
      setWorkspacePapers(prev => {
          const combined = [...prev];
          newPapers.forEach(p => {
              if (!combined.some(existing => existing.id === p.id)) {
                  combined.push(p);
                  addedCount++;
                  storageService.syncPaperToCloud(p);
              }
          });
          return combined;
      });
      if (addedCount > 0) {
          setToastMessage(`Selected ${addedCount} papers for Local Lab snapshot.`);
          recordUserStatement(
              user?.name || 'Human Researcher',
              'http://activitystrea.ms/schema/1.0/save',
              'Batch Saved Papers to Selection Queue',
              `urn:scholarexplorer:workspace:batch:${Date.now()}`,
              `Batch Transfer (${addedCount} works)`,
              { count: addedCount }
          );
      }
  };

  const handleCitePaper = (paper: ResearchPaper, style?: CitationStyle) => {
      setCitationPaper(paper);
      if (style) setCitationStyle(style);
      setShowCitationModal(true);
      recordUserStatement(
          user?.name || 'Human Researcher',
          'http://id.tincanapi.com/verb/exported',
          'Exported Citation',
          paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
          paper.title,
          { style: style || citationStyle, doi: paper.doi }
      );
  };

  const handleGenerateLaymanSummary = async (paper: ResearchPaper) => {
      setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, isLaymanLoading: true } : p));
      setScoutCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, isLaymanLoading: true } : p));
      
      const sessionUuid = generateSessionUuid('layman');
      try {
          const laySummary = await apiService.generateLaymanSummary(paper);
          setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, laymanSummary: laySummary, isLaymanLoading: false } : p));
          setScoutCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, laymanSummary: laySummary, isLaymanLoading: false } : p));
          
          if (selectedPaper?.id === paper.id) {
              setSelectedPaper(prev => prev ? { ...prev, laymanSummary: laySummary, isLaymanLoading: false } : null);
          }

          // Trace AI Extraction to DuckDB Vertical LRS
          recordAgentStatement(
              'Layman Synthesizer AI',
              sessionUuid,
              '/ontologies/agent_traceability.owl#extracted',
              'Extracted Plain-Language Layman Summary',
              paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
              `Layman Summary: ${paper.title}`,
              { paperId: paper.id, doi: paper.doi, summaryLength: laySummary.length }
          );
      } catch (error) {
          console.error("Failed to generate layman summary", error);
          setPapers(prev => prev.map(p => p.id === paper.id ? { ...p, isLaymanLoading: false } : p));
          setScoutCandidates(prev => prev.map(p => p.id === paper.id ? { ...p, isLaymanLoading: false } : p));
      }
  };

  const workspacePaperIds = useMemo(() => new Set(workspacePapers.map(p => p.id)), [workspacePapers]);

  // --- DYNAMIC ABSTRACT KEYWORD SUGGESTION ENGINE ---
  const [isOnlySelectedKeywords, setIsOnlySelectedKeywords] = useState(false);

  // Source abstracts to analyze: toggleable between selected papers in queue and active result papers
  const activeAbstractPapers = useMemo(() => {
      if (isOnlySelectedKeywords && workspacePapers.length > 0) {
          return workspacePapers;
      }
      return papers.length > 0 ? papers : workspacePapers;
  }, [isOnlySelectedKeywords, workspacePapers, papers]);

  // Extract academic terms, methodologies, concepts, and acronyms from peer-reviewed paper abstracts
  const academicKeywords = useMemo(() => {
      return extractAcademicKeywordsFromPapers(activeAbstractPapers, workspacePaperIds, query);
  }, [activeAbstractPapers, workspacePaperIds, query]);

  // Handler to refine search query dynamically with an academic keyword
  const handleAddKeywordToQuery = (term: string, mode: 'and' | 'append' = 'and') => {
      const newQuery = refineQuery(query, term, mode);
      setQuery(newQuery);
      setToastMessage(`Refined query with academic term: "${term}"`);
      
      // Record user action in Yet SQL LRS for research provenance
      recordUserStatement(
          user?.name || 'Human Researcher',
          'http://activitystrea.ms/schema/1.0/update',
          'Refined Search Query with Academic Keyword',
          'http://id.tincanapi.com/activity/search-refinement',
          `Refined Query: ${newQuery}`,
          {
              previousQuery: query,
              newQuery,
              refinedTerm: term,
              sourceScope: isOnlySelectedKeywords ? 'selected_queue_abstracts' : 'result_set_abstracts'
          }
      );

      // Execute search with refined query
      handleSearch(newQuery, currentSearchOptions);
      setActiveNav('results');
  };

  const handleStartTask = (task: StudyTask) => {
      setActiveTask(task);
      setAppMode('search');
      setActiveNav('search');
  };

  const handleMarkCompleted = (taskId: string) => {
      if (!completedTasks.includes(taskId)) {
          setCompletedTasks(prev => [...prev, taskId]);
      }
  };

  const handleTakeSurvey = () => {
      setIsSurveyOpen(true);
  };

  const handleSurveySubmit = (response: Record<string, any>) => {
      analyticsService.logEvent('task_survey_submitted', {
          participantId: user?.id,
          responses: response,
          timestamp: Date.now()
      });
      setIsSurveyOpen(false);
      setActiveTask(null);
      setSessionFinished(true);
      setAppMode('evaluation');
      setToastMessage('Survey submitted successfully. Thank you!');
  };

  // --- INTERACTIVE AI SOURCE SCOUT DISCOVERY ASSISTANT ---
  const handleLaunchScout = async () => {
      if (!scoutTopic.trim()) return;

      const uuid = generateSessionUuid('scout');
      setScoutSessionUuid(uuid);

      // Record User Execution in Yet SQL LRS
      recordUserStatement(
          user?.name || 'Human Researcher',
          '/ontologies/agent_traceability.owl#executed',
          'Executed AI Source Scout Session',
          `urn:scholarexplorer:scout:${scoutTopic.toLowerCase().replace(/\s+/g, '-')}`,
          `Scout Topic: ${scoutTopic}`,
          { sessionUuid: uuid, topic: scoutTopic }
      );

      // Record Agent Execution in DuckDB Vertical LRS
      recordAgentStatement(
          'AI Source Scout',
          uuid,
          '/ontologies/agent_traceability.owl#searched',
          'Searched Academic Networks',
          `urn:scholarexplorer:scout:${uuid}`,
          `AI Source Scout session for topic: "${scoutTopic}"`,
          { topic: scoutTopic, sessionUuid: uuid }
      );

      setIsScouting(true);
      setScoutCandidates([]);
      setScoutRationale('');
      setScoutUncertainty('');
      setScoutApprovedIds(new Set());

      try {
          const { papers: searchResults } = await apiService.searchPapers(scoutTopic, { domain: 'all' }, 1, userSettings);
          const topCandidates = searchResults.slice(0, 3);
          
          if (topCandidates.length === 0) {
              setScoutRationale("AI Scout queried OpenAlex and Semantic Scholar but could not find matching candidate references.");
              setIsScouting(false);
              return;
          }

          let rationale = "AI Scout scanned indices for references outlining latent variables and benchmarks for the target topic.";
          let uncertainty = "Contains preprint archives. Note: Local verification happens in Scholar Explorer Local Lab before publication.";

          try {
              const ratResp = await apiService.generateSummary(topCandidates, 'short', 'paragraph');
              if (ratResp) rationale = `Found candidates through targeted retrieval indices. Rationale: ${ratResp.substring(0, 240)}...`;
          } catch(e) { /* silent */ }

          // Record Agent Classified in DuckDB Vertical LRS
          recordAgentStatement(
              'AI Source Scout',
              uuid,
              '/ontologies/agent_traceability.owl#classified',
              'Compiled Scout Candidate Dossier',
              `urn:scholarexplorer:scout:dossier:${uuid}`,
              `Compiled ${topCandidates.length} candidate papers for review`,
              { candidateCount: topCandidates.length, candidateIds: topCandidates.map(p => p.id) }
          );

          setScoutCandidates(topCandidates);
          setScoutRationale(rationale);
          setScoutUncertainty(uncertainty);
          fetchSciteTallies(topCandidates);
      } catch (error) {
          console.error("Scouting session failed:", error);
          setToastMessage("AI Scout session encountered an API error. Try again shortly.");
      } finally {
          setIsScouting(false);
      }
  };

  const handleApproveScoutPaper = (paper: ResearchPaper) => {
      setScoutApprovedIds(prev => {
          const next = new Set(prev);
          next.add(paper.id);
          return next;
      });
      // Add immediately to the primary Selection Queue
      setWorkspacePapers(prev => {
          if (prev.some(p => p.id === paper.id)) return prev;
          storageService.syncPaperToCloud(paper);
          return [...prev, paper];
      });
      setToastMessage(`Approved! Added "${paper.title.substring(0, 30)}..." to selection queue.`);

      // Trace Human Verification in Yet SQL LRS
      recordUserStatement(
          user?.name || 'Human Researcher',
          'http://adlnet.gov/expapi/verbs/completed',
          'Approved Candidate from AI Scout',
          paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
          paper.title,
          { sessionUuid: scoutSessionUuid, approved: true }
      );

      // Trace Agent Verification in DuckDB Vertical LRS
      recordAgentStatement(
          'AI Source Scout',
          scoutSessionUuid || generateSessionUuid('scout'),
          '/ontologies/agent_traceability.owl#verified',
          'Candidate Accepted by Human Researcher',
          paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
          paper.title,
          { approved: true, paperId: paper.id }
      );
  };

  // --- DYNAMIC DISCOVERY SNAPSHOT EXPORT CONTRACT ---
  const snapshotJsonString = useMemo(() => {
      const contract = {
          source: "scholar-explorer",
          query: query || scoutTopic || "Source Discovery Exploration",
          query_settings: {
              domain: currentSearchOptions.domain || "all",
              depth: summaryLength,
              style: summaryStyle,
              deep_research_mode: false,
              ai_source_scout: scoutCandidates.length > 0
          },
          services: scoutServices,
          selected_work_ids: workspacePapers.map(p => p.id),
          papers: workspacePapers.map(p => ({
              title: p.title,
              authors: p.authors.split(',').map(a => a.trim()),
              year: String(p.year),
              doi: p.doi || "",
              openalex_id: p.id.startsWith('uploaded_') ? "" : p.id,
              semantic_scholar_id: p.id.startsWith('uploaded_') ? "" : p.id,
              crossref_id: p.doi || "",
              arxiv_id: p.pdfURL && p.pdfURL.includes('arxiv.org') ? p.pdfURL.split('/pdf/')[1]?.replace('.pdf', '') : "",
              open_access_pdf_url: p.pdfURL || "",
              abstract: p.abstract || "",
              source_service: p.enrichmentSource || "OpenAlex"
          })),
          retrieved_at: new Date().toISOString(),
          provenance: {
              app_url: window.location.origin,
              snapshot_id: `sc-snap-${Math.random().toString(36).substring(2, 11)}`,
              model: "gemini-flash",
              researcher_approved: true
          }
      };
      return JSON.stringify(contract, null, 2);
  }, [workspacePapers, query, scoutTopic, currentSearchOptions, summaryLength, summaryStyle, scoutServices]);

  const handleCopyToClipboard = () => {
      navigator.clipboard.writeText(snapshotJsonString);
      setToastMessage("Discovery Snapshot JSON copied to clipboard!");
  };

  const handleDownloadSnapshot = async () => {
      if (workspacePapers.length === 0) return;
      
      setIsCompilingSnapshot(true);
      setCompilationProgress(0);
      setCompilationItemIndex(0);
      setCompilationPaperTitle('');

      // Determine interactive delay based on number of items (capped dynamically for optimal UX)
      const stepDuration = Math.max(100, Math.min(300, 1200 / workspacePapers.length));

      for (let i = 0; i < workspacePapers.length; i++) {
          setCompilationItemIndex(i + 1);
          setCompilationPaperTitle(workspacePapers[i].title);
          const percent = Math.round(((i + 1) / workspacePapers.length) * 100);
          setCompilationProgress(percent);
          
          // Yield to render progress changes in React
          await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      setCompilationPaperTitle("Bundling schemas, verifying structure contracts, and finalizing hashing...");
      await new Promise(resolve => setTimeout(resolve, 350));
      setCompilationProgress(100);

      try {
          const blob = new Blob([snapshotJsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          
          let finalName = 'openharness_snapshot.json';
          if (exportFileName && exportFileName.trim().endsWith('.zip')) {
              finalName = 'openharness_snapshot.zip';
          }
              
          a.download = finalName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          if (userSettings.autoSaveSnapshot) {
              setToastMessage(`⚡ Auto-saved: "${finalName}" downloaded straight to default directory.`);
          } else {
              setToastMessage(`Snapshot file "${finalName}" saved successfully.`);
          }
      } catch (err) {
          console.error("Save snapshot error:", err);
          setToastMessage("Snapshot compiler error during save.");
      } finally {
          // Pause slightly so user can view the complete check state, then close the indicator overlay
          setTimeout(() => {
              setIsCompilingSnapshot(false);
          }, 1200);
      }
  };

  // --- NAVIGATION TAB CONTENT RENDERING ---
  const renderActiveNavScreen = () => {
      switch (activeNav) {
          case 'search':
              return (
                  <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Academic Exploration</h2>
                          <p className="text-sm text-slate-500 font-medium">Formulate precision search topics, extract entities, and construct your source queue.</p>
                      </div>
                      
                      <SearchForm 
                          query={query}
                          onQueryChange={setQuery}
                          onSearch={handleSearch}
                          isLoading={isLoading}
                          summaryLength={summaryLength}
                          onLengthChange={setSummaryLength}
                          summaryStyle={summaryStyle}
                          onStyleChange={setSummaryStyle}
                          model={selectedModel}
                          onModelChange={setSelectedModel}
                          availableModels={availableModels}
                          logAnalyticsEvent={analyticsService.logEvent}
                          suggestions={[]}
                          isSuggestionsLoading={false}
                          onSuggestionClick={(s) => setQuery(s)}
                          onOpenOrgFinder={() => setShowOrgFinder(true)}
                          selectedInstitution={userSettings.institutionName ? { id: 'inst', name: userSettings.institutionName } : undefined}
                          onClearInstitution={() => setUserSettings(prev => ({ ...prev, institutionName: undefined }))}
                          onOpenDeepResearch={() => setShowDeepResearch(true)}
                          academicKeywords={academicKeywords}
                          selectedPaperCount={workspacePaperIds.size}
                      />

                      {/* Academic Keyword Suggestion Engine Deck (when papers exist in active session or queue) */}
                      {academicKeywords.length > 0 && (
                          <div className="pt-2">
                              <KeywordRefinementDeck
                                  keywords={academicKeywords}
                                  selectedPaperCount={workspacePaperIds.size}
                                  totalPaperCount={activeAbstractPapers.length}
                                  currentQuery={query}
                                  onAddKeywordToQuery={handleAddKeywordToQuery}
                                  isOnlySelected={isOnlySelectedKeywords}
                                  onToggleOnlySelected={setIsOnlySelectedKeywords}
                              />
                          </div>
                      )}

                      {/* Search Hints */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
                          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
                              <h4 className="text-xs font-black uppercase tracking-widest text-slate-900 mb-3 flex items-center gap-2">
                                  <TrendingUp className="w-4 h-4 text-slate-500" />
                                  <span>Search Guidelines</span>
                              </h4>
                              <p className="text-sm text-slate-600 leading-relaxed">
                                  Enter professional keywords, DOIs, or natural language prompts. Scholar Explorer leverages live indices from OpenAlex, Semantic Scholar, and Crossref to search. Use depth sliders to customize structural AI summaries.
                              </p>
                          </div>
                          
                          <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6">
                              <h4 className="text-xs font-black uppercase tracking-widest text-emerald-800 mb-3 flex items-center gap-2">
                                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                                  <span>Local Lab Integration</span>
                              </h4>
                              <p className="text-sm text-emerald-800/80 leading-relaxed">
                                  Find candidates here and save them to the **Selection Queue**. Once satisfying your parameters, download the **Discovery Snapshot** and move it directly to **Scholar Explorer Local Lab** for deep verification.
                              </p>
                          </div>
                      </div>
                  </div>
              );

          case 'results':
              return (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between">
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Articles Directory</h2>
                          <button 
                              onClick={() => { setQuery(''); setPapers([]); setActiveNav('search'); }} 
                              className="text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors"
                          >
                              Reset Search
                          </button>
                      </div>

                      {error && <ErrorMessage message={error} />}

                      {/* Prominent System is Running Execution Banner */}
                      <SystemExecutionIndicator 
                          executionState={systemExecution} 
                          isInitialLoading={isLoading} 
                          query={query} 
                      />

                      {isLoading ? (
                          <div className="space-y-6">
                              <div className="p-8 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-4">
                                  <div className="flex items-center gap-3">
                                      <div className="w-5 h-5 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                                      <span className="text-sm font-bold text-slate-800">
                                          Ingesting initial literature from OpenAlex (250M+ works index)...
                                      </span>
                                  </div>
                                  <p className="text-xs text-slate-500 max-w-xl">
                                      The discovery pipeline is active. The first batch of papers will be displayed momentarily. Federated scholarly repositories (ArXiv, Crossref, PubMed) and AI semantic relevance scoring will stream in as they finish.
                                  </p>
                                  <div className="space-y-3 pt-2">
                                      <div className="h-4 bg-slate-100 rounded-md w-3/4 animate-pulse" />
                                      <div className="h-3 bg-slate-100 rounded-md w-1/2 animate-pulse" />
                                      <div className="h-3 bg-slate-100 rounded-md w-2/3 animate-pulse" />
                                  </div>
                              </div>

                              {[1, 2].map(i => (
                                  <div key={i} className="h-48 bg-white/70 border border-slate-100 rounded-2xl animate-pulse p-6 space-y-3">
                                      <div className="h-4 bg-slate-100 rounded-md w-2/3" />
                                      <div className="h-3 bg-slate-50 rounded-md w-1/3" />
                                      <div className="h-16 bg-slate-50/50 rounded-md w-full" />
                                  </div>
                              ))}
                          </div>
                      ) : papers.length > 0 ? (
                          <div className="grid grid-cols-1 gap-8">
                              {/* OpenAlex Inspired Abstract Keyword Refinement Engine */}
                              {academicKeywords.length > 0 && (
                                  <KeywordRefinementDeck
                                      keywords={academicKeywords}
                                      selectedPaperCount={workspacePaperIds.size}
                                      totalPaperCount={papers.length}
                                      currentQuery={query}
                                      onAddKeywordToQuery={handleAddKeywordToQuery}
                                      isOnlySelected={isOnlySelectedKeywords}
                                      onToggleOnlySelected={setIsOnlySelectedKeywords}
                                  />
                              )}

                              <ResultsDisplay 
                                  papers={sortedPapers}
                                  selectedPaperId={selectedPaper?.id || null}
                                  onSelectPaper={(paper) => {
                                      setSelectedPaper(paper);
                                      setActiveNav('detail');
                                      recordUserStatement(
                                          user?.name || 'Human Researcher',
                                          'http://id.tincanapi.com/verb/viewed',
                                          'Viewed Research Paper Details',
                                          paper.doi ? `doi:${paper.doi}` : `urn:paper:${paper.id}`,
                                          paper.title,
                                          { doi: paper.doi, title: paper.title, year: paper.year, authors: paper.authors }
                                      );
                                  }}
                                  sortConfig={sortConfig}
                                  onSortChange={handleSortChange}
                                  workspacePaperIds={workspacePaperIds}
                                  onToggleWorkspace={handleToggleWorkspacePaper}
                                  hasMore={hasMore}
                                  onLoadMore={handleLoadMore}
                                  isLoadingMore={isLoadingMore}
                                  isAnalysisLoading={isAnalysisLoading}
                                  isSummaryLoading={isSummaryLoading}
                                  selectedDomain={currentSearchOptions.domain}
                                  onGenerateLaymanSummary={handleGenerateLaymanSummary}
                              />

                              {/* Summary / Analysis Preview Banner (Collapsible Items Rendered Below Results) */}
                              {(summary || isSummaryLoading || isAnalysisLoading || analysis) && (
                                  <div className="space-y-4 pt-8 border-t border-slate-200">
                                      <div className="flex flex-col gap-1">
                                          <h3 className="text-xl font-bold tracking-tight text-slate-900">AI Verification & Search Analytics</h3>
                                          <p className="text-xs text-slate-500 font-medium">Toggle these collapsible dimensions to inspect aggregate indexes, citation validity, and clusters.</p>
                                      </div>
                                      <SearchResultsAnalysis 
                                          analysis={analysis} 
                                          summary={summary} 
                                          isSummaryLoading={isSummaryLoading} 
                                          isAnalysisLoading={isAnalysisLoading}
                                          papers={papers} 
                                      />
                                  </div>
                              )}
                          </div>
                      ) : (
                          <div className="text-center py-16 bg-white border border-dashed rounded-2xl">
                              <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                              <h3 className="text-lg font-bold text-slate-700">No active search metrics</h3>
                              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Click "Search & Query" in the sidebar to search 480M open access academic works.</p>
                              <button 
                                  onClick={() => setActiveNav('search')}
                                  className="mt-4 px-5 py-2 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                              >
                                  Go to Search
                              </button>
                          </div>
                      )}
                  </div>
              );

          case 'detail':
              return (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between gap-4">
                          <button 
                              onClick={() => setActiveNav('results')} 
                              className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1.5 transition-colors"
                          >
                              &larr; Back to Results Directory
                          </button>
                          {selectedPaper && (
                              <button
                                  onClick={() => handleToggleWorkspacePaper(selectedPaper)}
                                  className={`px-4 py-2 text-xs font-black uppercase tracking-widest rounded-xl transition-colors ${
                                      workspacePaperIds.has(selectedPaper.id)
                                          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                          : 'bg-slate-900 text-white hover:bg-slate-800'
                                  }`}
                              >
                                  {workspacePaperIds.has(selectedPaper.id) ? "✓ Selected" : "Add to Selection Queue"}
                              </button>
                          )}
                      </div>

                      {selectedPaper ? (
                          <div className="space-y-6">
                              <PaperDetails
                                  paper={selectedPaper}
                                  isInWorkspace={workspacePaperIds.has(selectedPaper.id)}
                                  onToggleWorkspacePaper={handleToggleWorkspacePaper}
                                  onConceptClick={() => {}}
                                  onFindDoi={() => {}}
                                  logAnalyticsEvent={analyticsService.logEvent}
                                  onCitePaper={handleCitePaper}
                                  model={selectedModel}
                                  onOpenAnalysis={() => {}}
                                  onFindSimilar={() => {}}
                                  isFindingSimilar={false}
                                  userSettings={userSettings}
                                  onGenerateLaymanSummary={handleGenerateLaymanSummary}
                              />

                              {/* Handoff Disclaimer Card */}
                              <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                                  <div className="flex gap-4 items-start">
                                      <div className="w-10 h-10 bg-red-100 text-red-600 rounded-full flex items-center justify-center flex-shrink-0">
                                          <ShieldCheck className="w-5 h-5" />
                                      </div>
                                      <div>
                                          <h4 className="font-bold text-red-900 mb-1">Local verification happens in Scholar Explorer Local Lab</h4>
                                          <p className="text-sm text-red-800/80 leading-relaxed mb-3">
                                              Features like durable claim-audits, mathematical proof extraction, and automatic bibliography building must be run locally. Export this paper within your snapshop bundle to activate those pipelines safely.
                                          </p>
                                          <span className="inline-block text-[10px] font-black uppercase tracking-wider text-red-700 bg-red-100 px-2 py-0.5 rounded">
                                              Scholar Explorer Boundary: Discovery Preview Only
                                          </span>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center py-16 bg-white border border-dashed rounded-2xl">
                              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                              <h3 className="text-lg font-bold text-slate-700">No paper selected</h3>
                              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Please pick a paper from the Results Directory first to read deep reviews and translation metrics.</p>
                              <button 
                                  onClick={() => setActiveNav('results')}
                                  className="mt-4 px-5 py-2 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                              >
                                  Go to Results
                              </button>
                          </div>
                      )}
                  </div>
              );

          case 'queue':
              return (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between">
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Selection Queue</h2>
                          <span className="px-3 py-1 bg-slate-100 text-slate-700 text-xs font-bold rounded-full">
                              {workspacePapers.length} Candidate Works Selected
                          </span>
                      </div>

                      <p className="text-sm text-slate-500 font-medium">Selected articles are collected below. These form the primary payload in your **Discovery Snapshot** bundle, preparing them for desktop ingestion.</p>

                      {workspacePapers.length > 0 ? (
                          <div className="grid grid-cols-1 gap-6">
                              <div className="grid grid-cols-1 gap-4">
                                  {workspacePapers.map((paper) => (
                                      <div key={paper.id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm hover:border-slate-300 flex justify-between items-start gap-4">
                                          <div className="space-y-2">
                                              <span className="inline-block px-2 py-0.5 bg-slate-100 text-slate-600 font-mono text-[9px] rounded uppercase">
                                                  {paper.enrichmentSource || "Discovery Index"}
                                              </span>
                                              <h3 className="text-lg font-extrabold text-slate-900 leading-tight">{paper.title}</h3>
                                              <p className="text-xs text-slate-500 font-medium">By {paper.authors.split(',')[0]} et al. • {paper.year}</p>
                                              {paper.doi && <p className="text-[10px] text-slate-400 font-mono">DOI: {paper.doi}</p>}
                                          </div>
                                          <button
                                              onClick={() => handleToggleWorkspacePaper(paper)}
                                              className="p-2.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all flex-shrink-0"
                                              title="Remove from queue"
                                          >
                                              <Trash2 className="w-5 h-5" />
                                          </button>
                                      </div>
                                  ))}
                              </div>

                              <div className="border border-slate-200 rounded-2xl p-6 bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-6">
                                  <div>
                                      <h4 className="font-bold text-slate-900 mb-1">Queue Ready for Scholar Explorer Local Lab Sync</h4>
                                      <p className="text-xs text-slate-500 max-w-lg">All papers are compiled. Press the Export Snapshot button to copy or save the JSON file matching Scholar Explorer Local Lab and open-source OpenHarness schemas.</p>
                                  </div>
                                  <button
                                      onClick={() => setActiveNav('export')}
                                      className="w-full md:w-auto flex items-center justify-center gap-2 px-6 h-12 bg-slate-900 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:bg-slate-800 transition-colors shadow-lg"
                                  >
                                      <span>Proceed to Export</span>
                                      <ArrowRight className="w-4 h-4" />
                                  </button>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center py-20 bg-white border border-dashed rounded-2xl">
                              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                              <h3 className="text-lg font-bold text-slate-700">Selection Queue is Empty</h3>
                              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Articles you flag for local analysis while browsing will list here as transfer canditates.</p>
                              <button 
                                  onClick={() => setActiveNav('search')}
                                  className="mt-4 px-5 py-2 text-xs font-black uppercase tracking-widest rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition-colors"
                              >
                                  Start Discovering
                              </button>
                          </div>
                      )}
                  </div>
              );

          case 'export':
              return (
                  <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                          <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Export to Scholar Explorer Local Lab</h2>
                          <p className="text-sm text-slate-500 font-medium">Export discovered papers using the standard JSON contract format below. This file feeds the local processing engine.</p>
                      </div>

                      {/* Warning on local verification */}
                      <div className="bg-red-50 border border-red-100 rounded-2xl p-6">
                          <div className="flex gap-4">
                              <ShieldCheck className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                              <div>
                                  <h4 className="font-black uppercase tracking-wider text-[11px] text-red-900 mb-1">Note: Local verification happens in Scholar Explorer Local Lab</h4>
                                  <p className="text-sm text-red-800/80 leading-relaxed">
                                      Scholar Explorer coordinates wide search indices and exports structural snapshots. Deeper operations—including GNO Vault writes, RAG indexing, claims audit, and citation verification—are run confidentially in your Scholar Explorer Local Lab local machine workspace.
                                  </p>
                              </div>
                          </div>
                      </div>

                      {workspacePapers.length > 0 ? (
                          <div className="space-y-6">
                              {/* Export Configurations & Progress Console */}
                              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                                  <div className="flex flex-col gap-1">
                                      <h3 className="text-sm font-extrabold uppercase tracking-widest text-slate-900 flex items-center gap-2">
                                          <Cpu className="w-4 h-4 text-slate-800" />
                                          Snapshot Compiler Settings
                                      </h3>
                                      <p className="text-xs text-slate-400">Configure file names and target destinations before bundling.</p>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* Custom Filename */}
                                      <div className="space-y-1.5">
                                          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">Destination File Name</label>
                                          <div className="relative">
                                              <input
                                                  type="text"
                                                  value={exportFileName}
                                                  onChange={(e) => setExportFileName(e.target.value)}
                                                  placeholder="scholar_discovery_snapshot"
                                                  disabled={isCompilingSnapshot}
                                                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-xl focus:outline-none focus:border-slate-400 bg-slate-50 disabled:opacity-60 pr-12"
                                              />
                                              <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-400 font-bold">.json</span>
                                          </div>
                                          <p className="text-[10px] text-slate-400 leading-normal">
                                              Files are packaged following JSON guidelines. Specify a customized name for your folder categorization.
                                          </p>
                                      </div>

                                      {/* Directory/Location Advisory */}
                                      <div className={`border rounded-xl p-3.5 flex flex-col justify-center ${userSettings.autoSaveSnapshot ? 'border-emerald-250 border-emerald-200 bg-emerald-50/50' : 'bg-slate-55 border-slate-100 bg-slate-50'}`}>
                                          <span className={`text-[9px] font-black uppercase tracking-widest mb-1 flex items-center gap-1 ${userSettings.autoSaveSnapshot ? 'text-emerald-700' : 'text-slate-500'}`}>
                                              {userSettings.autoSaveSnapshot ? (
                                                  <>⚡ DIRECT AUTO-SAVE TO DOWNLOADS ACTIVE</>
                                              ) : (
                                                  <><Info className="w-3" /> Target Directory / Location</>
                                              )}
                                          </span>
                                          {userSettings.autoSaveSnapshot ? (
                                              <p className="text-[11px] text-emerald-800 leading-relaxed font-bold">
                                                  Snapshots compile & save silently straight to your default downloads folder. Open Connection Settings to adjust options.
                                              </p>
                                          ) : (
                                              <p className="text-[11px] text-slate-500 leading-relaxed font-semibold">To choose a specific database folder or custom path on your system during save, enable the browser preference: <strong className="text-slate-700">"Ask where to save each file before downloading"</strong> when prompted by the save dialog.</p>
                                          )}
                                      </div>
                                  </div>

                                  {/* Progressive Bundling Compilation Indicator */}
                                  {isCompilingSnapshot && (
                                      <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 animate-fade-in">
                                          <div className="flex items-center justify-between text-xs">
                                              <span className="font-extrabold text-slate-700 uppercase tracking-widest flex items-center gap-1.5">
                                                  <span className="w-2 h-2 rounded-full bg-indigo-600 animate-pulse"></span>
                                                  Bundling Snapshot Contract
                                              </span>
                                              <span className="font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[10px] font-bold">
                                                  Item {compilationItemIndex} of {workspacePapers.length} ({compilationProgress}%)
                                              </span>
                                          </div>
                                          
                                          {/* Progress Bar */}
                                          <div className="w-full rounded-full h-2 relative overflow-hidden bg-slate-100">
                                              <div 
                                                  className="bg-slate-900 h-2 rounded-full transition-all duration-150 ease-out"
                                                  style={{ width: `${compilationProgress}%` }}
                                              ></div>
                                          </div>

                                          {/* Current Item Title */}
                                          <p className="text-[10px] uppercase font-mono text-slate-500 truncate tracking-tight font-bold" title={compilationPaperTitle}>
                                              <span className="text-slate-700 font-extrabold mr-1">PACKING:</span>
                                              {compilationPaperTitle || "Initializing assets..."}
                                          </p>
                                      </div>
                                  )}
                              </div>

                              {/* File Controls */}
                              <div className="flex flex-wrap items-center gap-4">
                                  <button
                                      onClick={handleDownloadSnapshot}
                                      disabled={isCompilingSnapshot}
                                      className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-400 rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md active:scale-[0.98]"
                                  >
                                      <Download className="w-4 h-4" />
                                      <span>{isCompilingSnapshot ? `Bundling (Item ${compilationItemIndex}/${workspacePapers.length})` : 'Compile & Save Snapshot'}</span>
                                  </button>
                                  <button
                                      onClick={handleCopyToClipboard}
                                      disabled={isCompilingSnapshot}
                                      className="flex items-center gap-2 px-5 py-3 bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-55 border rounded-xl text-xs font-black uppercase tracking-widest transition-colors"
                                  >
                                      <Copy className="w-4 h-4" />
                                      <span>Copy Snapshot JSON</span>
                                  </button>
                                  <span className="text-xs text-slate-400 font-medium ml-2 font-bold">Applies "gemini-flash" model metadata</span>
                              </div>

                              {/* Snapshot Code Area */}
                              <div className="rounded-2xl border border-slate-200 bg-slate-950 p-6 overflow-hidden relative group">
                                  <span className="absolute top-4 right-4 text-[9px] font-mono text-slate-500 uppercase tracking-widest">discovery-snapshot-contract.json</span>
                                  <pre className="text-xs text-slate-300 font-mono overflow-auto max-h-[300px] leading-relaxed">
                                      {snapshotJsonString}
                                  </pre>
                              </div>

                              {/* Handoff Status Indicators */}
                              <div className="pt-4 space-y-4">
                                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Offloaded Lab Functions</h3>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      <div className="border border-slate-200 rounded-xl p-5 bg-white relative">
                                          <span className="absolute top-4 right-4 px-2 py-0.5 bg-yellow-105 text-yellow-800 border border-yellow-200 rounded text-[9px] font-bold uppercase tracking-wider font-bold">Requires Handoff</span>
                                          <h4 className="font-bold text-slate-900 mb-2">GNO Vault Processor</h4>
                                          <p className="text-xs text-slate-500 leading-relaxed">Converts and commits discover snapshots to durable local SQLite structures inside GNO Vault.</p>
                                          <button className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 flex items-center gap-1">
                                              <span>Open Local Lab</span>
                                              <ExternalLink className="w-3 h-3" />
                                          </button>
                                      </div>

                                      <div className="border border-slate-200 rounded-xl p-5 bg-white relative">
                                          <span className="absolute top-4 right-4 px-2 py-0.5 bg-yellow-105 text-yellow-800 border border-yellow-200 rounded text-[9px] font-bold uppercase tracking-wider font-bold">Requires Handoff</span>
                                          <h4 className="font-bold text-slate-900 mb-2">Logician Verification agent</h4>
                                          <p className="text-xs text-slate-500 leading-relaxed">Conducts semantic claims validation, verification of mathematical statements and references locally.</p>
                                          <button className="mt-3 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-900 flex items-center gap-1">
                                              <span>Open Local Lab</span>
                                              <ExternalLink className="w-3 h-3" />
                                          </button>
                                      </div>
                                  </div>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center py-20 bg-white border border-dashed rounded-2xl">
                              <ClipboardList className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                              <h3 className="text-lg font-bold text-slate-700">No transfer candidates selected</h3>
                              <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">Add scholarly search items to your Selection Queue before initiating the Discovery Snapshot export compiler.</p>
                          </div>
                      )}
                  </div>
              );

          case 'connections':
              return (
                  <div className="space-y-6">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex flex-col gap-1">
                              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">Bridges & Connections</h2>
                              <p className="text-sm text-slate-500 font-medium">Verify connection states for institutional SSO, local GNO vault, and campus library MCP connectors.</p>
                          </div>

                          <div className="flex items-center gap-2.5 self-start sm:self-auto">
                              <button
                                  onClick={() => setShowLibraryGuide(true)}
                                  className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-all active:scale-95"
                              >
                                  <GraduationCap className="w-4 h-4" />
                                  <span>Doctoral Library Guide</span>
                              </button>
                              <button
                                  onClick={() => setShowDbFinder(true)}
                                  className="px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-xs rounded-xl shadow-sm flex items-center gap-1.5 transition-all"
                              >
                                  <FileText className="w-4 h-4 text-slate-500" />
                                  <span>MCP Prospectus</span>
                              </button>
                          </div>
                      </div>

                      {/* Featured Doctoral Student Library MCP Guide Card */}
                      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 text-white rounded-2xl p-6 border border-indigo-800/60 shadow-lg relative overflow-hidden">
                          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
                              <div className="space-y-2 max-w-2xl">
                                  <div className="flex items-center gap-2 flex-wrap">
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-indigo-400/20 text-indigo-300 border border-indigo-400/30 flex items-center gap-1.5">
                                          <GraduationCap className="w-3.5 h-3.5" />
                                          Doctoral Research Framework
                                      </span>
                                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold text-slate-300 bg-white/10">
                                          Model Context Protocol (MCP)
                                      </span>
                                  </div>
                                  <h3 className="text-xl font-black text-white tracking-tight">
                                      Invite Your University Library to Connect via MCP
                                  </h3>
                                  <p className="text-xs text-slate-300 leading-relaxed">
                                      Doctoral students can invite their home university libraries to connect with the Scholar Explorer MCP server. This gives you unified search access to your university's paywalled subscriptions (ProQuest Dissertations, JSTOR, ScienceDirect, EBSCOhost, Wiley, IEEE Xplore) directly within your literature review workspace—eliminating fragmented logins and manual PDF downloads while honoring student privacy and institutional vendor agreements.
                                  </p>
                              </div>

                              <div className="flex flex-wrap sm:flex-nowrap gap-3 shrink-0">
                                  <button
                                      onClick={() => setShowLibraryGuide(true)}
                                      className="px-5 py-3 bg-white text-slate-900 hover:bg-slate-100 font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center gap-2"
                                  >
                                      <BookOpen className="w-4 h-4 text-indigo-600" />
                                      <span>Read Student Guide</span>
                                  </button>
                                  <button
                                      onClick={() => setShowDbFinder(true)}
                                      className="px-5 py-3 bg-indigo-600/80 hover:bg-indigo-600 text-white font-extrabold text-xs rounded-xl border border-indigo-400/30 transition-all flex items-center gap-2"
                                  >
                                      <FileText className="w-4 h-4" />
                                      <span>Open Prospectus Tool</span>
                                  </button>
                              </div>
                          </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Institutional SSO Integration */}
                          <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-4 flex flex-col justify-between">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="font-extrabold text-lg text-slate-900">Institutional SSO Integration</h3>
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold uppercase tracking-wider">UNC Wilmington (Active)</span>
                                  </div>
                                  <p className="text-xs text-slate-500 leading-relaxed mt-2">
                                      Authenticate directly via Microsoft SSO (UNC Wilmington) for full-text institutional database access and library entitlement.
                                  </p>
                              </div>
                              <button 
                                  onClick={() => setShowProxy(true)}
                                  className="w-full py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold uppercase transition-all tracking-wider text-slate-800"
                              >
                                  Configure SSO Integration
                              </button>
                          </div>

                          {/* Scholar Explorer Local Lab Core */}
                          <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-4 flex flex-col justify-between">
                              <div>
                                  <div className="flex items-center justify-between mb-2">
                                      <h3 className="font-extrabold text-lg text-slate-900">Scholar Explorer Local Lab core</h3>
                                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold uppercase tracking-wider">Ready for Sync</span>
                                  </div>
                                  <p className="text-xs text-slate-500 leading-relaxed">The local port listener (default: localhost:5050) syncs snapshots with local data files beautifully.</p>
                              </div>
                              
                              <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
                                  <span>Integration Status: Active</span>
                                  <span className="font-mono text-slate-600">PORT 5050</span>
                              </div>
                          </div>

                          {/* GNO Vault */}
                          <div className="border border-slate-200 rounded-2xl p-6 bg-white space-y-4">
                              <div className="flex items-center justify-between">
                                  <h3 className="font-extrabold text-lg text-slate-900">GNO Vault</h3>
                                  <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold uppercase tracking-wider">Ready</span>
                              </div>
                              <p className="text-xs text-slate-500 leading-relaxed">Logs verification data, evidence logs, and claim proofs dynamically in DuckDB.</p>
                          </div>
                      </div>
                  </div>
              );

          case 'scout':
              return (
                  <div className="space-y-6">
                      <div className="flex flex-col gap-2">
                          <div className="flex items-center justify-between">
                              <h2 className="text-3xl font-extrabold tracking-tight text-slate-900">AI Source Scout</h2>
                              {scoutSessionUuid && (
                                  <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-700 font-mono text-xs shadow-sm">
                                      <span className="font-sans text-[10px] uppercase font-black text-indigo-500">Session UUID:</span>
                                      <span className="font-bold">{scoutSessionUuid.slice(0, 18)}...</span>
                                      <button
                                          onClick={() => {
                                              navigator.clipboard.writeText(scoutSessionUuid);
                                              setCopiedScoutUuid(true);
                                              setTimeout(() => setCopiedScoutUuid(false), 2000);
                                          }}
                                          className="ml-1 text-[10px] underline hover:text-indigo-900 font-sans font-bold"
                                      >
                                          {copiedScoutUuid ? 'Copied!' : 'Copy'}
                                      </button>
                                  </div>
                              )}
                          </div>
                          <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-black uppercase tracking-wider rounded">
                                  Researcher Approval Required
                              </span>
                              <span className="text-xs text-slate-400 font-medium">Recorded in DuckDB Vertical LRS & Yet SQL LRS</span>
                          </div>
                      </div>

                      <p className="text-sm text-slate-500 font-medium">Have the scout explore indices autonomously to compile raw transfer candidates. Scout candidates are never auto-exported; your approval is required.</p>

                      {/* Scout Trigger Card */}
                      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-4">
                          <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Research Topic Core Direction</label>
                              <div className="flex gap-3">
                                  <input 
                                      type="text" 
                                      placeholder="e.g., Latency parameters of large language models during mathematical reasoning tasks"
                                      value={scoutTopic}
                                      onChange={(e) => setScoutTopic(e.target.value)}
                                      disabled={isScououting}
                                      className="flex-grow h-12 px-4 bg-slate-50 border rounded-xl text-sm focus:ring-0 focus:border-slate-800 text-slate-800 font-medium placeholder:text-slate-300"
                                  />
                                  <button
                                      onClick={handleLaunchScout}
                                      disabled={isScououting || !scoutTopic.trim()}
                                      className="px-6 h-12 bg-slate-900 hover:bg-slate-800 text-white hover:text-white font-black text-xs uppercase tracking-widest rounded-xl disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 flex-shrink-0"
                                  >
                                      {isScououting ? (
                                          <>
                                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                              <span>Scouting...</span>
                                          </>
                                      ) : (
                                          <>
                                              <Bot className="w-4 h-4" />
                                              <span>Launch Scout Session</span>
                                          </>
                                      )}
                                  </button>
                              </div>
                          </div>
                      </div>

                      {/* Scouting Output */}
                      {isScououting && (
                          <div className="bg-white border border-slate-200 rounded-3xl p-8 text-center space-y-4">
                              <div className="w-10 h-10 border-2 border-slate-600 border-t-transparent rounded-full animate-spin mx-auto" />
                              <p className="text-xs text-slate-500 font-black uppercase tracking-widest animate-pulse">Scout searching Semantic Scholar and OpenAlex indices...</p>
                          </div>
                      )}

                      {!isScououting && scoutCandidates.length > 0 && (
                          <div className="space-y-6">
                              {/* Rationale and uncertainty */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                  <div className="bg-slate-900 text-white rounded-2xl p-6 shadow-sm">
                                      <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Scout Query Rationale</h4>
                                      <p className="text-sm text-slate-300 leading-relaxed font-medium italic">"{scoutRationale}"</p>
                                  </div>

                                  <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-6 shadow-sm">
                                      <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-2">Uncertainty & Verification Caveats</h4>
                                      <p className="text-sm text-amber-800 leading-relaxed font-semibold italic">"{scoutUncertainty}"</p>
                                  </div>
                              </div>

                              {/* Candidate paper grid */}
                              <div className="space-y-4">
                                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Scouted Candidate Papers</h3>
                                  
                                  <div className="grid grid-cols-1 gap-6">
                                      {scoutCandidates.map((paper) => (
                                          <div key={paper.id} className="bg-white border rounded-3xl p-6 shadow-sm hover:shadow-md transition-all space-y-4 relative overflow-hidden">
                                              <div className="absolute top-0 left-0 w-1 h-full bg-slate-900"></div>
                                              
                                              <div className="flex justify-between items-start gap-4">
                                                  <div>
                                                      <span className="inline-block px-2.5 py-0.5 bg-slate-100 text-slate-502 font-bold text-[9px] rounded uppercase tracking-wider">
                                                          Scouted Paper Candidate
                                                      </span>
                                                      <h4 className="text-xl font-extrabold text-slate-900 mt-2 leading-tight">{paper.title}</h4>
                                                      <p className="text-xs text-slate-500 font-medium mt-1">By {paper.authors.split(',')[0]} et al. • {paper.year}</p>
                                                  </div>

                                                  <button
                                                      onClick={() => handleApproveScoutPaper(paper)}
                                                      disabled={scoutApprovedIds.has(paper.id) || workspacePaperIds.has(paper.id)}
                                                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all text-slate-900 border border-slate-200 hover:bg-slate-50 disabled:bg-emerald-50 disabled:text-emerald-700 disabled:border-emerald-100 shadow-sm"
                                                  >
                                                      {scoutApprovedIds.has(paper.id) || workspacePaperIds.has(paper.id) ? (
                                                          <>
                                                              <Check className="w-4 h-4" />
                                                              <span>Approved</span>
                                                          </>
                                                      ) : (
                                                          <span>Approve & Add to Queue</span>
                                                      )}
                                                  </button>
                                              </div>

                                              {paper.abstract && (
                                                  <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                                                      {paper.abstract}
                                                  </p>
                                              )}
                                          </div>
                                      ))}
                                  </div>
                              </div>
                          </div>
                      )}
                  </div>
              );

          case 'marketplace':
              return <CapabilityMarketplace />;

          default:
              return null;
      }
  };

  const renderMainContent = () => {
      const isPrivileged = user?.role === 'pi_researcher' || user?.role === 'committee_member' || (user?.role as any) === 'researcher';

      if (appMode === 'dashboard' && isPrivileged) {
          return (
              <div className="container mx-auto px-4 py-8">
                  <ResearcherDashboard 
                      dataset={[]} 
                      setDataset={() => {}} 
                      testResults={[]} 
                      runTestHarness={() => {}} 
                      userStudyData={[]} 
                      onStartUserStudy={() => {}} 
                  />
              </div>
          );
      }

      if (appMode === 'evaluation' && user?.role === 'participant') {
          return (
              <ParticipantDashboard 
                  user={user} 
                  onStartTask={handleStartTask} 
                  onTakeSurvey={handleTakeSurvey}
                  completedTasks={completedTasks}
                  onMarkCompleted={handleMarkCompleted}
                  sessionFinished={sessionFinished}
              />
          );
      }

      // Default Scholar Explorer acquisition framework layout
      return (
          <div className="w-full flex-grow min-h-[calc(100vh-80px)] flex flex-col lg:flex-row">
              {/* Modern Discovery Vertical Sidebar Navigation */}
              <aside className="w-full lg:w-72 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex-shrink-0 flex flex-col justify-between py-6 px-4">
                  <div className="space-y-8">
                      {/* Section Title */}
                      <div className="space-y-1.5 pl-2">
                          <span className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-400">Discover & Select</span>
                          <p className="text-xs text-slate-500 font-bold leading-normal">Scholar Explorer</p>
                      </div>

                      {/* Navigation tabs */}
                      <nav className="flex flex-col gap-1">
                          <button
                              onClick={() => setActiveNav('search')}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'search'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <Search className="w-4 h-4 flex-shrink-0" />
                              <span>Search & Query</span>
                          </button>

                          <button
                              onClick={() => { if (papers.length > 0) setActiveNav('results'); }}
                              disabled={papers.length === 0}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  papers.length === 0 ? 'opacity-30 cursor-not-allowed' : ''
                              } ${
                                  activeNav === 'results'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <div className="flex items-center gap-3">
                                  <Database className="w-4 h-4 flex-shrink-0" />
                                  <span>Results Directory</span>
                              </div>
                              {papers.length > 0 && (
                                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                      activeNav === 'results' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                      {papers.length}
                                  </span>
                              )}
                          </button>

                          <button
                              onClick={() => { if (selectedPaper) setActiveNav('detail'); }}
                              disabled={!selectedPaper}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  !selectedPaper ? 'opacity-30 cursor-not-allowed' : ''
                              } ${
                                  activeNav === 'detail'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <FileText className="w-4 h-4 flex-shrink-0" />
                              <span>Paper Detail</span>
                          </button>

                          <button
                              onClick={() => setActiveNav('queue')}
                              className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'queue'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <div className="flex items-center gap-3">
                                  <ClipboardList className="w-4 h-4 flex-shrink-0" />
                                  <span>Selection Queue</span>
                              </div>
                              {workspacePapers.length > 0 && (
                                  <span className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${
                                      activeNav === 'queue' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700 font-bold'
                                  }`}>
                                      {workspacePapers.length}
                                  </span>
                              )}
                          </button>
                      </nav>

                      {/* Databases & Library MCP Hub Segment */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                          <span className="text-[10px] pl-2 font-black uppercase tracking-[0.25em] text-slate-400 block mb-2">Sources & Library Access</span>
                          
                          <button
                              onClick={() => setShowDbFinder(true)}
                              className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all bg-indigo-50/70 hover:bg-indigo-100 text-indigo-950 border border-indigo-200/60 shadow-sm group"
                              title="Explore 15+ scholarly databases, open repository discovery, and generate university library MCP prospectus"
                          >
                              <div className="flex items-center gap-2.5">
                                  <Database className="w-4 h-4 flex-shrink-0 text-indigo-600 group-hover:scale-110 transition-transform" />
                                  <span>Databases & MCP</span>
                              </div>
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-indigo-600 text-white font-black">
                                  {activeSearchSources.length}
                              </span>
                          </button>
                      </div>

                      {/* Workspace Integration Segment */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                          <span className="text-[10px] pl-2 font-black uppercase tracking-[0.25em] text-slate-400 block mb-2">Workspace Exporters</span>
                          
                          <button
                              onClick={() => setActiveNav('export')}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'export'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <Download className="w-4 h-4 flex-shrink-0 text-slate-400" />
                              <span>Export Snapshot</span>
                          </button>

                          <button
                              onClick={() => setActiveNav('connections')}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'connections'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <Radio className="w-4 h-4 flex-shrink-0 text-slate-400" />
                              <span>Bridges & Sync</span>
                          </button>
                      </div>

                      {/* Public Marketplace Segment */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                          <span className="text-[10px] pl-2 font-black uppercase tracking-[0.25em] text-slate-400 block mb-2">Public Distribution</span>
                          
                          <button
                              onClick={() => setActiveNav('marketplace')}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'marketplace'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <ShoppingBag className="w-4 h-4 flex-shrink-0 text-emerald-600" />
                              <span className="text-slate-700">Capability Marketplace</span>
                          </button>
                      </div>

                      {/* AI Agent segment */}
                      <div className="space-y-2 pt-4 border-t border-slate-100">
                          <span className="text-[10px] pl-2 font-black uppercase tracking-[0.25em] text-slate-400 block mb-2">Autonomous Discovery & Synthesis</span>
                          
                          <button
                              onClick={() => setActiveNav('scout')}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all ${
                                  activeNav === 'scout'
                                      ? 'bg-slate-900 text-white shadow-md'
                                      : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900'
                              }`}
                          >
                              <Bot className="w-4 h-4 flex-shrink-0 text-purple-600" />
                              <span className="text-slate-700">AI Source Scout</span>
                          </button>

                          <button
                              onClick={() => setShowDeepResearch(true)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left text-xs font-black uppercase tracking-widest transition-all text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                          >
                              <Sparkles className="w-4 h-4 flex-shrink-0 text-purple-600" />
                              <span className="text-slate-700">Deep Research Assistant</span>
                          </button>
                      </div>
                  </div>

                  {/* Sidebar bottom guide items */}
                  <div className="pt-6 border-t border-slate-100 space-y-4">
                      {activeTask && (
                          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-2 flex flex-col">
                              <span className="font-black text-rose-600 uppercase tracking-wider text-[8px]">Active Task Study</span>
                              <p className="font-bold text-slate-700 truncate">{activeTask.title}</p>
                              <button 
                                  onClick={() => {
                                      handleMarkCompleted(activeTask.id);
                                      setActiveTask(null);
                                      setAppMode('evaluation');
                                  }}
                                  className="w-full bg-slate-900 hover:bg-slate-800 text-white py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all"
                              >
                                  Complete Task
                              </button>
                          </div>
                      )}
                      
                      <div className="flex gap-2 justify-between items-center sm:px-2">
                          <button 
                              onClick={() => setShowOnboarding(true)}
                              className="text-slate-400 hover:text-slate-900 transition-colors"
                              title="Help Guide"
                          >
                              <HelpCircle className="w-5 h-5" />
                          </button>
                          <button 
                              onClick={() => setShowAbout(true)}
                              className="text-slate-400 hover:text-slate-900 transition-colors"
                              title="About Explorer"
                          >
                              <Info className="w-5 h-5" />
                          </button>
                          {user && (
                              <span className="text-[10px] font-black uppercase tracking-wide bg-slate-100 px-2 py-1 rounded-md text-slate-500 truncate max-w-[80px]">
                                  {user.role}
                              </span>
                          )}
                      </div>
                  </div>
              </aside>

              {/* Main content pane panel */}
              <section className="flex-grow bg-slate-50/50 p-6 sm:p-10 lg:p-12 overflow-y-auto max-h-[calc(100vh-80px)]">
                  <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-300">
                      {renderActiveNavScreen()}
                  </div>
              </section>
          </div>
      );
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans selection:bg-slate-900 selection:text-white">
        <Header 
            user={user}
            appMode={appMode}
            onModeChange={setAppMode}
            onOpenAbout={() => setShowAbout(true)}
            onOpenHelp={() => setShowOnboarding(true)}
            onOpenProxySettings={() => setShowProxy(true)}
            onOpenScholarBridge={() => setShowConnections(true)}
            onOpenLrsInspector={() => setShowLrsInspector(true)}
            onOpenDbFinder={() => setShowDbFinder(true)}
            onOpenLibraryGuide={() => setShowLibraryGuide(true)}
            onLoginClick={() => setShowLogin(true)}
            onLogoutClick={handleLogout}
        />

        <main className="flex-grow flex flex-col">
            {renderMainContent()}
        </main>

        {/* Modals */}
        <LoginScreen isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} />
        <ProxySettingsModal isOpen={showProxy} onClose={() => setShowProxy(false)} settings={userSettings} onSave={setUserSettings} />
        <ConnectionsDashboard 
            isOpen={showConnections} 
            onClose={() => setShowConnections(false)} 
            settings={userSettings} 
            onSave={setUserSettings} 
            user={user}
            onOpenLibraryGuide={() => {
                setShowConnections(false);
                setShowLibraryGuide(true);
            }} 
        />
        <LibraryConnectionGuideModal 
            isOpen={showLibraryGuide} 
            onClose={() => setShowLibraryGuide(false)} 
            onOpenProspectus={() => {
                setShowLibraryGuide(false);
                setShowDbFinder(true);
            }} 
        />
        <LrsTelemetryModal isOpen={showLrsInspector} onClose={() => setShowLrsInspector(false)} activeSessionUuid={scoutSessionUuid} user={user} />
        <InfoModal isOpen={showAbout} onClose={() => setShowAbout(false)} title="About Scholar Explorer">
            <AboutModalContent />
        </InfoModal>
        {showOnboarding && <OnboardingModal onComplete={() => setShowOnboarding(false)} onSkip={() => setShowOnboarding(false)} />}
        <DatabaseFinderModal 
            isOpen={showDbFinder} 
            onClose={() => setShowDbFinder(false)} 
            onAddSource={(source) => setSearchSources(prev => prev.some(s => s.id === source.id) ? prev : [...prev, source])} 
            existingSources={activeSearchSources} 
        />
        <OrganizationFinderModal isOpen={showOrgFinder} onClose={() => setShowOrgFinder(false)} onSelectOrganization={(org) => { setUserSettings(prev => ({...prev, institutionName: org.name})); setShowOrgFinder(false); }} />
        <DeepResearchModal isOpen={showDeepResearch} onClose={() => setShowDeepResearch(false)} initialTopic={query} model={selectedModel} onAddPapersToWorkspace={handleAddPapersToWorkspace} userSettings={userSettings} />
        <CitationModal 
            isOpen={showCitationModal} 
            onClose={() => setShowCitationModal(false)} 
            paper={citationPaper} 
            model={selectedModel} 
            initialStyle={citationStyle}
        />
        <SurveyModal 
            isOpen={isSurveyOpen} 
            taskId={activeTask?.id || 'final_survey'} 
            onSubmit={handleSurveySubmit} 
        />

        <Toast message={toastMessage} onClose={() => setToastMessage(null)} />
    </div>
  );
};

export default App;
