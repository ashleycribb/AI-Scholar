

import React, { useState, useEffect, useMemo } from 'react';
import type { ResearchPaper, SummaryLength, SummaryStyle, AdvancedSearchOptions, AnalysisResult, Project, VerificationResult, PaperAnalysis, SortConfig, SortKey, SynthesisResult, AppMode, GoldStandardPaper, UserStudyData, TestHarnessResult, ModelDefinition, ChatMessage, SearchSourceInfo, SuggestionsResult, ConnectedPaper } from './types';
import * as apiService from './services/apiService';
import * as agentService from './services/agentService';
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
import * as verificationService from './services/verificationService';
import { analyticsService } from './services/analyticsService';
import { CitationModal } from './components/CitationModal';
import * as extensionService from './services/extensionService';
import { DatabaseFinderModal } from './components/DatabaseFinderModal';
import * as analysisService from './services/analysisService';
import { Header } from './components/Header';
import { ConnectedPapersModal } from './components/ConnectedPapersModal';


const PROJECT_COLORS = ['sky', 'green', 'yellow', 'red', 'purple', 'pink', 'indigo', 'teal'];

export const AVAILABLE_MODELS: ModelDefinition[] = [
  { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini Pro', provider: 'gemini' },
  { id: 'gpt-4-turbo', name: 'OpenAI GPT-4 Turbo', provider: 'openai', isMock: true },
  { id: 'claude-3-sonnet', name: 'Anthropic Claude 3 Sonnet', provider: 'anthropic', isMock: true },
];

const App: React.FC = () => {
    // App mode
    const [appMode, setAppMode] = useState<AppMode>('search');
    
    // Search Mode State
    const [query, setQuery] = useState('');
    const [model, setModel] = useState<ModelDefinition>(AVAILABLE_MODELS[0]);
    const [papers, setPapers] = useState<ResearchPaper[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
    const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
    const [hasSearched, setHasSearched] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });
    const [selectedPaper, setSelectedPaper] = useState<ResearchPaper | null>(null);
    const [workspacePapers, setWorkspacePapers] = useState<ResearchPaper[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
    const [isScreeningMode, setIsScreeningMode] = useState(false);
    const [isReranking, setIsReranking] = useState(false);
    const [projectChats, setProjectChats] = useState<{ [projectId: string]: { history: ChatMessage[], isLoading: boolean } }>({});
    const [searchSources, setSearchSources] = useState<SearchSourceInfo[]>([{ id: 'openalex', name: 'OpenAlex', description: 'A comprehensive open index of scholarly works.' }]);
    
    // Live Search Suggestions
    const [searchSuggestions, setSearchSuggestions] = useState<string[]>([]);
    const [isGeneratingSearchSuggestions, setIsGeneratingSearchSuggestions] = useState(false);

    // Pagination state
    const [summary, setSummary] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [lastUsedOptions, setLastUsedOptions] = useState<AdvancedSearchOptions>({
        startYear: '',
        endYear: '',
        authors: '',
        excludeKeywords: '',
        inclusionCriteria: '',
        exclusionCriteria: '',
        studyDesign: 'any',
        journal: '',
        minCitations: '',
        titleKeywords: '',
        abstractKeywords: '',
        isOpenAccess: false,
    });

    // Modals State
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
    const [paperToVerify, setPaperToVerify] = useState<ResearchPaper | null>(null);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);
    const [isGapAnalysisModalOpen, setIsGapAnalysisModalOpen] = useState(false);
    const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
    const [gapAnalysisResult, setGapAnalysisResult] = useState<string | null>(null);
    const [gapAnalysisError, setGapAnalysisError] = useState<string | null>(null);
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isAnalyzingPaper, setIsAnalyzingPaper] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{paper: ResearchPaper, analysis: PaperAnalysis} | null>(null);
    const [isSynthesisModalOpen, setIsSynthesisModalOpen] = useState(false);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
    const [synthesisError, setSynthesisError] = useState<string | null>(null);
    const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
    const [paperForCitation, setPaperForCitation] = useState<ResearchPaper | null>(null);
    const [isDbFinderOpen, setIsDbFinderOpen] = useState(false);
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
    const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
    const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
    const [connectionsResult, setConnectionsResult] = useState<{ seedPaper: ResearchPaper; connections: ConnectedPaper[] } | null>(null);
    const [isFindingConnections, setIsFindingConnections] = useState(false);
    const [connectionsError, setConnectionsError] = useState<string | null>(null);


    // Dissertation Study State
    const [goldStandardDataset, setGoldStandardDataset] = useState<GoldStandardPaper[]>([]);
    const [testHarnessResults, setTestHarnessResults] = useState<TestHarnessResult[]>([]);
    const [userStudyData, setUserStudyData] = useState<UserStudyData[]>([]);

    useEffect(() => {
        const handlePaperReceived = (paper: ResearchPaper) => {
            setWorkspacePapers(prev => {
                if (prev.some(p => p.id === paper.id)) {
                    return prev; // Already in workspace
                }
                return [paper, ...prev];
            });
        };

        const cleanup = extensionService.listenForExtensionMessages(
            handlePaperReceived, // onPaperSaved (now used for adding to workspace)
            (paperId) => { // onPaperRemoved
                setWorkspacePapers(prev => prev.filter(p => p.id !== paperId));
            }
        );

        return cleanup;
    }, []);

    // Effect for debouncing search suggestions
    useEffect(() => {
        const fetchSearchSuggestions = async (currentQuery: string) => {
            setIsGeneratingSearchSuggestions(true);
            try {
                const suggestions = await apiService.generateSearchSuggestions(currentQuery, model);
                // Only update suggestions if the query hasn't changed while fetching
                setQuery(prevQuery => {
                    if (prevQuery === currentQuery) {
                        setSearchSuggestions(suggestions);
                    }
                    return prevQuery;
                });
            } catch (error) {
                console.error("Failed to fetch search suggestions:", error);
                setSearchSuggestions([]);
            } finally {
                setIsGeneratingSearchSuggestions(false);
            }
        };

        const handler = setTimeout(() => {
            if (query.length > 3 && !isLoading && !hasSearched) {
                fetchSearchSuggestions(query);
            } else {
                setSearchSuggestions([]);
            }
        }, 500); // 500ms debounce

        return () => {
            clearTimeout(handler);
        };
    }, [query, isLoading, hasSearched, model]);


    const handleSearch = async (searchQuery: string, options: AdvancedSearchOptions) => {
        if (!searchQuery.trim()) return;

        const doiRegex = /^10.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
        const isDoiSearch = doiRegex.test(searchQuery.trim());

        setSearchSuggestions([]);
        setIsGeneratingSearchSuggestions(false);
        setIsLoading(true);
        setError(null);
        setPapers([]);
        setSummary('');
        setHasSearched(true);
        setSelectedPaper(null);
        setAnalysis(null);
        setIsScreeningMode(false);
        setSortConfig({ key: 'relevance', direction: 'desc' });
        setCurrentPage(1);
        setLastUsedOptions(options);

        if (isDoiSearch) {
            try {
                const doi = searchQuery.trim();
                const result = await apiService.searchByDoi(doi, model);
                if (result) {
                    setPapers([result]);
                    setHasMore(false);
                    handleSelectPaper(result); // Automatically select to show details
                } else {
                    setError(`No paper found for DOI: ${doi}`);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "An unknown error occurred while searching by DOI.");
            } finally {
                setIsLoading(false);
            }
        } else {
            try {
                const result = await apiService.search(searchQuery, options, summaryLength, summaryStyle, model, searchSources, 1);
                
                // Run bibliometric analysis on the client-side for performance
                const analysisResult = await analysisService.analyzePapers(result.papers);
    
                setPapers(result.papers);
                setAnalysis(analysisResult);
                setHasMore(result.hasMore);
                if (result.summary) {
                    setSummary(result.summary);
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : "An unknown error occurred.");
            } finally {
                setIsLoading(false);
            }
        }
    };
    
    const handleSuggestionSearch = (suggestion: string) => {
        setQuery(suggestion);
        handleSearch(suggestion, lastUsedOptions);
    };

    const handleLoadMore = async () => {
        if (!query.trim() || isLoadingMore || !hasMore) return;
    
        setIsLoadingMore(true);
        setError(null);
        
        const pageToFetch = currentPage + 1;
        
        try {
            const result = await apiService.search(query, lastUsedOptions, summaryLength, summaryStyle, model, searchSources, pageToFetch);
            
            const newPapers = [...papers, ...result.papers];
            setPapers(newPapers);
            setCurrentPage(pageToFetch);
            setHasMore(result.hasMore);
    
            const analysisResult = await analysisService.analyzePapers(newPapers);
            setAnalysis(analysisResult);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsLoadingMore(false);
        }
    };
    
    const updatePaperState = (paperId: string, updates: Partial<ResearchPaper>) => {
        const updater = (p: ResearchPaper) => p.id === paperId ? { ...p, ...updates } : p;
        setPapers(prev => prev.map(updater));
        setWorkspacePapers(prev => prev.map(updater));
        if (selectedPaper?.id === paperId) {
            setSelectedPaper(prev => prev ? { ...prev, ...updates } : null);
        }
    };

    // Asynchronously classify study designs for new papers without blocking the UI
    useEffect(() => {
        const papersToClassify = papers.filter(p => p.detectedStudyDesign === undefined);

        if (papersToClassify.length > 0) {
            // Mark papers as "classification in progress" to avoid re-triggering on re-renders.
            // This is a simple semaphore; it doesn't have a UI representation.
            papersToClassify.forEach(p => updatePaperState(p.id, { detectedStudyDesign: '...' as any }));

            papersToClassify.forEach(paper => {
                apiService.classifyStudyDesign(paper, model)
                    .then(design => {
                        updatePaperState(paper.id, { detectedStudyDesign: design });
                    })
                    .catch(error => {
                        console.error(`Failed to classify study design for paper ${paper.id}`, error);
                        updatePaperState(paper.id, { detectedStudyDesign: 'N/A' });
                    });
            });
        }
    }, [papers, model]);

    const handleSelectPaper = async (paper: ResearchPaper) => {
        setSelectedPaper(paper);

        // Fetch open access PDF if DOI is available and not yet fetched
        if (paper.doi && !paper.openAccessState) {
            updatePaperState(paper.id, { openAccessState: 'loading' });
            try {
                const url = await apiService.findOpenAccessPdf(paper.doi);
                updatePaperState(paper.id, { openAccessPdfUrl: url || undefined, openAccessState: 'loaded' });
            } catch (error) {
                console.error("Failed to find open access PDF:", error);
                updatePaperState(paper.id, { openAccessState: 'error' });
            }
        }

        // Fetch Key Concepts if not already fetched
        if (!paper.keyConceptsState || paper.keyConceptsState === 'idle') {
            if (paper.abstract.length < 150) {
                 updatePaperState(paper.id, { keyConcepts: [], keyConceptsState: 'loaded' });
            } else {
                updatePaperState(paper.id, { keyConceptsState: 'loading' });
                try {
                    const concepts = await apiService.extractKeyConcepts(paper.abstract, model);
                    updatePaperState(paper.id, { keyConcepts: concepts, keyConceptsState: 'loaded' });
                } catch (error) {
                    console.error("Failed to extract key concepts:", error);
                    updatePaperState(paper.id, { keyConceptsState: 'error' });
                }
            }
        }
        
        // Fetch Knowledge Graph if not already fetched
        if (!paper.knowledgeGraphState || paper.knowledgeGraphState === 'idle') {
            if (paper.abstract.length < 150) {
                 updatePaperState(paper.id, { knowledgeGraph: { entities: [], relationships: [] }, knowledgeGraphState: 'loaded' });
            } else {
                updatePaperState(paper.id, { knowledgeGraphState: 'loading' });
                try {
                    const graph = await apiService.extractKnowledgeGraph(paper.abstract, model);
                    updatePaperState(paper.id, { knowledgeGraph: graph, knowledgeGraphState: 'loaded' });
                } catch (error) {
                    console.error("Failed to extract knowledge graph:", error);
                    updatePaperState(paper.id, { knowledgeGraphState: 'error' });
                }
            }
        }
    };

    const handleToggleWorkspacePaper = (paper: ResearchPaper) => {
        setWorkspacePapers(prev => {
            const exists = prev.some(p => p.id === paper.id);
            if (exists) {
                // If removing, also remove from any project it's in
                setProjects(projs => projs.map(p => ({...p, paperIds: p.paperIds.filter(id => id !== paper.id) })));
                return prev.filter(p => p.id !== paper.id);
            } else {
                return [...prev, paper];
            }
        });
    };
    
    const handleOpenVerificationModal = (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'verify_paper_modal_opened', paperId: paper.id });
        setPaperToVerify(paper);
        setIsVerificationModalOpen(true);
    };

    const handleVerificationComplete = (doi: string, result: VerificationResult) => {
        setPapers(prev => prev.map(p => p.doi === doi ? { ...p, verificationResult: result } : p));
        setWorkspacePapers(prev => prev.map(p => p.doi === doi ? { ...p, verificationResult: result } : p));
        if (selectedPaper?.doi === doi) {
            setSelectedPaper(prev => prev ? { ...prev, verificationResult: result } : null);
        }
    };

    const handleAnalyzeGaps = async (papersToAnalyze: ResearchPaper[], modelToUse: ModelDefinition) => {
        analyticsService.logEvent('tool_used', { tool: 'analyze_gaps', paperCount: papersToAnalyze.length });
        setIsGapAnalysisModalOpen(true);
        setIsAnalyzingGaps(true);
        setGapAnalysisError(null);
        setGapAnalysisResult(null);

        try {
            const result = await apiService.analyzeGaps(papersToAnalyze, modelToUse);
            setGapAnalysisResult(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setGapAnalysisError(message);
        } finally {
            setIsAnalyzingGaps(false);
        }
    };

    const handleAnalyzePaper = async (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'analyze_single_paper', paperId: paper.id });
        setIsAnalysisModalOpen(true);
        setIsAnalyzingPaper(true);
        setAnalysisError(null);
        // Set paper immediately for the modal header, but analysis will be fetched.
        setAnalysisResult({ paper, analysis: paper.savedAnalysis || {} as PaperAnalysis });

        try {
            const analysis = await apiService.analyzeSinglePaper(paper, model);
            setAnalysisResult({ paper, analysis });
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setAnalysisError(message);
        } finally {
            setIsAnalyzingPaper(false);
        }
    };

    const handleSaveAnalysis = (paper: ResearchPaper, analysis: PaperAnalysis) => {
        const updatePaper = (p: ResearchPaper) => p.id === paper.id ? { ...p, savedAnalysis: analysis } : p;
        setPapers(prev => prev.map(updatePaper));
        setWorkspacePapers(prev => prev.map(updatePaper));
        if (selectedPaper?.id === paper.id) {
            setSelectedPaper(prev => prev ? { ...prev, savedAnalysis: analysis } : null);
        }
        setAnalysisResult(prev => prev ? { ...prev, paper: { ...prev.paper, savedAnalysis: analysis }} : null);
    };
    
    const handleConceptSearch = (concept: string) => {
        const currentQuery = query;
        setQuery(concept);
        handleSearch(concept, { ...lastUsedOptions, inclusionCriteria: `"${concept}" OR "${currentQuery}"` });
    };
    
    const handleOpenCitationModal = (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'open_citation_modal', paperId: paper.id });
        setPaperForCitation(paper);
        setIsCitationModalOpen(true);
    };

    const handleSortChange = (key: SortKey) => {
        setSortConfig(current => {
            if (current.key === key) {
                return { ...current, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' };
        });
    };
    
    const handleSetScreeningMode = (enabled: boolean) => {
        setIsScreeningMode(enabled);
        if (enabled) {
            // Initialize screening status for all papers
            setPapers(prev => prev.map(p => ({ ...p, screeningStatus: p.screeningStatus || 'none' })));
            // Switch to sorting by screening fit score by default
            setSortConfig({ key: 'screeningFitScore', direction: 'desc' });
        }
    };

    const handleScreenPaper = (paperId: string, status: 'include' | 'exclude' | 'none') => {
        setPapers(prev => prev.map(p => p.id === paperId ? { ...p, screeningStatus: status } : p));
    };

    const handleAiRerank = async () => {
        setIsReranking(true);
        try {
            const includedExplicit = papers.filter(p => p.screeningStatus === 'include');
            const allIncluded = [...new Map([...includedExplicit, ...workspacePapers].map(item => [item.id, item])).values()];
            const excluded = papers.filter(p => p.screeningStatus === 'exclude');
            const unscreened = papers.filter(p => !p.screeningStatus || p.screeningStatus === 'none');

            const rerankedResults = await apiService.rerankForScreening(allIncluded, excluded, unscreened, model);

            const rerankedMap = new Map(rerankedResults.map(r => [r.paperId, { score: r.score, rationale: r.rationale }]));

            setPapers(prev => prev.map(p => {
                const rerankedData = rerankedMap.get(p.id);
                if (rerankedData) {
                    return {
                        ...p,
                        screeningFitScore: rerankedData.score,
                        screeningRationale: rerankedData.rationale,
                    };
                }
                return p;
            }));

        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred during AI re-ranking.");
        } finally {
            setIsReranking(false);
        }
    };

    const handleGenerateSuggestions = async (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'generate_suggestions', paperId: paper.id });
        setIsGeneratingSuggestions(true);
        setSuggestionsError(null);
        setIsSuggestionsModalOpen(true);
        setSuggestionsResult({ seedPaper: paper, suggestions: [] });

        try {
            const suggestions = await apiService.generateSuggestions(paper, model);
            setSuggestionsResult({ seedPaper: paper, suggestions });
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setSuggestionsError(message);
        } finally {
            setIsGeneratingSuggestions(false);
        }
    };

    const handleSuggestionClick = (newQuery: string) => {
        setIsSuggestionsModalOpen(false);
        setQuery(newQuery);
        handleSearch(newQuery, lastUsedOptions);
    };

    const handleFindDoi = async (paperToUpdate: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'find_doi', paperId: paperToUpdate.id });
        updatePaperState(paperToUpdate.id, { doiState: 'loading' });
        try {
            const doi = await apiService.findDoiForPaper(paperToUpdate);
            if (doi) {
                updatePaperState(paperToUpdate.id, { doi: doi, doiState: 'loaded' });
            } else {
                updatePaperState(paperToUpdate.id, { doiState: 'error' });
            }
        } catch (error) {
            console.error("Failed to find DOI:", error);
            updatePaperState(paperToUpdate.id, { doiState: 'error' });
        }
    };

    const handleFindConnectedPapers = async (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'find_connected_papers', paperId: paper.id });
        setIsConnectionsModalOpen(true);
        setIsFindingConnections(true);
        setConnectionsError(null);
        setConnectionsResult({ seedPaper: paper, connections: [] });

        try {
            const connections = await apiService.findConnectedPapers(paper, model);
            setConnectionsResult({ seedPaper: paper, connections });
        } catch (err) {
            setConnectionsError(err instanceof Error ? err.message : "An unknown error occurred.");
        } finally {
            setIsFindingConnections(false);
        }
    };


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

    const handleCreateProject = (name: string) => {
        const newProject: Project = {
            id: `proj_${Date.now()}`,
            name,
            paperIds: [],
            createdAt: Date.now(),
            color: PROJECT_COLORS[projects.length % PROJECT_COLORS.length],
            paperStatuses: {},
        };
        setProjects(prev => [...prev, newProject]);
    };

    const handleDeleteProject = (projectId: string) => {
        setProjects(prev => prev.filter(p => p.id !== projectId));
        // Also remove any chat history associated with the project
        setProjectChats(prev => {
            const newChats = {...prev};
            delete newChats[projectId];
            return newChats;
        });
    };

    const handleMovePaperToProject = (paperId: string, projectId: string | null) => {
        setProjects(prevProjects => {
            const newProjects = prevProjects.map(p => ({
                ...p,
                paperIds: p.paperIds.filter(id => id !== paperId),
            }));

            if (projectId) {
                const targetProjectIndex = newProjects.findIndex(p => p.id === projectId);
                if (targetProjectIndex > -1) {
                    newProjects[targetProjectIndex].paperIds.push(paperId);
                }
            }
            return newProjects;
        });
    };

    const handleUpdateProjectColor = (projectId: string, color: string) => {
        setProjects(prev => prev.map(p => p.id === projectId ? { ...p, color } : p));
    };

    const handleSynthesizeWorkspace = async (papersToSynthesize: ResearchPaper[], modelToUse: ModelDefinition) => {
        analyticsService.logEvent('tool_used', { tool: 'synthesize_workspace', paperCount: papersToSynthesize.length });
        setIsSynthesisModalOpen(true);
        setIsSynthesizing(true);
        setSynthesisError(null);
        setSynthesisResult(null);
        try {
            const result = await apiService.synthesizePapers(papersToSynthesize, modelToUse);
            setSynthesisResult(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : "An unknown error occurred.";
            setSynthesisError(message);
        } finally {
            setIsSynthesizing(false);
        }
    };

     const handleIndexPaperForRag = (projectId: string, paperId: string) => {
        setProjects(prev => prev.map(p => {
            if (p.id === projectId) {
                const newStatuses = { ...p.paperStatuses, [paperId]: 'indexing' as const };
                return { ...p, paperStatuses: newStatuses };
            }
            return p;
        }));

        // Simulate indexing delay
        setTimeout(() => {
            setProjects(prev => prev.map(p => {
                if (p.id === projectId) {
                    const newStatuses = { ...p.paperStatuses, [paperId]: 'indexed' as const };
                    return { ...p, paperStatuses: newStatuses };
                }
                return p;
            }));
        }, 2000 + Math.random() * 1000);
    };

    const handleProjectChat = async (projectId: string, message: string) => {
        const project = projects.find(p => p.id === projectId);
        if (!project) return;
    
        const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };
    
        setProjectChats(prev => ({
            ...prev,
            [projectId]: {
                history: [...(prev[projectId]?.history || []), userMessage],
                isLoading: true,
            }
        }));
    
        try {
            const projectPapers = project.paperIds.map(id => workspacePapers.find(p => p.id === id)).filter((p): p is ResearchPaper => !!p);
            
            // The agent service now streams updates. We'll handle them one by one.
            const agentStream = agentService.runAgentTask(message, project, projectPapers, model);
    
            for await (const update of agentStream) {
                setProjectChats(prev => {
                    const currentHistory = prev[projectId]?.history || [];
                    let newHistory = [...currentHistory];
    
                    if (update.type === 'tool-start') {
                        newHistory.push({ role: 'tool', parts: [{ toolCall: update.toolCall }] });
                    } else if (update.type === 'tool-end') {
                        // Find the corresponding tool-start message and add the result
                        const lastMsgIndex = newHistory.length - 1;
                        if (newHistory[lastMsgIndex]?.role === 'tool' && newHistory[lastMsgIndex].parts[0].toolCall?.name === update.toolResponse.name) {
                            newHistory[lastMsgIndex].parts[0].toolResponse = update.toolResponse;
                        }
                    } else if (update.type === 'final-answer') {
                        newHistory.push({ role: 'model', parts: [{ text: update.text }] });
                    }
    
                    return {
                        ...prev,
                        [projectId]: {
                            ...prev[projectId],
                            history: newHistory,
                        },
                    };
                });
            }
    
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : "An error occurred.";
            const modelMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessage}` }] };
            setProjectChats(prev => ({
                ...prev,
                [projectId]: {
                    history: [...(prev[projectId]?.history || []), modelMessage],
                    isLoading: false,
                }
            }));
        } finally {
            setProjectChats(prev => ({
                ...prev,
                [projectId]: {
                    ...prev[projectId],
                    isLoading: false,
                }
            }));
        }
    };

    const handleAddSource = (source: SearchSourceInfo) => {
        setSearchSources(prev => {
            if (!prev.some(s => s.id === source.id)) {
                return [...prev, source];
            }
            return prev;
        });
    };


    // --- Dissertation Feature Handlers ---

    const handleUpdateGoldStandardPaper = (updatedPaper: GoldStandardPaper) => {
        setGoldStandardDataset(prev => prev.map(p => p.paper_id === updatedPaper.paper_id ? updatedPaper : p));
    };

    const handleRunTestHarness = async () => {
        analyticsService.logEvent('test_harness_run_started', { datasetSize: goldStandardDataset.length });
        const results: TestHarnessResult[] = [];
        for (const paper of goldStandardDataset) {
            try {
                const vacsResult = await verificationService.verifyPaper(paper.paper_id, paper.title);
                
                // Map VACS verdict to our label system for comparison
                const vacsLabel = vacsResult.verdict === 'Verified' ? 'verified' 
                                : vacsResult.verdict === 'Questionable' ? 'refuted' 
                                : 'inconclusive';

                const isCorrect = vacsLabel === paper.label;

                results.push({
                    paperId: paper.paper_id,
                    vacsResult,
                    groundTruth: paper,
                    isCorrect,
                    precisionAt1: isCorrect ? 1 : 0,
                });
            } catch (error) {
                console.error(`Failed to verify paper ${paper.paper_id}`, error);
            }
        }
        setTestHarnessResults(results);
        const accuracy = results.length > 0 ? (results.filter(r => r.isCorrect).length / results.length) * 100 : 0;
        analyticsService.logEvent('test_harness_run_completed', { 
            testCount: results.length, 
            accuracy: parseFloat(accuracy.toFixed(2)) 
        });
    };

    const handleSaveUserStudyData = (data: UserStudyData) => {
        analyticsService.logEvent('user_study_task_completed', { studyData: data });
        setUserStudyData(prev => [...prev, data]);
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
                                // In a real study, you might show a new task or end the session.
                                // For now, we return to the dashboard.
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
                                                onAiRerank={handleAiRerank}
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
                                <WorkspacePanel papers={papers} selectedPaper={selectedPaper} analysis={analysis} summary={summary} workspacePapers={workspacePapers} projects={projects} sources={[]} onToggleWorkspacePaper={handleToggleWorkspacePaper} onFindConnectedPapers={handleFindConnectedPapers} isFindingConnected={isFindingConnections} onAnalyzePaper={handleAnalyzePaper} onCitePaper={handleOpenCitationModal} isAnalyzingPaper={isAnalyzingPaper} onConceptClick={handleConceptSearch} onFindDoi={handleFindDoi} onGenerateSuggestions={handleGenerateSuggestions} isGeneratingSuggestions={isGeneratingSuggestions} onVerifyPaper={handleOpenVerificationModal} logAnalyticsEvent={() => {}} refinedQueries={refinedQueries} isGeneratingRefined={false} onRefinedQuerySearch={() => {}} onAnalyzeGaps={handleAnalyzeGaps} onSynthesizeWorkspace={handleSynthesizeWorkspace} onCreateProject={handleCreateProject} onDeleteProject={handleDeleteProject} onMovePaperToProject={handleMovePaperToProject} onUpdateProjectColor={handleUpdateProjectColor} model={model} onIndexPaperForRag={handleIndexPaperForRag} projectChats={projectChats} onProjectChat={handleProjectChat} />
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