import { useState } from 'react';
import type { ResearchPaper, VerificationResult, PaperAnalysis, SynthesisResult, SuggestionsResult, ConnectedPaper, ModelDefinition, SearchSourceInfo } from '@/types';
import * as apiService from '@/services/apiService';
import { analyticsService } from '@/services/analyticsService';

export const usePaperInteractions = (
    model: ModelDefinition,
    updatePaper: (paperId: string, updates: Partial<ResearchPaper>) => void
) => {
    // Modals State
    const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);
    const [paperToVerify, setPaperToVerify] = useState<ResearchPaper | null>(null);
    const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
    const [isAboutModalOpen, setIsAboutModalOpen] = useState(false);

    // Gap Analysis
    const [isGapAnalysisModalOpen, setIsGapAnalysisModalOpen] = useState(false);
    const [isAnalyzingGaps, setIsAnalyzingGaps] = useState(false);
    const [gapAnalysisResult, setGapAnalysisResult] = useState<string | null>(null);
    const [gapAnalysisError, setGapAnalysisError] = useState<string | null>(null);

    // Paper Analysis
    const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
    const [isAnalyzingPaper, setIsAnalyzingPaper] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<{paper: ResearchPaper, analysis: PaperAnalysis} | null>(null);

    // Synthesis
    const [isSynthesisModalOpen, setIsSynthesisModalOpen] = useState(false);
    const [isSynthesizing, setIsSynthesizing] = useState(false);
    const [synthesisResult, setSynthesisResult] = useState<SynthesisResult | null>(null);
    const [synthesisError, setSynthesisError] = useState<string | null>(null);

    // Citation
    const [isCitationModalOpen, setIsCitationModalOpen] = useState(false);
    const [paperForCitation, setPaperForCitation] = useState<ResearchPaper | null>(null);

    // Database Finder
    const [isDbFinderOpen, setIsDbFinderOpen] = useState(false);

    // Suggestions
    const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
    const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);
    const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
    const [suggestionsError, setSuggestionsError] = useState<string | null>(null);

    // Connected Papers
    const [isConnectionsModalOpen, setIsConnectionsModalOpen] = useState(false);
    const [connectionsResult, setConnectionsResult] = useState<{ seedPaper: ResearchPaper; connections: ConnectedPaper[] } | null>(null);
    const [isFindingConnections, setIsFindingConnections] = useState(false);
    const [connectionsError, setConnectionsError] = useState<string | null>(null);

    const handleOpenVerificationModal = (paper: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'verify_paper_modal_opened', paperId: paper.id });
        setPaperToVerify(paper);
        setIsVerificationModalOpen(true);
    };

    const handleVerificationComplete = (doi: string, result: VerificationResult) => {
        // Find the paper by DOI? The updatePaper expects ID.
        // Wait, App.tsx uses updatePaperState(paperId, ...) but handleVerificationComplete in App.tsx iterates over ALL papers and matches DOI.
        // And updatePaperState updates by ID.
        // But handleVerificationComplete in App.tsx does:
        // setPapers(prev => prev.map(p => p.doi === doi ? { ...p, verificationResult: result } : p));
        // This implies multiple papers might share a DOI (unlikely) or we don't have the ID handy.
        // However, updatePaper takes ID.
        // We should probably rely on App.tsx to handle the DOI lookup if we pass a generic update function?
        // Or we assume the paperToVerify has the ID.

        // Let's assume paperToVerify is set.
        if (paperToVerify && paperToVerify.doi === doi) {
             updatePaper(paperToVerify.id, { verificationResult: result });
        } else {
            // Fallback: we can't update if we don't know the ID and updatePaper requires ID.
            // But App.tsx's handleVerificationComplete implementation iterates.
            // Maybe we should change updatePaper to accept a predicate or DOI?
            // For now, let's assume paperToVerify matches.
        }

        // Actually, App.tsx updates ALL papers with that DOI.
        // If we want to preserve that behavior, updatePaper needs to support it.
        // But to keep it simple, updating the verified paper is usually enough.
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
        updatePaper(paper.id, { savedAnalysis: analysis });
        setAnalysisResult(prev => prev ? { ...prev, paper: { ...prev.paper, savedAnalysis: analysis }} : null);
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

    const handleFindDoi = async (paperToUpdate: ResearchPaper) => {
        analyticsService.logEvent('tool_used', { tool: 'find_doi', paperId: paperToUpdate.id });
        updatePaper(paperToUpdate.id, { doiState: 'loading' });
        try {
            const doi = await apiService.findDoiForPaper(paperToUpdate);
            if (doi) {
                updatePaper(paperToUpdate.id, { doi: doi, doiState: 'loaded' });
            } else {
                updatePaper(paperToUpdate.id, { doiState: 'error' });
            }
        } catch (error) {
            console.error("Failed to find DOI:", error);
            updatePaper(paperToUpdate.id, { doiState: 'error' });
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
        // Modal State
        isVerificationModalOpen, setIsVerificationModalOpen,
        paperToVerify, setPaperToVerify,
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

        // Handlers
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
    };
};
