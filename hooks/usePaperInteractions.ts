import { useState, useEffect } from 'react';
import type {
    ResearchPaper,
    PaperAnalysis,
    SynthesisResult,
    SuggestionsResult,
    ConnectedPaper,
    VerificationResult,
    ModelDefinition
} from '../types';
import * as apiService from '../services/apiService';
import { analyticsService } from '../services/analyticsService';

export const usePaperInteractions = (
    papers: ResearchPaper[],
    setPapers: React.Dispatch<React.SetStateAction<ResearchPaper[]>>,
    workspacePapers: ResearchPaper[],
    setWorkspacePapers: React.Dispatch<React.SetStateAction<ResearchPaper[]>>,
    selectedPaper: ResearchPaper | null,
    setSelectedPaper: React.Dispatch<React.SetStateAction<ResearchPaper | null>>,
    model: ModelDefinition,
    onRemoveFromProjects?: (paperId: string) => void
) => {
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
    }, [papers, model]); // Note: Depends on papers. When papers are updated, this runs.
                         // Need to be careful about infinite loops if updates trigger re-renders that change 'papers'.
                         // 'papers' reference changes on every update.
                         // But we filter by undefined. If we set it to '...', it won't be undefined next time.
                         // So it should be fine.

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
                if (onRemoveFromProjects) {
                    onRemoveFromProjects(paper.id);
                }
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

    const handleAnalyzeGaps = async (papersToAnalyze: ResearchPaper[], modelOverride?: ModelDefinition) => {
        analyticsService.logEvent('tool_used', { tool: 'analyze_gaps', paperCount: papersToAnalyze.length });
        setIsGapAnalysisModalOpen(true);
        setIsAnalyzingGaps(true);
        setGapAnalysisError(null);
        setGapAnalysisResult(null);

        try {
            const result = await apiService.analyzeGaps(papersToAnalyze, modelOverride || model);
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

    const handleSynthesizeWorkspace = async (papersToSynthesize: ResearchPaper[], modelOverride?: ModelDefinition) => {
        analyticsService.logEvent('tool_used', { tool: 'synthesize_workspace', paperCount: papersToSynthesize.length });
        setIsSynthesisModalOpen(true);
        setIsSynthesizing(true);
        setSynthesisError(null);
        setSynthesisResult(null);
        try {
            const result = await apiService.synthesizePapers(papersToSynthesize, modelOverride || model);
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

        updatePaperState,
        handleSelectPaper,
        handleToggleWorkspacePaper,
        handleOpenVerificationModal,
        handleVerificationComplete,
        handleAnalyzeGaps,
        handleAnalyzePaper,
        handleSaveAnalysis,
        handleOpenCitationModal,
        handleGenerateSuggestions,
        handleFindDoi,
        handleFindConnectedPapers,
        handleSynthesizeWorkspace
    };
};
