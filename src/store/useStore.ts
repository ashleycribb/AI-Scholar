// src/store/useStore.ts
import { create } from 'zustand';
import {
  ResearchPaper,
  SummaryLength,
  SummaryStyle,
  AdvancedSearchOptions,
  AnalysisResult,
  Project,
  VerificationResult,
  PaperAnalysis,
  SortConfig,
  SynthesisResult,
  AppMode,
  ModelDefinition,
  ChatMessage,
  SearchSourceInfo,
  SuggestionsResult,
} from '../types';
import * as apiService from '../services/apiService';
import * as analysisService from '../services/analysisService';
import * as ragService from '../services/ragService';

interface AppState {
  appMode: AppMode;
  query: string;
  model: ModelDefinition;
  papers: ResearchPaper[];
  isLoading: boolean;
  error: string | null;
  summaryLength: SummaryLength;
  summaryStyle: SummaryStyle;
  hasSearched: boolean;
  sortConfig: SortConfig;
  selectedPaper: ResearchPaper | null;
  workspacePapers: ResearchPaper[];
  projects: Project[];
  analysis: AnalysisResult | null;
  isScreeningMode: boolean;
  isReranking: boolean;
  projectChats: { [projectId: string]: { history: ChatMessage[]; isLoading: boolean } };
  searchSources: SearchSourceInfo[];
  isVerificationModalOpen: boolean;
  paperToVerify: ResearchPaper | null;
  isOnboardingOpen: boolean;
  isAboutModalOpen: boolean;
  isGapAnalysisModalOpen: boolean;
  isAnalyzingGaps: boolean;
  gapAnalysisResult: string | null;
  gapAnalysisError: string | null;
  isAnalysisModalOpen: boolean;
  isAnalyzingPaper: boolean;
  analysisError: string | null;
  analysisResult: { paper: ResearchPaper; analysis: PaperAnalysis } | null;
  isSynthesisModalOpen: boolean;
  isSynthesizing: boolean;
  synthesisResult: SynthesisResult | null;
  synthesisError: string | null;
  isCitationModalOpen: boolean;
  paperForCitation: ResearchPaper | null;
  isDbFinderOpen: boolean;
  isSuggestionsModalOpen: boolean;
  suggestionsResult: SuggestionsResult | null;
  isGeneratingSuggestions: boolean;
  suggestionsError: string | null;
  isUploadingPdf: boolean;
  pdfUploadError: string | null;

  setAppMode: (mode: AppMode) => void;
  setQuery: (query: string) => void;
  setModel: (model: ModelDefinition) => void;
  handleSearch: (searchQuery: string, options: AdvancedSearchOptions) => Promise<void>;
  updatePaperState: (paperId: string, updates: Partial<ResearchPaper>) => void;
  handleSelectPaper: (paper: ResearchPaper) => Promise<void>;
  toggleWorkspacePaper: (paper: ResearchPaper) => void;
  openVerificationModal: (paper: ResearchPaper) => void;
  closeVerificationModal: () => void;
  handleVerificationComplete: (doi: string, result: VerificationResult) => void;
  analyzeGaps: (papersToAnalyze: ResearchPaper[], modelToUse: ModelDefinition) => Promise<void>;
  analyzePaper: (paper: ResearchPaper) => Promise<void>;
  saveAnalysis: (paper: ResearchPaper, analysis: PaperAnalysis) => void;
  conceptSearch: (concept: string) => void;
  openCitationModal: (paper: ResearchPaper) => void;
  closeCitationModal: () => void;
  setSortConfig: (key: SortConfig['key']) => void;
  setScreeningMode: (enabled: boolean) => void;
  screenPaper: (paperId: string, status: 'include' | 'exclude' | 'none') => void;
  aiRerank: () => Promise<void>;
  generateSuggestions: (paper: ResearchPaper) => Promise<void>;
  suggestionSearch: (newQuery: string) => void;
  createProject: (name: string) => void;
  deleteProject: (projectId: string) => void;
  movePaperToProject: (paperId: string, projectId: string | null) => void;
  updateProjectColor: (projectId: string, color: string) => void;
  synthesizeWorkspace: (papersToSynthesize: ResearchPaper[], modelToUse: ModelDefinition) => Promise<void>;
  indexPaperForRag: (projectId: string, paperId: string) => void;
  projectChat: (projectId: string, message: string) => Promise<void>;
  addSource: (source: SearchSourceInfo) => void;
  closeOnboarding: () => void;
  openAboutModal: () => void;
  closeAboutModal: () => void;
  closeGapAnalysisModal: () => void;
  closeAnalysisModal: () => void;
  closeSynthesisModal: () => void;
  openDbFinder: () => void;
  closeDbFinder: () => void;
  closeSuggestionsModal: () => void;
  uploadPdf: (file: File) => Promise<void>;
}

export const useStore = create<AppState>((set, get) => ({
  appMode: 'search',
  query: '',
  model: { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' },
  papers: [],
  isLoading: false,
  error: null,
  summaryLength: 'medium',
  summaryStyle: 'paragraph',
  hasSearched: false,
  sortConfig: { key: 'relevance', direction: 'desc' },
  selectedPaper: null,
  workspacePapers: [],
  projects: [],
  analysis: null,
  isScreeningMode: false,
  isReranking: false,
  projectChats: {},
  searchSources: [{ id: 'openalex', name: 'OpenAlex', description: 'A comprehensive open index of scholarly works.' }],
  isVerificationModalOpen: false,
  paperToVerify: null,
  isOnboardingOpen: false,
  isAboutModalOpen: false,
  isGapAnalysisModalOpen: false,
  isAnalyzingGaps: false,
  gapAnalysisResult: null,
  gapAnalysisError: null,
  isAnalysisModalOpen: false,
  isAnalyzingPaper: false,
  analysisError: null,
  analysisResult: null,
  isSynthesisModalOpen: false,
  isSynthesizing: false,
  synthesisResult: null,
  synthesisError: null,
  isCitationModalOpen: false,
  paperForCitation: null,
  isDbFinderOpen: false,
  isSuggestionsModalOpen: false,
  suggestionsResult: null,
  isGeneratingSuggestions: false,
  suggestionsError: null,
  isUploadingPdf: false,
  pdfUploadError: null,

  setAppMode: (mode) => set({ appMode: mode }),
  setQuery: (query) => set({ query }),
  setModel: (model) => set({ model }),
  handleSearch: async (searchQuery, options) => {
    if (!searchQuery.trim()) return;

    set({ isLoading: true, error: null, papers: [], hasSearched: true, selectedPaper: null, analysis: null, isScreeningMode: false, sortConfig: { key: 'relevance', direction: 'desc' } });

    try {
      const { summaryLength, summaryStyle, model, searchSources } = get();
      const result = await apiService.search(searchQuery, options, summaryLength, summaryStyle, model, searchSources);
      const analysisResult = await analysisService.analyzePapers(result.papers);

      set({ papers: result.papers, analysis: analysisResult });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isLoading: false });
    }
  },
  updatePaperState: (paperId, updates) => {
    const updater = (p: ResearchPaper) => (p.id === paperId ? { ...p, ...updates } : p);
    set((state) => ({
      papers: state.papers.map(updater),
      workspacePapers: state.workspacePapers.map(updater),
      selectedPaper: state.selectedPaper?.id === paperId ? { ...state.selectedPaper, ...updates } : state.selectedPaper,
    }));
  },
  handleSelectPaper: async (paper) => {
    const { updatePaperState, model } = get();
    set({ selectedPaper: paper });

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
  },
  toggleWorkspacePaper: (paper) => {
    set((state) => {
      const exists = state.workspacePapers.some((p) => p.id === paper.id);
      if (exists) {
        return {
          workspacePapers: state.workspacePapers.filter((p) => p.id !== paper.id),
          projects: state.projects.map((p) => ({ ...p, paperIds: p.paperIds.filter((id) => id !== paper.id) })),
        };
      } else {
        return { workspacePapers: [...state.workspacePapers, paper] };
      }
    });
  },
  openVerificationModal: (paper) => set({ paperToVerify: paper, isVerificationModalOpen: true }),
  closeVerificationModal: () => set({ isVerificationModalOpen: false, paperToVerify: null }),
  handleVerificationComplete: (doi, result) => {
    const updater = (p: ResearchPaper) => (p.doi === doi ? { ...p, verificationResult: result } : p);
    set((state) => ({
      papers: state.papers.map(updater),
      workspacePapers: state.workspacePapers.map(updater),
      selectedPaper: state.selectedPaper?.doi === doi ? { ...state.selectedPaper, verificationResult: result } : state.selectedPaper,
    }));
  },
  analyzeGaps: async (papersToAnalyze, modelToUse) => {
    set({ isGapAnalysisModalOpen: true, isAnalyzingGaps: true, gapAnalysisError: null, gapAnalysisResult: null });
    try {
      const result = await apiService.analyzeGaps(papersToAnalyze, modelToUse);
      set({ gapAnalysisResult: result });
    } catch (err) {
      set({ gapAnalysisError: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isAnalyzingGaps: false });
    }
  },
  analyzePaper: async (paper) => {
    set({ isAnalysisModalOpen: true, isAnalyzingPaper: true, analysisError: null, analysisResult: { paper, analysis: paper.savedAnalysis || {} as PaperAnalysis } });
    try {
      const analysis = await apiService.analyzeSinglePaper(paper, get().model);
      set({ analysisResult: { paper, analysis } });
    } catch (err) {
      set({ analysisError: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isAnalyzingPaper: false });
    }
  },
  saveAnalysis: (paper, analysis) => {
    const updater = (p: ResearchPaper) => (p.id === paper.id ? { ...p, savedAnalysis: analysis } : p);
    set((state) => ({
      papers: state.papers.map(updater),
      workspacePapers: state.workspacePapers.map(updater),
      selectedPaper: state.selectedPaper?.id === paper.id ? { ...state.selectedPaper, savedAnalysis: analysis } : state.selectedPaper,
      analysisResult: state.analysisResult ? { ...state.analysisResult, paper: { ...state.analysisResult.paper, savedAnalysis: analysis } } : null,
    }));
  },
  conceptSearch: (concept) => {
    const { query, handleSearch } = get();
    set({ query: concept });
    handleSearch(concept, { startYear: '', endYear: '', authors: '', excludeKeywords: '', inclusionCriteria: `"${concept}" OR "${query}"`, exclusionCriteria: '', studyDesign: 'any' });
  },
  openCitationModal: (paper) => set({ paperForCitation: paper, isCitationModalOpen: true }),
  closeCitationModal: () => set({ isCitationModalOpen: false, paperForCitation: null }),
  setSortConfig: (key) => {
    set((state) => {
      if (state.sortConfig.key === key) {
        return { sortConfig: { ...state.sortConfig, direction: state.sortConfig.direction === 'asc' ? 'desc' : 'asc' } };
      }
      return { sortConfig: { key, direction: 'desc' } };
    });
  },
  setScreeningMode: (enabled) => {
    set((state) => ({
      isScreeningMode: enabled,
      papers: enabled ? state.papers.map((p) => ({ ...p, screeningStatus: p.screeningStatus || 'none' })) : state.papers,
      sortConfig: enabled ? { key: 'screeningFitScore', direction: 'desc' } : state.sortConfig,
    }));
  },
  screenPaper: (paperId, status) => {
    set((state) => ({
      papers: state.papers.map((p) => (p.id === paperId ? { ...p, screeningStatus: status } : p)),
    }));
  },
  aiRerank: async () => {
    set({ isReranking: true });
    try {
      const { papers, model } = get();
      const included = papers.filter((p) => p.screeningStatus === 'include');
      const excluded = papers.filter((p) => p.screeningStatus === 'exclude');
      const unscreened = papers.filter((p) => p.screeningStatus === 'none');

      const rerankedResults = await apiService.rerankForScreening(included, excluded, unscreened, model);

      const rerankedMap = new Map(rerankedResults.map((r) => [r.paperId, { score: r.score, rationale: r.rationale }]));

      set((state) => ({
        papers: state.papers.map((p) => {
          const rerankedData = rerankedMap.get(p.id);
          if (rerankedData) {
            return {
              ...p,
              screeningFitScore: rerankedData.score,
              screeningRationale: rerankedData.rationale,
            };
          }
          return p;
        }),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "An error occurred during AI re-ranking." });
    } finally {
      set({ isReranking: false });
    }
  },
  generateSuggestions: async (paper) => {
    set({ isGeneratingSuggestions: true, suggestionsError: null, isSuggestionsModalOpen: true, suggestionsResult: { seedPaper: paper, suggestions: [] } });

    try {
      const suggestions = await apiService.generateSuggestions(paper, get().model);
      set({ suggestionsResult: { seedPaper: paper, suggestions } });
    } catch (err) {
      set({ suggestionsError: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isGeneratingSuggestions: false });
    }
  },
  suggestionSearch: (newQuery) => {
    set({ isSuggestionsModalOpen: false, query: newQuery });
    get().handleSearch(newQuery, { startYear: '', endYear: '', authors: '', excludeKeywords: '', inclusionCriteria: '', exclusionCriteria: '', studyDesign: 'any' });
  },
  createProject: (name) => {
    const newProject: Project = {
      id: `proj_${Date.now()}`,
      name,
      paperIds: [],
      createdAt: Date.now(),
      color: 'sky',
      paperStatuses: {},
    };
    set((state) => ({ projects: [...state.projects, newProject] }));
  },
  deleteProject: (projectId) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      projectChats: (({ [projectId]: _, ...rest }) => rest)(state.projectChats),
    }));
  },
  movePaperToProject: (paperId, projectId) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        const newPaperIds = p.paperIds.filter((id) => id !== paperId);
        if (p.id === projectId) {
          newPaperIds.push(paperId);
        }
        return { ...p, paperIds: newPaperIds };
      }),
    }));
  },
  updateProjectColor: (projectId, color) => {
    set((state) => ({
      projects: state.projects.map((p) => (p.id === projectId ? { ...p, color } : p)),
    }));
  },
  synthesizeWorkspace: async (papersToSynthesize, modelToUse) => {
    set({ isSynthesisModalOpen: true, isSynthesizing: true, synthesisError: null, synthesisResult: null });
    try {
      const result = await apiService.synthesizePapers(papersToSynthesize, modelToUse);
      set({ synthesisResult: result });
    } catch (err) {
      set({ synthesisError: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isSynthesizing: false });
    }
  },
  indexPaperForRag: (projectId, paperId) => {
    set((state) => ({
      projects: state.projects.map((p) => {
        if (p.id === projectId) {
          const newStatuses = { ...p.paperStatuses, [paperId]: 'indexing' as const };
          return { ...p, paperStatuses: newStatuses };
        }
        return p;
      }),
    }));

    setTimeout(() => {
      set((state) => ({
        projects: state.projects.map((p) => {
          if (p.id === projectId) {
            const newStatuses = { ...p.paperStatuses, [paperId]: 'indexed' as const };
            return { ...p, paperStatuses: newStatuses };
          }
          return p;
        }),
      }));
    }, 2000 + Math.random() * 1000);
  },
  projectChat: async (projectId, message) => {
    const { projects, workspacePapers, model, projectChats } = get();
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const userMessage: ChatMessage = { role: 'user', parts: [{ text: message }] };

    set({
      projectChats: {
        ...projectChats,
        [projectId]: {
          history: [...(projectChats[projectId]?.history || []), userMessage],
          isLoading: true,
        },
      },
    });

    try {
      const projectPapers = project.paperIds.map((id) => workspacePapers.find((p) => p.id === id)).filter((p): p is ResearchPaper => !!p);
      const responseText = await ragService.chatWithProject(message, projectPapers, model);
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: responseText }] };

      set((state) => ({
        projectChats: {
          ...state.projectChats,
          [projectId]: {
            history: [...(state.projectChats[projectId]?.history || []), modelMessage],
            isLoading: false,
          },
        },
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An error occurred.";
      const modelMessage: ChatMessage = { role: 'model', parts: [{ text: `Error: ${errorMessage}` }] };
      set((state) => ({
        projectChats: {
          ...state.projectChats,
          [projectId]: {
            history: [...(state.projectChats[projectId]?.history || []), modelMessage],
            isLoading: false,
          },
        },
      }));
    }
  },
  addSource: (source) => {
    set((state) => ({
      searchSources: state.searchSources.some((s) => s.id === source.id) ? state.searchSources : [...state.searchSources, source],
    }));
  },
  closeOnboarding: () => set({ isOnboardingOpen: false }),
  openAboutModal: () => set({ isAboutModalOpen: true }),
  closeAboutModal: () => set({ isAboutModalOpen: false }),
  closeGapAnalysisModal: () => set({ isGapAnalysisModalOpen: false }),
  closeAnalysisModal: () => set({ isAnalysisModalOpen: false }),
  closeSynthesisModal: () => set({ isSynthesisModalOpen: false }),
  openDbFinder: () => set({ isDbFinderOpen: true }),
  closeDbFinder: () => set({ isDbFinderOpen: false }),
  closeSuggestionsModal: () => set({ isSuggestionsModalOpen: false }),
  uploadPdf: async (file) => {
    set({ isUploadingPdf: true, pdfUploadError: null });
    try {
      const { model } = get();
      const paper = await apiService.uploadPdf(file, model);
      set((state) => ({
        workspacePapers: [...state.workspacePapers, paper],
      }));
    } catch (err) {
      set({ pdfUploadError: err instanceof Error ? err.message : "An unknown error occurred." });
    } finally {
      set({ isUploadingPdf: false });
    }
  },
}));
