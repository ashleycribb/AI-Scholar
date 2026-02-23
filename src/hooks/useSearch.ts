import { useState, useEffect, useMemo } from 'react';
import type { ResearchPaper, ModelDefinition, SummaryLength, SummaryStyle, SortConfig, AnalysisResult, SearchSourceInfo, AdvancedSearchOptions, SortKey } from '@/types';
import * as apiService from '@/services/apiService';
import * as analysisService from '@/services/analysisService';
import { AVAILABLE_MODELS } from '@/src/constants';

export const useSearch = (
    onPaperUpdate?: (paperId: string, updates: Partial<ResearchPaper>) => void
) => {
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
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
    const [isScreeningMode, setIsScreeningMode] = useState(false);
    const [isReranking, setIsReranking] = useState(false);
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

    const updatePaperState = (paperId: string, updates: Partial<ResearchPaper>) => {
        const updater = (p: ResearchPaper) => p.id === paperId ? { ...p, ...updates } : p;
        setPapers(prev => prev.map(updater));

        // Notify parent to sync with other lists (e.g. workspace)
        onPaperUpdate?.(paperId, updates);

        if (selectedPaper?.id === paperId) {
            setSelectedPaper(prev => prev ? { ...prev, ...updates } : null);
        }
    };

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

    // Asynchronously classify study designs for new papers without blocking the UI
    useEffect(() => {
        const papersToClassify = papers.filter(p => p.detectedStudyDesign === undefined);

        if (papersToClassify.length > 0) {
            // Mark papers as "classification in progress" to avoid re-triggering on re-renders.
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
        updatePaperState(paperId, { screeningStatus: status });
    };

    const handleAiRerank = async (workspacePapers: ResearchPaper[]) => {
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

    const handleAddSource = (source: SearchSourceInfo) => {
        setSearchSources(prev => {
            if (!prev.some(s => s.id === source.id)) {
                return [...prev, source];
            }
            return prev;
        });
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

    return {
        query, setQuery,
        model, setModel,
        papers, setPapers,
        isLoading, error,
        summaryLength, setSummaryLength,
        summaryStyle, setSummaryStyle,
        hasSearched, setHasSearched,
        sortConfig, setSortConfig,
        selectedPaper, setSelectedPaper,
        analysis, setAnalysis,
        refinedQueries, setRefinedQueries,
        isScreeningMode, setIsScreeningMode,
        isReranking,
        searchSources, setSearchSources,
        searchSuggestions, isGeneratingSearchSuggestions,
        summary,
        currentPage,
        isLoadingMore,
        hasMore,
        lastUsedOptions,

        sortedPapers,

        handleSearch,
        handleSuggestionSearch,
        handleLoadMore,
        handleSelectPaper,
        handleSortChange,
        handleSetScreeningMode,
        handleScreenPaper,
        handleAiRerank,
        handleAddSource,
        updatePaperState,
    };
};
