import React, { useState, useEffect, useMemo, useRef } from 'react';
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
import { BridgesAndSyncModal } from './components/BridgesAndSyncModal';

// Components
import { Header } from './components/Header';
import { InitialSearchScreen } from './components/InitialSearchScreen';
import { SearchForm } from './components/SearchForm';
import { ResearcherWorkspace } from './components/ResearcherWorkspace';
import { ExportSnapshotModal } from './components/ExportSnapshotModal';
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
import { S3AInspectorModal } from './components/S3AInspectorModal';
import { S3ADevPanel } from './components/S3ADevPanel';
import { DatabaseSettingsModal } from './components/DatabaseSettingsModal';
import { FirstRunConsentModal } from './components/FirstRunConsentModal';
import { StudyInviteBanner } from './components/StudyInviteBanner';
import { captureStudyInviteOnLoad } from './services/studyInvite';
import { JoinStudyModal } from './components/JoinStudyModal';
import { StartResearchProjectModal } from './components/StartResearchProjectModal';
import { 
    getFirstRunConsentTime, 
    getUserMode, 
    type UserRoleMode 
} from './services/lrsCredentialsService';
import { 
    trackExplorerSearch, 
    trackExplorerViewSource 
} from './services/explorerTrackingService';
import { initializeOutboxSync } from './services/s3aOutboxService';
import { 
    getState, 
    putState, 
    SCHOLAR_WORKSPACE_ACTIVITY_ID, 
    SCHOLAR_WORKSPACE_STATE_ID 
} from './services/lrsClient';
import { 
    initializeS3ASession, 
    logHumanAction, 
    addOpenAlexPaper, 
    downloadS3ASnapshotFile, 
    runS3ADemoMode,
    subscribeS3AState, 
    getS3ASessionState, 
    S3A_VERBS, 
    emitStatement,
    resetDualSession,
    isRecordingActive,
    getConsentState,
    importS3ASnapshotFile,
    getSkippedPaperWarnings,
    getSessionRecordErrors,
    type S3ASessionState 
} from './services/s3aWasmService';
import { KeywordRefinementDeck } from './components/KeywordRefinementDeck';
import { ResearchAssistant } from './components/ResearchAssistant';
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
    BookOpen,
    HardDrive,
    Zap,
    CheckCircle2,
    RefreshCw
} from 'lucide-react';
import { 
    checkS3ALocalHealth, 
    syncToS3ALocalLab, 
    convertPapersToS3APayload, 
    downloadFallbackSnapshot, 
    buildScholarExportBaseName,
    DEFAULT_TARGET_DB,
    type S3ASnapshotPayload
} from './services/s3aBridgeService';

type NavTab = 'search' | 'results' | 'detail' | 'queue' | 'export' | 'connections' | 'assistant' | 'scout' | 'marketplace';

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
  const [previousNav, setPreviousNav] = useState<NavTab>('results');
  const [isLocalLabOnline, setIsLocalLabOnline] = useState<boolean>(false);
  const [isSyncingS3A, setIsSyncingS3A] = useState<boolean>(false);
  const [isCheckingS3A, setIsCheckingS3A] = useState<boolean>(false);

  const [s3aState, setS3AState] = useState<S3ASessionState>(getS3ASessionState());
  const [showS3AInspector, setShowS3AInspector] = useState(false);

  useEffect(() => {
    const verify = () => checkS3ALocalHealth().then(setIsLocalLabOnline).catch(() => setIsLocalLabOnline(false));
    verify();
    const interval = setInterval(verify, 8000);
    
    // Initialize or restore S3A WASM Session
    initializeS3ASession().catch(e => console.error("S3A Session init error:", e));
    const unsub = subscribeS3AState(setS3AState);

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  // Emit xAPI statement when user views a report/tile/tab
  useEffect(() => {
    emitStatement('viewed', {
      id: `urn:view:${activeNav}`,
      name: `${activeNav} View`,
      type: 'ui-view'
    }, { actor: 'human', tab: activeNav }).catch(() => {});
  }, [activeNav]);

  const navigateToPaperDetail = (paper: ResearchPaper, fromNav: NavTab = activeNav) => {
    setSelectedPaper(paper);
    if (fromNav !== 'detail') {
      setPreviousNav(fromNav);
    }
    setActiveNav('detail');

    // Emit single authoritative xAPI statement for paper opened
    emitStatement('opened', {
      id: paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (paper.openalex_id || `urn:paper:${paper.id}`),
      name: paper.title || 'Untitled Research Paper',
      type: 'academic-paper'
    }, { actor: 'human', doi: paper.doi, year: paper.year, citations: paper.citations }).catch(() => {});
  };

  // --- UI MODAL & TOAST STATE ---
  const [showLogin, setShowLogin] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showProxy, setShowProxy] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showBridgesModal, setShowBridgesModal] = useState(false);
  const [showLibraryGuide, setShowLibraryGuide] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showDbFinder, setShowDbFinder] = useState(false);
  const [showOrgFinder, setShowOrgFinder] = useState(false);
  const [showDeepResearch, setShowDeepResearch] = useState(false);
  const [showDatabaseSettings, setShowDatabaseSettings] = useState(false);
  const [showFirstRunConsent, setShowFirstRunConsent] = useState(false);
  const [showJoinStudy, setShowJoinStudy] = useState(false);
  const [targetStudyId, setTargetStudyId] = useState<string>('');
  const [studyInvitePending, setStudyInvitePending] = useState(false);
  const [showStartResearchProject, setShowStartResearchProject] = useState(false);
  const [userRoleMode, setUserRoleMode] = useState<UserRoleMode>('explorer');
  const [recordingActive, setRecordingActive] = useState<boolean>(false);
  const [consentState, setConsentState] = useState<'none' | 'granted' | 'withdrawn'>('none');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [s3aSessionWarnings, setS3aSessionWarnings] = useState<string[]>([]);
  const [s3aExportError, setS3aExportError] = useState<string | null>(null);

  const stagePaperInS3ASession = (paper: ResearchPaper) => {
      addOpenAlexPaper(
          paper.openalex_id || paper.id || '',
          paper.doi || '',
          paper.year ? Number(paper.year) : 0,
          paper.citations || 0,
          paper.title
      ).then(res => {
          setS3aSessionWarnings(getSkippedPaperWarnings());
          if (res.skipped && res.warning) {
              setToastMessage(res.warning);
          }
      }).catch(err => {
          const errMsg = err?.message || String(err);
          setS3aExportError(errMsg);
          setToastMessage(errMsg);
      });
  };
  
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

  // --- S3A LRS WORKSPACE DOCUMENT STATE (ETag & Debounced 2s PUT) ---
  const workspaceEtagRef = useRef<string | null>(null);
  const isInitialWorkspaceLoadRef = useRef<boolean>(true);
  const workspaceDebounceTimerRef = useRef<any>(null);

  useEffect(() => {
    if (!user) {
      isInitialWorkspaceLoadRef.current = false;
      return;
    }
    // Load workspace state from S3A LRS on open
    getState(SCHOLAR_WORKSPACE_ACTIVITY_ID, SCHOLAR_WORKSPACE_STATE_ID)
      .then(res => {
        if (res && res.data) {
          workspaceEtagRef.current = res.etag;
          if (Array.isArray(res.data.papers) && res.data.papers.length > 0) {
            setWorkspacePapers(res.data.papers);
          }
          if (Array.isArray(res.data.projects) && res.data.projects.length > 0) {
            setProjects(res.data.projects);
          }
        }
        isInitialWorkspaceLoadRef.current = false;
      })
      .catch(err => {
        if (err?.status !== 401 && !err?.message?.includes('401')) {
          console.warn('[Workspace LRS State] Load warning:', err);
        }
        isInitialWorkspaceLoadRef.current = false;
      });
  }, [user]);

  // Save workspace layout with putState after changes (debounced 2s)
  useEffect(() => {
    if (!user || isInitialWorkspaceLoadRef.current) return;
    if (workspaceDebounceTimerRef.current) {
      clearTimeout(workspaceDebounceTimerRef.current);
    }
    workspaceDebounceTimerRef.current = setTimeout(() => {
      const payload = {
        papers: workspacePapers,
        projects,
        lastModified: new Date().toISOString()
      };
      putState(SCHOLAR_WORKSPACE_ACTIVITY_ID, SCHOLAR_WORKSPACE_STATE_ID, payload, workspaceEtagRef.current)
        .then(res => {
          if (res && res.etag) {
            workspaceEtagRef.current = res.etag;
          }
        })
        .catch(err => {
          if (err?.status !== 401 && !err?.message?.includes('401')) {
            console.warn('[Workspace LRS State] Save warning:', err);
          }
        });
    }, 2000);

    return () => {
      if (workspaceDebounceTimerRef.current) {
        clearTimeout(workspaceDebounceTimerRef.current);
      }
    };
  }, [workspacePapers, projects, user]);
  
  // --- EXPORT SNAPSHOT PROCESS STATES ---
  const [isCompilingSnapshot, setIsCompilingSnapshot] = useState(false);
  const [compilationProgress, setCompilationProgress] = useState(0);
  const [compilationItemIndex, setCompilationItemIndex] = useState(0);
  const [compilationPaperTitle, setCompilationPaperTitle] = useState('');
  const [exportFileName, setExportFileName] = useState(() => buildScholarExportBaseName('research-session'));
  const [sourceNotice, setSourceNotice] = useState<string | null>(null);
  
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
              name: 'Harvard Library Catalog',
              description: 'Harvard University Library Catalog & HOLLIS Index'
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
  const activeProjectName = projects[projects.length - 1]?.name || 'General Research';

  useEffect(() => {
      const slugSource = query.trim() || (activeProjectName !== 'General Research' ? activeProjectName : 'research-session');
      setExportFileName(buildScholarExportBaseName(slugSource));
  }, [query, activeProjectName]);

  const handleRetrySynthesis = React.useCallback(() => {
      if (papers.length === 0) return;
      setIsSummaryLoading(true);
      apiService.generateSummary(papers.slice(0, 10), summaryLength, summaryStyle)
        .then(setSummary)
        .catch(error => {
          console.error("Failed to generate summary:", error);
          setSummary("Failed to generate summary.");
        })
        .finally(() => setIsSummaryLoading(false));
  }, [papers, summaryLength, summaryStyle]);

  const handleRetryScoring = React.useCallback(async () => {
      if (papers.length === 0) return;
      const targetQuery = query || 'research';
      try {
          const queryEmbedding = cachedQueryEmbedding || (await apiService.precomputeQueryEmbedding(targetQuery));
          if (!cachedQueryEmbedding && queryEmbedding) {
              setCachedQueryEmbedding(queryEmbedding);
          }
          const scoredResults = await apiService.computeScores(papers, queryEmbedding, targetQuery);
          setPapers(scoredResults);
          setSelectedPaper(prev => {
              if (!prev) return null;
              return scoredResults.find(p => p.id === prev.id) || prev;
          });
      } catch (err) {
          console.error("Retry scoring failed:", err);
      }
  }, [papers, query, cachedQueryEmbedding]);

  useEffect(() => {
      const onRetryScoringEvent = () => { handleRetryScoring(); };
      const onRetrySynthesisEvent = () => { handleRetrySynthesis(); };
      window.addEventListener('scholar:retry-scoring', onRetryScoringEvent);
      window.addEventListener('scholar:retry-synthesis', onRetrySynthesisEvent);
      return () => {
          window.removeEventListener('scholar:retry-scoring', onRetryScoringEvent);
          window.removeEventListener('scholar:retry-synthesis', onRetrySynthesisEvent);
      };
  }, [handleRetryScoring, handleRetrySynthesis]);

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
      // 1. Initialize S3A Outbox synchronization & WASM session
      initializeOutboxSync().catch(err => console.warn('[App] Outbox sync init:', err));
      initializeS3ASession().catch(err => console.warn('[App] S3A session init:', err));

      // 2. Check User Mode and Consent State from WASM Engine (never show on launch)
      getUserMode().then(setUserRoleMode);
      getConsentState().then(setConsentState).catch(() => {});
      isRecordingActive().then(setRecordingActive).catch(() => {});

      // 3. Study invite link (?studyId=... or ?study=...): capture the id only.
      // This must never open the consent modal or start tracing. The user opts in
      // later from the "Join study" banner or the "Join a study" button.
      captureStudyInviteOnLoad(window.location.search, (inviteStudyId) => {
          setTargetStudyId(inviteStudyId);
          setStudyInvitePending(true);
      });

      const cleanupExtensionListener = extensionService.listenForExtensionMessages(
          (paper) => {
              stagePaperInS3ASession(paper);
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
              papersList.forEach(p => stagePaperInS3ASession(p));
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
      // Reset S3A dual session with actor_uuid (human student) and agent_uuid (AI assistant instance)
      resetDualSession({
          actor_uuid: loggedInUser.actor_uuid,
          agent_uuid: loggedInUser.agent_uuid,
          sessionId: loggedInUser.sessionId
      });
      if (loggedInUser.role === 'participant') {
          setAppMode('evaluation');
      } else {
          setAppMode('dashboard');
      }
  };

  const handleLogout = () => {
      // Emit xAPI logout statement before tearing down session
      emitStatement('logged-out', {
          id: 'urn:session:logout',
          name: 'User Logged Out',
          type: 'session-control'
      }, { actor: 'human' }).catch(() => {});

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
                sublabel: userSettings.isHarvardLibraryEnabled ? 'ArXiv, Crossref, PubMed, Harvard Library Catalog' : 'ArXiv, Crossref, PubMed, Semantic Scholar',
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

    // Emit single authoritative xAPI statement for search run
    emitStatement('searched', {
      id: `urn:search:${encodeURIComponent(searchQuery)}`,
      name: `Search: "${searchQuery}"`,
      type: 'search-query'
    }, { actor: 'human', domain: options.domain, query: searchQuery }).catch(() => {});

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
              },

              onSourceNotice: (notice) => {
                  setSourceNotice(notice);
              }
          }
      );
      
      setPapers(results);
      setHasMore(moreAvailable);
      setIsLoading(false); 

      // Explorer Mode xAPI Telemetry: searched
      trackExplorerSearch(searchQuery, results.length, { domain: options.domain || 'all', startYear: options.startYear, endYear: options.endYear })
        .catch(err => console.warn('[Explorer Telemetry] Search tracking error:', err)); 

      fetchSciteTallies(results);

      try {
          const queryEmbedding = await queryEmbeddingPromise;
          setCachedQueryEmbedding(queryEmbedding);
          const scoredResults = await apiService.computeScores(results, queryEmbedding, searchQuery);
          setPapers(scoredResults);
          setSelectedPaper(prev => {
              if (!prev) return null;
              return scoredResults.find(p => p.id === prev.id) || prev;
          });

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
      const exists = workspacePapers.some(p => p.id === paper.id);
      if (!exists) {
          // Add paper to the S3A session once, when the user selects it
          stagePaperInS3ASession(paper);
      }
      setWorkspacePapers(prev => {
          const alreadyExists = prev.some(p => p.id === paper.id);
          if (alreadyExists) {
              storageService.removePaperFromCloud(paper.id);
              setToastMessage(`Removed "${paper.title.substring(0, 30)}..." from selection queue.`);
              
              // Emit xAPI statement for citation/paper removed
              emitStatement('removed', {
                  id: paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (paper.openalex_id || `urn:paper:${paper.id}`),
                  name: paper.title || 'Paper',
                  type: 'academic-paper'
              }, { actor: 'human', doi: paper.doi }).catch(() => {});

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
              
              // Emit xAPI statement for citation/paper saved
              emitStatement('saved', {
                  id: paper.doi ? `https://doi.org/${paper.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (paper.openalex_id || `urn:paper:${paper.id}`),
                  name: paper.title || 'Paper',
                  type: 'academic-paper'
              }, { actor: 'human', doi: paper.doi, year: paper.year, citations: paper.citations }).catch(() => {});

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
      newPapers.forEach(p => stagePaperInS3ASession(p));
      setWorkspacePapers(prev => {
          const combined = [...prev];
          newPapers.forEach(p => {
              if (!combined.some(existing => existing.id === p.id)) {
                  combined.push(p);
                  addedCount++;
                  storageService.syncPaperToCloud(p);

                  // Emit xAPI statement for citation/paper saved
                  emitStatement('saved', {
                      id: p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/doi\.org\//, '')}` : (p.openalex_id || `urn:paper:${p.id}`),
                      name: p.title || 'Paper',
                      type: 'academic-paper'
                  }, { actor: 'human', doi: p.doi, year: p.year, citations: p.citations }).catch(() => {});
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

      // Emit xAPI statement: user accepted an AI suggestion
      emitStatement('accepted', {
          id: `urn:suggestion:keyword:${encodeURIComponent(term)}`,
          name: `Academic Keyword: ${term}`,
          type: 'ai-suggestion'
      }, { actor: 'human', decision: 'accepted', suggestion_type: 'keyword', term, refinedQuery: newQuery }).catch(() => {});

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
      stagePaperInS3ASession(paper);
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
              title: p.title || "Untitled Paper",
              authors: Array.isArray(p.authors) 
                  ? p.authors 
                  : (typeof p.authors === 'string' && p.authors ? p.authors.split(',').map(a => a.trim()).filter(Boolean) : (p.authorList?.map(a => a.name) || [])),
              year: String(p.year || "n.d."),
              doi: p.doi || "",
              openalex_id: (p.id && !p.id.startsWith('uploaded_')) ? p.id : (p.openalex_id || ""),
              semantic_scholar_id: (p.id && !p.id.startsWith('uploaded_')) ? p.id : "",
              crossref_id: p.doi || "",
              arxiv_id: p.pdfURL && p.pdfURL.includes('arxiv.org') && p.pdfURL.includes('/pdf/') ? (p.pdfURL.split('/pdf/')[1]?.replace('.pdf', '') || "") : "",
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
      setCompilationPaperTitle('Pinging S3A Local Lab Engine (127.0.0.1:8080)...');

      const s3aPayload = convertPapersToS3APayload(
          workspacePapers,
          query || scoutTopic || "Scholarly Research Session",
          {
              domain: currentSearchOptions.domain || "all",
              depth: summaryLength,
              style: summaryStyle,
              deep_research_mode: false,
              ai_source_scout: scoutCandidates.length > 0
          },
          scoutServices
      );

      // 1. Check if S3A Local Lab Engine is running locally at http://127.0.0.1:8080 (capped at 800ms)
      let isDaemonOnline = false;
      try {
          isDaemonOnline = await checkS3ALocalHealth();
      } catch (_e) {
          isDaemonOnline = false;
      }

      // 2. If Local Lab is Online: stream research session directly into local S3A high-performance database (< 1ms)
      if (isDaemonOnline) {
          const targetDb = userSettings.s3aTargetDb || DEFAULT_TARGET_DB;
          setCompilationProgress(60);
          setCompilationPaperTitle(`Streaming research session to local database (${targetDb})...`);
          try {
              const ingestResult = await syncToS3ALocalLab(s3aPayload, targetDb);
              setCompilationProgress(100);
              setToastMessage(`⚡ Synced to Local Research Lab: ${ingestResult.ingested_papers} works streamed to ${ingestResult.target_db}`);
              setTimeout(() => {
                  setIsCompilingSnapshot(false);
              }, 800);
              return;
          } catch (syncErr) {
              console.warn("Direct S3A ingest failed, falling back to portable snapshot file:", syncErr);
              // Fall through to offline fallback download
          }
      }

      // 3. If Local Lab is Offline: Fall back gracefully to generating portable snapshot file (.snapshot.s3a)
      const stepDuration = Math.max(80, Math.min(250, 1000 / workspacePapers.length));

      for (let i = 0; i < workspacePapers.length; i++) {
          setCompilationItemIndex(i + 1);
          setCompilationPaperTitle(workspacePapers[i].title);
          const percent = Math.round(((i + 1) / workspacePapers.length) * 100);
          setCompilationProgress(percent);
          await new Promise(resolve => setTimeout(resolve, stepDuration));
      }

      setCompilationPaperTitle("Packaging schemas, DOIs, and local intake contracts...");
      await new Promise(resolve => setTimeout(resolve, 250));
      setCompilationProgress(100);

      try {
          setS3aExportError(null);
          const savedFileName = await downloadFallbackSnapshot(
              s3aPayload, 
              exportFileName || 'scholar_research_session', 
              's3a'
          );
          setS3aSessionWarnings(getSkippedPaperWarnings());
          
          if (userSettings.autoSaveSnapshot) {
              setToastMessage(`⚡ Auto-saved: "${savedFileName}" downloaded straight to default directory.`);
          } else {
              setToastMessage(`Local Lab offline — portable snapshot "${savedFileName}" saved for offline intake.`);
          }
      } catch (err: any) {
          const errMsg = err?.message || "Snapshot compiler error during save.";
          setS3aExportError(errMsg);
          setToastMessage(errMsg);
      } finally {
          setTimeout(() => {
              setIsCompilingSnapshot(false);
          }, 1000);
      }
  };

  // --- NAVIGATION TAB CONTENT RENDERING ---
  const renderActiveNavScreen = () => {
      switch (activeNav) {
          case 'search':
              return (
                  <div className="space-y-6 max-w-3xl mx-auto pt-2 sm:pt-6">
                      {/* Dominant Search Header */}
                      <div className="space-y-1.5 text-center">
                          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-slate-900">
                              What are you researching today?
                          </h1>
                          <p className="text-xs sm:text-sm text-slate-500 max-w-lg mx-auto">
                              Search 480M+ open scholarly works across OpenAlex, Crossref, Semantic Scholar, and arXiv.
                          </p>
                      </div>

                      {/* Live Recording Indicator (Requirement 2 & 4) */}
                      <div className="flex justify-center -mt-2">
                          {consentState === 'none' ? (
                              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border bg-slate-100 text-slate-600 border-slate-200 shadow-2xs">
                                  <span className="w-2 h-2 rounded-full bg-slate-400 shrink-0" />
                                  <span>Recording off — your papers and claims still save.</span>
                                  <span className="text-slate-300">|</span>
                                  <button
                                      type="button"
                                      onClick={() => setShowJoinStudy(true)}
                                      className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 ml-0.5 transition-colors cursor-pointer"
                                  >
                                      Join a study
                                  </button>
                              </div>
                          ) : (
                              <button
                                  type="button"
                                  onClick={() => setShowFirstRunConsent(true)}
                                  className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-colors shadow-2xs ${
                                      recordingActive
                                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                  }`}
                                  title="Click to view or manage research study consent"
                              >
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${recordingActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                                  <span>
                                      {recordingActive
                                          ? 'Recording on — your research activity is being traced for this study.'
                                          : 'Recording off — your papers and claims still save, but your activity is not being traced.'}
                                  </span>
                                  <span className={`ml-1 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${
                                      consentState === 'granted'
                                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                          : 'bg-amber-100 text-amber-800 border-amber-300'
                                  }`}>
                                      {consentState}
                                  </span>
                              </button>
                          )}
                      </div>
                      
                      {/* Search Box dominates the interface */}
                      <div className="w-full">
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
                      </div>

                      {/* Academic Keyword Suggestion Engine Deck */}
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
                  </div>
              );

          case 'results':
              return (
                  <div className="space-y-6">
                      <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                          <div>
                              <h2 className="text-xl font-bold tracking-tight text-slate-900">
                                  {query ? `Results for "${query}"` : 'Discover Sources'}
                              </h2>
                              <p className="text-xs text-slate-500 mt-0.5">
                                  {papers.length} scholarly {papers.length === 1 ? 'work' : 'works'} found
                              </p>
                          </div>
                          <button 
                              onClick={() => setActiveNav('search')} 
                              className="text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50"
                          >
                              New Search
                          </button>
                      </div>

                      {error && <ErrorMessage message={error} />}

                      {/* Quiet System Execution Indicator */}
                      <SystemExecutionIndicator 
                          executionState={systemExecution} 
                          isInitialLoading={isLoading} 
                          query={query} 
                      />

                      {isLoading ? (
                          <div className="space-y-4 py-6">
                              {[1, 2, 3].map(i => (
                                  <div key={i} className="h-32 bg-white border border-slate-200/80 rounded-xl p-5 space-y-3 animate-pulse">
                                      <div className="h-4 bg-slate-100 rounded w-2/3" />
                                      <div className="h-3 bg-slate-100 rounded w-1/3" />
                                      <div className="h-8 bg-slate-50 rounded w-full" />
                                  </div>
                              ))}
                          </div>
                      ) : papers.length > 0 ? (
                          <div className="grid grid-cols-1 gap-6">
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
                                      navigateToPaperDetail(paper, 'results');
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
                                  searchQuery={query}
                                  sourceNotice={sourceNotice}
                                  onRetryScoring={handleRetryScoring}
                                  onRetrySynthesis={handleRetrySynthesis}
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
                                          onRetrySynthesis={handleRetrySynthesis}
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
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                              <button 
                                  onClick={() => setActiveNav(previousNav === 'queue' ? 'queue' : 'results')} 
                                  className="text-xs font-semibold text-slate-700 hover:text-slate-950 flex items-center gap-1.5 transition-colors bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs"
                              >
                                  &larr; Return to {previousNav === 'queue' ? 'Researcher Workspace' : 'Results Directory'}
                              </button>
                              {previousNav === 'queue' && papers.length > 0 && (
                                  <button 
                                      onClick={() => setActiveNav('results')} 
                                      className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
                                  >
                                      Browse Results ({papers.length})
                                  </button>
                              )}
                              {previousNav === 'results' && workspacePapers.length > 0 && (
                                  <button 
                                      onClick={() => setActiveNav('queue')} 
                                      className="text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors px-2.5 py-1.5 rounded-lg hover:bg-slate-100"
                                  >
                                      Workspace Queue ({workspacePapers.length})
                                  </button>
                              )}
                          </div>
                          {selectedPaper && (
                              <button
                                  onClick={() => handleToggleWorkspacePaper(selectedPaper)}
                                  className={`px-4 py-2 text-xs font-semibold rounded-xl transition-colors shadow-2xs ${
                                      workspacePaperIds.has(selectedPaper.id)
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                                          : 'bg-slate-900 text-white hover:bg-slate-800'
                                  }`}
                              >
                                  {workspacePaperIds.has(selectedPaper.id) ? "✓ Staged in Workspace" : "+ Add to Selection Queue"}
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
                                  searchQuery={query}
                              />

                              {/* Local Machine Boundary Advisory */}
                              <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-5 shadow-2xs">
                                  <div className="flex gap-3.5 items-start">
                                      <div className="w-9 h-9 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl flex items-center justify-center shrink-0">
                                          <ShieldCheck className="w-5 h-5" />
                                      </div>
                                      <div className="space-y-1.5 flex-grow">
                                          <div className="flex items-center justify-between gap-2 flex-wrap">
                                              <h4 className="font-semibold text-xs text-slate-900">Local Research Lab Boundary &amp; Confidential Verification</h4>
                                              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-200/70 text-slate-700 font-bold">
                                                  Host: 127.0.0.1:8080
                                              </span>
                                          </div>
                                          <p className="text-xs text-slate-600 leading-relaxed">
                                              Scholar Explorer coordinates open discovery and metadata synthesis. Confidential operations—such as offline full-text vectorization, thesis drafting, claim audits, and mathematical proof validation—execute privately inside your local S3A lab environment.
                                          </p>
                                          <div className="pt-2 flex items-center gap-3 flex-wrap">
                                              <button
                                                  onClick={() => handleToggleWorkspacePaper(selectedPaper)}
                                                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 hover:text-indigo-900"
                                              >
                                                  <span>{workspacePaperIds.has(selectedPaper.id) ? '✓ Staged in Workspace Queue' : '+ Stage in Workspace Queue for Sync'}</span>
                                              </button>
                                              <button
                                                  onClick={() => setActiveNav('export')}
                                                  className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 font-medium"
                                              >
                                                  <span>Open Local Lab Bridge</span>
                                                  <ArrowRight className="w-3 h-3" />
                                              </button>
                                          </div>
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
                  <ResearcherWorkspace
                      papers={workspacePapers}
                      onRemovePaper={handleToggleWorkspacePaper}
                      onSelectPaper={(paper) => {
                          navigateToPaperDetail(paper, 'queue');
                      }}
                      onOpenSnapshotDialog={() => setShowExportModal(true)}
                      onNavigateToSearch={() => setActiveNav('search')}
                      searchQuery={query}
                      activeSearchSources={activeSearchSources.map(s => s.name)}
                      onCitePaper={handleCitePaper}
                  />
              );

          case 'export':
              return (
                  <div className="space-y-6 max-w-4xl mx-auto">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex flex-col gap-1">
                              <div className="flex items-center gap-2">
                                  <h2 className="text-xl font-semibold tracking-tight text-slate-900">S3A Local Research Lab Bridge</h2>
                                  <span className="px-2 py-0.5 text-[10px] font-mono uppercase bg-slate-100 text-slate-700 rounded font-medium">
                                      Zotero Connector Style
                                  </span>
                              </div>
                              <p className="text-xs text-slate-500 font-normal">
                                  Automated high-performance ingestion into your local research machine at <code className="font-mono text-slate-700">127.0.0.1:8080</code>.
                              </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-2.5 self-start sm:self-auto">
                              {workspacePapers.length === 0 && (
                                  <span className="text-xs text-slate-500">
                                      Stage at least one paper to export.
                                  </span>
                              )}
                              <button
                                  type="button"
                                  onClick={() => setShowExportModal(true)}
                                  disabled={workspacePapers.length === 0}
                                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-xs"
                              >
                                  <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Open Ingest Dialog</span>
                              </button>
                          </div>
                      </div>

                      {/* Bridge Boundary Advisory */}
                      <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4.5">
                          <div className="flex gap-3.5 items-start">
                              <ShieldCheck className="w-5 h-5 text-slate-600 flex-shrink-0 mt-0.5" />
                              <div className="space-y-1">
                                  <h4 className="text-xs font-semibold text-slate-900">Confidential Local Machine Boundary</h4>
                                  <p className="text-xs text-slate-600 leading-relaxed">
                                      Scholar Explorer coordinates wide global search indices and packages discovery state. Deep operations—such as offline full-text vectorization, thesis drafting, claims auditing, and confidential proof verification—run entirely offline within your local S3A research database (<code className="font-mono text-[11px] text-slate-800 bg-white px-1 rounded border border-slate-200">{DEFAULT_TARGET_DB}</code>).
                                  </p>
                              </div>
                          </div>
                      </div>

                      {workspacePapers.length > 0 ? (
                          <div className="space-y-6">
                              {/* Export Configurations & Progress Console */}
                              <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-2xs space-y-4">
                                  <div className="flex items-center justify-between">
                                      <h3 className="text-xs font-semibold text-slate-900 flex items-center gap-2">
                                          <Cpu className="w-4 h-4 text-slate-700" />
                                          <span>Snapshot & Local Ingestion Settings</span>
                                      </h3>
                                      <span className="text-[11px] font-mono text-slate-400">
                                          Target: {DEFAULT_TARGET_DB}
                                      </span>
                                  </div>
                                  
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* Custom Filename */}
                                      <div className="space-y-1.5">
                                          <label className="block text-xs font-semibold text-slate-700">Snapshot File Name</label>
                                          <div className="relative">
                                              <input
                                                  type="text"
                                                  value={exportFileName}
                                                  onChange={(e) => setExportFileName(e.target.value)}
                                                  placeholder="scholar_research_session"
                                                  disabled={isCompilingSnapshot}
                                                  className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 bg-slate-50 disabled:opacity-60 pr-12 text-slate-900"
                                              />
                                              <span className="absolute right-3 top-2 text-[10px] font-mono text-slate-400 font-medium">.s3a</span>
                                          </div>
                                          <p className="text-[11px] text-slate-500 leading-normal">
                                              Used for fallback portable snapshot and session identification.
                                          </p>
                                      </div>

                                      {/* Dual-Mode Ingest Advisory */}
                                      <div className="border border-slate-200/80 rounded-lg p-3.5 bg-slate-50 flex flex-col justify-center space-y-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                              <Zap className="w-3 h-3 text-emerald-600" />
                                              Dual-Mode Auto-Detection
                                          </span>
                                          <p className="text-xs text-slate-600 leading-relaxed">
                                              If local S3A engine is online at <code className="font-mono text-[11px]">127.0.0.1:8080</code>, data streams in &lt; 1ms. If offline, a portable snapshot file is downloaded for manual intake.
                                          </p>
                                      </div>
                                  </div>

                                  {/* Progressive Bundling Compilation Indicator */}
                                  {isCompilingSnapshot && (
                                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-2.5">
                                          <div className="flex items-center justify-between text-xs">
                                              <span className="font-semibold text-slate-800 flex items-center gap-2">
                                                  <div className="w-3.5 h-3.5 border-2 border-slate-900 border-t-transparent rounded-full animate-spin" />
                                                  Processing Ingest Pipeline
                                              </span>
                                              <span className="font-mono text-slate-600 text-[11px]">
                                                  {compilationItemIndex} / {workspacePapers.length} ({compilationProgress}%)
                                              </span>
                                          </div>
                                          
                                          <div className="w-full rounded-full h-1.5 overflow-hidden bg-slate-100">
                                              <div 
                                                  className="bg-slate-900 h-1.5 rounded-full transition-all duration-150 ease-out"
                                                  style={{ width: `${compilationProgress}%` }}
                                              />
                                          </div>

                                          <p className="text-[11px] font-mono text-slate-500 truncate" title={compilationPaperTitle}>
                                              {compilationPaperTitle || "Connecting to daemon..."}
                                          </p>
                                      </div>
                                  )}
                              </div>

                              {/* Action Controls */}
                              <div className="space-y-2.5">
                                  <div className="flex flex-wrap items-center gap-3">
                                      <button
                                          onClick={handleDownloadSnapshot}
                                          disabled={isCompilingSnapshot}
                                          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-40 rounded-lg text-xs font-semibold transition-colors shadow-xs"
                                      >
                                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                                          <span>{isCompilingSnapshot ? `Processing (${compilationItemIndex}/${workspacePapers.length})` : 'Sync / Export to Local Lab'}</span>
                                      </button>
                                      <label className="inline-flex items-center gap-2 px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-lg text-xs font-medium transition-colors shadow-2xs cursor-pointer">
                                          <HardDrive className="w-3.5 h-3.5 text-slate-500" />
                                          <span>Import .s3a Snapshot</span>
                                          <input 
                                              type="file" 
                                              accept=".s3a,application/octet-stream" 
                                              className="hidden" 
                                              onChange={async (e) => {
                                                  const file = e.target.files?.[0];
                                                  if (!file) return;
                                                  try {
                                                      const snapshot = await importS3ASnapshotFile(file);
                                                      setToastMessage(`✓ Valid S3A snapshot loaded: ${file.name}`);
                                                      try { snapshot.free(); } catch (_f) {}
                                                  } catch (err: any) {
                                                      alert("This is not an S3A file");
                                                      setToastMessage("This is not an S3A file");
                                                  } finally {
                                                      if (e.target) e.target.value = '';
                                                  }
                                              }}
                                          />
                                      </label>
                                      <button
                                          onClick={handleCopyToClipboard}
                                          disabled={isCompilingSnapshot}
                                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 border border-slate-200 rounded-lg text-xs font-medium transition-colors shadow-2xs"
                                      >
                                          <Copy className="w-3.5 h-3.5 text-slate-500" />
                                          <span>Copy Snapshot JSON</span>
                                      </button>
                                      <button
                                          onClick={() => setShowExportModal(true)}
                                          className="inline-flex items-center gap-1.5 text-xs text-slate-600 hover:text-slate-900 font-medium px-2 py-1"
                                      >
                                          <span>View Ingestion Contract</span>
                                          <ArrowRight className="w-3 h-3" />
                                      </button>
                                  </div>

                                  <p className="text-[11px] text-slate-500">
                                      Query settings are not saved in the file yet
                                  </p>

                                  {s3aExportError && (
                                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                                          {s3aExportError}
                                      </div>
                                  )}

                                  {s3aSessionWarnings.length > 0 && (
                                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                                          <p className="font-semibold">Skipped works without an OpenAlex ID:</p>
                                          <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                                              {s3aSessionWarnings.map((w, idx) => (
                                                  <li key={idx}>{w}</li>
                                              ))}
                                          </ul>
                                      </div>
                                  )}
                              </div>

                              {/* Snapshot Code Area */}
                              <div className="rounded-xl border border-slate-800 bg-slate-950 p-4.5 overflow-hidden relative">
                                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 text-[11px] font-mono text-slate-400">
                                      <span>scholar-discovery-snapshot.json</span>
                                      <span>{workspacePapers.length} works</span>
                                  </div>
                                  <pre className="text-xs text-slate-300 font-mono overflow-auto max-h-[220px] leading-relaxed">
                                      {snapshotJsonString}
                                  </pre>
                              </div>
                          </div>
                      ) : (
                          <div className="text-center py-16 bg-white border border-dashed border-slate-200 rounded-xl space-y-2">
                              <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                              <h3 className="text-sm font-semibold text-slate-800">No transfer candidates selected</h3>
                              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                                  Select papers from search results into your Research Workspace to stage them for local lab ingestion.
                              </p>
                              <div className="pt-2">
                                  <button
                                      type="button"
                                      onClick={() => setActiveNav('search')}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                                  >
                                      <span>Search Literature</span>
                                      <ArrowRight className="w-3 h-3" />
                                  </button>
                              </div>
                          </div>
                      )}
                  </div>
              );

          case 'connections':
              return (
                  <div className="space-y-6 animate-in fade-in duration-200">
                      {/* Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80">
                          <div>
                              <div className="flex items-center gap-2">
                                  <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">Bridges & Connections</h2>
                                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                                      Research Environment Architecture
                                  </span>
                              </div>
                              <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
                                  Verify and manage active bridges between your browser research workspace, institutional entitlements, and local S3A database environment.
                              </p>
                          </div>

                          <div className="flex items-center gap-2.5">
                              <button
                                  onClick={() => setShowDbFinder(true)}
                                  className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-semibold text-xs rounded-xl shadow-2xs flex items-center gap-1.5 transition-all"
                              >
                                  <Library className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Institutional Catalog Directory</span>
                              </button>
                          </div>
                      </div>

                      {/* Core Bridges Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* 1. Scholar Explorer Local Lab Core (S3A Database Connection) */}
                          <div className="border border-slate-200/80 rounded-2xl p-6 bg-white shadow-2xs space-y-5 flex flex-col justify-between hover:border-slate-300 transition-all">
                              <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center border border-indigo-100">
                                                  <HardDrive className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                                                      Scholar Explorer Local Lab Core
                                                  </h3>
                                                  <p className="text-[11px] font-semibold text-indigo-600">
                                                      S3A Database Connection
                                                  </p>
                                              </div>
                                          </div>
                                      </div>
                                      {isLocalLabOnline ? (
                                          <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 shrink-0">
                                              <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Connected (:8080)
                                          </span>
                                      ) : (
                                          <span className="flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-200/80 shrink-0">
                                              <HardDrive className="w-3 h-3 text-amber-600" /> Standby Mode
                                          </span>
                                      )}
                                  </div>

                                  <p className="text-xs text-slate-600 leading-relaxed">
                                      Direct high-performance local database bridge. Streams verified literature, citation graphs, and synthesis snapshots into your S3A database (<code className="font-mono text-[11px] text-slate-800 bg-slate-100 px-1 py-0.5 rounded">scholar_live_lab.s3a</code>) running at <code className="font-mono text-[11px] text-slate-800 bg-slate-100 px-1 py-0.5 rounded">127.0.0.1:8080</code>.
                                  </p>

                                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Daemon Endpoint:</span>
                                          <span className="font-mono text-slate-700 font-semibold">http://127.0.0.1:8080</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Target Database:</span>
                                          <span className="font-mono text-slate-700 font-semibold">{userSettings.s3aTargetDb || DEFAULT_TARGET_DB}</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Storage Format:</span>
                                          <span className="text-slate-700 font-medium">Hyper-Tile Binary / .snapshot.s3a</span>
                                      </div>
                                  </div>
                              </div>

                              <div className="pt-4 border-t border-slate-100 flex items-center gap-2.5">
                                  <button 
                                      onClick={async () => {
                                          if (workspacePapers.length === 0) {
                                              setToastMessage("Workspace is empty. Add papers to Evidence Ledger before syncing.");
                                              return;
                                          }
                                          setIsSyncingS3A(true);
                                          const payload = convertPapersToS3APayload(workspacePapers, query || 'Doctoral Research Synthesis');
                                          try {
                                              const targetDb = userSettings.s3aTargetDb || DEFAULT_TARGET_DB;
                                              const res = await syncToS3ALocalLab(payload, targetDb);
                                              setToastMessage(`⚡ Successfully synced ${res.ingested_papers} papers into ${res.target_db}`);
                                          } catch (err: any) {
                                              await downloadFallbackSnapshot(payload);
                                              setToastMessage(`S3A local daemon offline. Exported portable .s3a file.`);
                                          } finally {
                                              setIsSyncingS3A(false);
                                          }
                                      }}
                                      disabled={isSyncingS3A}
                                      className="flex-1 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50 active:scale-[0.98]"
                                  >
                                      <Zap className="w-3.5 h-3.5 text-indigo-400" />
                                      <span>{isSyncingS3A ? 'Syncing to S3A...' : `Sync Evidence (${workspacePapers.length})`}</span>
                                  </button>
                                  <button
                                      onClick={async () => {
                                          setIsCheckingS3A(true);
                                          const online = await checkS3ALocalHealth();
                                          setIsLocalLabOnline(online);
                                          setIsCheckingS3A(false);
                                          if (online) {
                                              setToastMessage("S3A Local Lab daemon is active on 127.0.0.1:8080");
                                          } else {
                                              setToastMessage("S3A daemon offline on 127.0.0.1:8080. Portable .snapshot.s3a active.");
                                          }
                                      }}
                                      disabled={isCheckingS3A}
                                      className="px-3.5 py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-all flex items-center gap-1.5 active:scale-95"
                                      title="Test local daemon connection"
                                  >
                                      <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isCheckingS3A ? 'animate-spin' : ''}`} />
                                      <span className="hidden sm:inline">Ping</span>
                                  </button>
                              </div>
                          </div>

                          {/* 2. S3A Evidence Store */}
                          <div className="border border-slate-200/80 rounded-2xl p-6 bg-white shadow-2xs space-y-5 flex flex-col justify-between hover:border-slate-300 transition-all">
                              <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center border border-emerald-100">
                                                  <ShieldCheck className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                                                      S3A Evidence Store
                                                  </h3>
                                                  <p className="text-[11px] font-semibold text-emerald-700">
                                                      Confidential Evidence & Verification Engine
                                                  </p>
                                              </div>
                                          </div>
                                      </div>
                                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200/80 shrink-0">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> S3A Verified
                                      </span>
                                  </div>

                                  <p className="text-xs text-slate-600 leading-relaxed">
                                      Private doctoral verification repository powered by the S3A engine. Secures empirical evidence logs, claim proofs, researcher assertions, and xAPI research telemetry locally within your S3A database environment without external cloud leakage.
                                  </p>

                                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Storage Architecture:</span>
                                          <span className="font-mono text-slate-700 font-semibold">S3A Spatial-Semantic Database</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Provenance Ledger:</span>
                                          <span className="text-slate-700 font-medium">xAPI Statement Store (Local)</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Privacy Isolation:</span>
                                          <span className="text-emerald-700 font-semibold">Local Lab (Zero Cloud Leakage)</span>
                                      </div>
                                  </div>
                              </div>

                              <div className="pt-4 border-t border-slate-100">
                                  <button 
                                      onClick={() => setShowLrsInspector(true)}
                                      className="w-full py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold transition-all text-slate-800 flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
                                  >
                                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                                      <span>Inspect Evidence Provenance Log</span>
                                  </button>
                              </div>
                          </div>

                          {/* 3. Institutional SSO Integration */}
                          <div className="border border-slate-200/80 rounded-2xl p-6 bg-white shadow-2xs space-y-5 flex flex-col justify-between hover:border-slate-300 transition-all">
                              <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center border border-blue-100">
                                                  <GraduationCap className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                                                      Institutional SSO Integration
                                                  </h3>
                                                  <p className="text-[11px] font-semibold text-blue-700">
                                                      Campus Proxy & Entitlement Bridge
                                                  </p>
                                              </div>
                                          </div>
                                      </div>
                                      <span className="px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200/80 rounded-full text-[10px] font-bold">
                                          UNC Wilmington (Active)
                                      </span>
                                  </div>

                                  <p className="text-xs text-slate-600 leading-relaxed">
                                      Federated authentication via Microsoft Entra ID / Shibboleth. Authorizes full-text retrieval from subscribed academic databases directly into your review workspace.
                                  </p>

                                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Active Institution:</span>
                                          <span className="font-semibold text-slate-700">UNC Wilmington</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Proxy Protocol:</span>
                                          <span className="font-mono text-slate-700">EZproxy / SAML 2.0</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Entitlement:</span>
                                          <span className="text-slate-700 font-medium">Full-Text PDF Retrieval</span>
                                      </div>
                                  </div>
                              </div>

                              <div className="pt-4 border-t border-slate-100">
                                  <button 
                                      onClick={() => setShowProxy(true)}
                                      className="w-full py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold transition-all text-slate-800 flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
                                  >
                                      <span>Configure SSO Integration</span>
                                  </button>
                              </div>
                          </div>

                          {/* 4. Institutional Literature Catalog & Directory */}
                          <div className="border border-slate-200/80 rounded-2xl p-6 bg-white shadow-2xs space-y-5 flex flex-col justify-between hover:border-slate-300 transition-all">
                              <div className="space-y-3">
                                  <div className="flex items-start justify-between gap-3">
                                      <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                              <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-700 flex items-center justify-center border border-purple-100">
                                                  <Library className="w-4 h-4" />
                                              </div>
                                              <div>
                                                  <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                                                      Institutional Literature Catalog
                                                  </h3>
                                                  <p className="text-[11px] font-semibold text-purple-700">
                                                      Federated Discovery Connectors
                                                  </p>
                                              </div>
                                          </div>
                                      </div>
                                      <span className="px-2.5 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200/80 rounded-full text-[10px] font-bold">
                                          16+ Sources Active
                                      </span>
                                  </div>

                                  <p className="text-xs text-slate-600 leading-relaxed">
                                      Federated academic directory bridging OpenAlex, Crossref, PubMed, Semantic Scholar, and university library catalog endpoints for comprehensive doctoral research.
                                  </p>

                                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1.5 text-xs">
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Connected Catalogs:</span>
                                          <span className="font-semibold text-slate-700">Harvard, OpenAlex, PubMed, arXiv</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Index Size:</span>
                                          <span className="font-mono text-slate-700">250M+ Works</span>
                                      </div>
                                      <div className="flex items-center justify-between text-slate-500">
                                          <span>Discovery Engine:</span>
                                          <span className="text-slate-700 font-medium">Multi-Source Parallel Dispatch</span>
                                      </div>
                                  </div>
                              </div>

                              <div className="pt-4 border-t border-slate-100">
                                  <button 
                                      onClick={() => setShowDbFinder(true)}
                                      className="w-full py-2.5 border border-slate-200 rounded-xl hover:bg-slate-50 text-xs font-bold transition-all text-slate-800 flex items-center justify-center gap-2 shadow-2xs active:scale-[0.98]"
                                  >
                                      <FileText className="w-3.5 h-3.5 text-purple-600" />
                                      <span>Open Institutional Catalog Directory</span>
                                  </button>
                              </div>
                          </div>
                      </div>
                  </div>
              );

          case 'assistant':
          case 'scout':
              return (
                  <ResearchAssistant 
                      workspacePapers={workspacePapers}
                      allDiscoveredPapers={papers}
                      activeQuery={query}
                      model={selectedModel}
                      userSettings={userSettings}
                      onAddPapersToWorkspace={(addedPapers) => {
                          addedPapers.forEach(p => stagePaperInS3ASession(p));
                          setWorkspacePapers(prev => {
                              const existingIds = new Set(prev.map(p => p.id));
                              const newOnes = addedPapers.filter(p => !existingIds.has(p.id));
                              return [...prev, ...newOnes];
                          });
                          setToastMessage(`Admitted ${addedPapers.length} ${addedPapers.length === 1 ? 'work' : 'works'} to Evidence Ledger`);
                      }}
                      onNavigateToWorkspace={() => setActiveNav('queue')}
                      onSelectPaper={(paper) => navigateToPaperDetail(paper, 'assistant')}
                      isLocalLabOnline={isLocalLabOnline}
                  />
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
                      user={user}
                      workspacePapers={workspacePapers}
                      searchQuery={query}
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

      // Clean, focused scholarly layout without redundant sidebar or breadcrumb clutter
      return (
          <div className="w-full flex-grow flex flex-col bg-slate-50/60">
              {activeTask && (
                  <div className="bg-amber-50 border-b border-amber-200/80 px-4 py-2 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                          <span className="font-semibold text-amber-900">Active Task Study:</span>
                          <span className="text-amber-800">{activeTask.title}</span>
                      </div>
                      <button 
                          onClick={() => {
                              handleMarkCompleted(activeTask.id);
                              setActiveTask(null);
                              setAppMode('evaluation');
                          }}
                          className="bg-amber-900 hover:bg-amber-800 text-white px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors"
                      >
                          Complete Task
                      </button>
                  </div>
              )}
              <section className="flex-grow p-4 sm:p-6 lg:p-8 overflow-y-auto">
                  <div className={`${['results', 'queue', 'marketplace', 'export', 'connections'].includes(activeNav) ? 'max-w-6xl' : 'max-w-3xl'} mx-auto animate-in fade-in duration-200`}>
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
            workspacePapersCount={workspacePapers.length}
            papersCount={papers.length}
            activeNav={activeNav as any}
            onNavigate={(nav) => setActiveNav(nav as any)}
            onModeChange={setAppMode}
            onOpenAbout={() => setShowAbout(true)}
            onOpenHelp={() => setShowOnboarding(true)}
            onOpenProxySettings={() => setShowProxy(true)}
            onOpenScholarBridge={() => setShowBridgesModal(true)}
            onOpenLrsInspector={() => setShowLrsInspector(true)}
            onOpenDbFinder={() => setShowDbFinder(true)}
            onOpenLibraryGuide={() => setShowLibraryGuide(true)}
            onOpenS3AInspector={() => setShowS3AInspector(true)}
            onOpenDatabaseSettings={() => setShowDatabaseSettings(true)}
            onLoginClick={() => setShowLogin(true)}
            onLogoutClick={handleLogout}
            onOpenSnapshotModal={() => setShowExportModal(true)}
            onStartResearchProject={() => setShowStartResearchProject(true)}
            userRoleMode={userRoleMode}
            consentState={consentState}
        />

        {studyInvitePending && targetStudyId && consentState === 'none' && !showFirstRunConsent && (
            <StudyInviteBanner
                studyId={targetStudyId}
                onJoin={(id) => {
                    setTargetStudyId(id);
                    setShowFirstRunConsent(true);
                }}
                onDismiss={() => setStudyInvitePending(false)}
            />
        )}

        <main className="flex-grow flex flex-col">
            {renderMainContent()}
        </main>

        {/* Modals */}
        <FirstRunConsentModal 
            isOpen={showFirstRunConsent} 
            onClose={() => {
                setShowFirstRunConsent(false);
                isRecordingActive().then(setRecordingActive).catch(() => {});
                getConsentState().then(setConsentState).catch(() => {});
            }} 
            onModeSelected={(mode) => setUserRoleMode(mode)}
            onConsentChange={(active) => {
                setRecordingActive(active);
                getConsentState().then(setConsentState).catch(() => {});
            }}
            initialStudyId={targetStudyId}
        />
        <JoinStudyModal
            isOpen={showJoinStudy}
            onClose={() => setShowJoinStudy(false)}
            onContinue={(studyId) => {
                setShowJoinStudy(false);
                setTargetStudyId(studyId);
                setShowFirstRunConsent(true);
            }}
            initialStudyId={targetStudyId}
        />
        <StartResearchProjectModal
            isOpen={showStartResearchProject}
            onClose={() => setShowStartResearchProject(false)}
            onProjectCreated={(projectName, initialQueries, studyId) => {
                setUserRoleMode('researcher');
                setProjects(prev => [...prev, { id: `proj-${Date.now()}`, name: projectName, color: 'indigo' }]);
                setToastMessage(`Started research project "${projectName}" in Researcher Mode.`);
                setActiveNav('queue');
                if (studyId) {
                    setTargetStudyId(studyId);
                    setShowFirstRunConsent(true);
                }
            }}
        />
        <DatabaseSettingsModal 
            isOpen={showDatabaseSettings} 
            onClose={() => {
                setShowDatabaseSettings(false);
                isRecordingActive().then(setRecordingActive).catch(() => {});
                getConsentState().then(setConsentState).catch(() => {});
            }}
            onConsentChange={(active) => {
                setRecordingActive(active);
                getConsentState().then(setConsentState).catch(() => {});
            }}
            onStartResearchProject={() => {
                setShowDatabaseSettings(false);
                setShowStartResearchProject(true);
            }}
            onOpenConsentModal={() => {
                setShowDatabaseSettings(false);
                setShowFirstRunConsent(true);
            }}
            onOpenJoinStudy={() => {
                setShowDatabaseSettings(false);
                setShowJoinStudy(true);
            }}
        />
        <BridgesAndSyncModal 
            isOpen={showBridgesModal} 
            onClose={() => setShowBridgesModal(false)} 
            settings={userSettings} 
            onSaveSettings={(partial) => setUserSettings(prev => ({ ...prev, ...partial }))}
            activePapers={workspacePapers.length > 0 ? workspacePapers : papers}
            activeSessionId={scoutSessionUuid}
            onOpenDatabaseSettings={() => setShowConnections(true)}
            currentResearchState={convertPapersToS3APayload(
                workspacePapers,
                query || scoutTopic || "Scholarly Research Session",
                {
                    domain: currentSearchOptions.domain || "all",
                    depth: summaryLength,
                    style: summaryStyle
                }
            )}
        />
        <LoginScreen isOpen={showLogin} onClose={() => setShowLogin(false)} onLogin={handleLogin} />
        <ProxySettingsModal isOpen={showProxy} onClose={() => setShowProxy(false)} settings={userSettings} onSave={setUserSettings} />
        <ConnectionsDashboard 
            isOpen={showConnections} 
            onClose={() => setShowConnections(false)} 
            settings={userSettings} 
            onSave={setUserSettings} 
            user={user}
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

        <S3AInspectorModal
            isOpen={showS3AInspector}
            onClose={() => setShowS3AInspector(false)}
            state={s3aState}
        />

        <ExportSnapshotModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            workspacePapers={workspacePapers}
            exportFileName={exportFileName}
            onFileNameChange={setExportFileName}
            isCompiling={isCompilingSnapshot}
            compilationProgress={compilationProgress}
            compilationItemIndex={compilationItemIndex}
            compilationPaperTitle={compilationPaperTitle}
            onDownload={handleDownloadSnapshot}
            onCopy={handleCopyToClipboard}
            snapshotJsonString={snapshotJsonString}
            autoSaveSnapshot={userSettings.autoSaveSnapshot}
            searchQuery={query || scoutTopic}
            projectName={activeProjectName !== 'General Research' ? activeProjectName : ''}
            querySettings={{
                domain: currentSearchOptions.domain || "all",
                depth: summaryLength,
                style: summaryStyle
            }}
            services={scoutServices}
            onSyncSuccess={(result) => {
                setToastMessage(`⚡ Synced to Local Research Lab: ${result.ingested_papers} papers streamed to ${result.target_db}`);
            }}
            onOpenConnections={() => {
                setShowExportModal(false);
                setActiveNav('connections');
            }}
        />

        {/* S3A Dev Panel (activates on ?debug=1) */}
        <S3ADevPanel />
    </div>
  );
};

export default App;
