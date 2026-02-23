import { useState } from 'react';
import type { ResearchPaper, PaperAnalysis, SynthesisResult, SuggestionsResult, ConnectedPaper, ModelDefinition, VerificationResult } from '../../types';
import * as apiService from '../../services/apiService';
import { analyticsService } from '../../services/analyticsService';

interface PapersData {
    papers: ResearchPaper[];
    setPapers: React.Dispatch<React.SetStateAction<ResearchPaper[]>>;
    workspacePapers: ResearchPaper[];
    setWorkspacePapers: React.Dispatch<React.SetStateAction<ResearchPaper[]>>;
    selectedPaper: ResearchPaper | null;
    setSelectedPaper: React.Dispatch<React.SetStateAction<ResearchPaper | null>>;
    updatePaperState: (paperId: string, updates: Partial<ResearchPaper>) => void;
}

interface SearchData {
    query: string;
    setQuery: React.Dispatch<React.SetStateAction<string>>;
    handleSearch: (query: string, options: any) => Promise<void>;
    lastUsedOptions: any;
}

export const usePaperInteractions = (model: ModelDefinition, papersData: PapersData, searchData: SearchData) => {
    const { papers, setPapers, workspacePapers, setWorkspacePapers, selectedPaper, setSelectedPaper, updatePaperState } = papersData;
    const { query, setQuery, handleSearch, lastUsedOptions } = searchData;

    // Modals State
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
    const [paperToVerify, setPaperToVerify] = useState<ResearchPaper | null>(null);
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

    // Handlers
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

    return {
        isVerificationModalOpen, setIsVerificationModalOpen,
        paperToVerify, setPaperToVerify,
        isGapAnalysisModalOpen, setIsGapAnalysisModalOpen,
        isAnalyzingGaps, setIsAnalyzingGaps,
        gapAnalysisResult, setGapAnalysisResult,
        gapAnalysisError, setGapAnalysisError,
        isAnalysisModalOpen, setIsAnalysisModalOpen,
        isAnalyzingPaper, setIsAnalyzingPaper,
        analysisError, setAnalysisError,
        analysisResult, setAnalysisResult,
        isSynthesisModalOpen, setIsSynthesisModalOpen,
        isSynthesizing, setIsSynthesizing,
        synthesisResult, setSynthesisResult,
        synthesisError, setSynthesisError,
        isCitationModalOpen, setIsCitationModalOpen,
        paperForCitation, setPaperForCitation,
        isDbFinderOpen, setIsDbFinderOpen,
        isSuggestionsModalOpen, setIsSuggestionsModalOpen,
        suggestionsResult, setSuggestionsResult,
        isGeneratingSuggestions, setIsGeneratingSuggestions,
        suggestionsError, setSuggestionsError,
        isConnectionsModalOpen, setIsConnectionsModalOpen,
        connectionsResult, setConnectionsResult,
        isFindingConnections, setIsFindingConnections,
        connectionsError, setConnectionsError,

        handleOpenVerificationModal,
        handleVerificationComplete,
        handleAnalyzeGaps,
        handleAnalyzePaper,
        handleSaveAnalysis,
        handleConceptSearch,
        handleOpenCitationModal,
        handleGenerateSuggestions,
        handleSuggestionClick,
        handleFindDoi,
        handleFindConnectedPapers,
        handleSynthesizeWorkspace
    };
};
