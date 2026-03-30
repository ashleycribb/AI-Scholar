import { useState, useEffect, useMemo } from 'react';
import type {
    ResearchPaper,
    SummaryLength,
    SummaryStyle,
    AdvancedSearchOptions,
    AnalysisResult,
    SortConfig,
    SortKey,
    ModelDefinition,
    SearchSourceInfo
} from '../types';
import * as apiService from '../services/apiService';
import * as analysisService from '../services/analysisService';

export const useSearch = (
    model: ModelDefinition,
    onSearchStart?: () => void
) => {
    const [query, setQuery] = useState('');
    const [papers, setPapers] = useState<ResearchPaper[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
    const [summaryStyle, setSummaryStyle] = useState<SummaryStyle>('paragraph');
    const [hasSearched, setHasSearched] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'relevance', direction: 'desc' });
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [refinedQueries, setRefinedQueries] = useState<string[]>([]);
    const [isScreeningMode, setIsScreeningMode] = useState(false);
    const [isReranking, setIsReranking] = useState(false);
    const [searchSources, setSearchSources] = useState<SearchSourceInfo[]>([{ id: 'openalex', name: 'OpenAlex', description: 'A comprehensive open index of scholarly works.' }]);
    const [justFoundDoiPaper, setJustFoundDoiPaper] = useState<ResearchPaper | null>(null);

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

        // Notify start of search
        if (onSearchStart) {
            onSearchStart();
        }

        const doiRegex = /^10.\d{4,9}\/[-._;()/:A-Z0-9]+$/i;
        const isDoiSearch = doiRegex.test(searchQuery.trim());

        setSearchSuggestions([]);
        setIsGeneratingSearchSuggestions(false);
        setIsLoading(true);
        setError(null);
        setPapers([]);
        setSummary('');
        setHasSearched(true);
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
                    setJustFoundDoiPaper(result);
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

    const handleAiRerank = async (workspacePapers: ResearchPaper[]) => { // Need workspacePapers for context
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

    const handleSuggestionClick = (newQuery: string) => {
        setQuery(newQuery);
        handleSearch(newQuery, lastUsedOptions);
    };

    const handleConceptSearch = (concept: string) => {
        const currentQuery = query;
        setQuery(concept);
        handleSearch(concept, { ...lastUsedOptions, inclusionCriteria: `"${concept}" OR "${currentQuery}"` });
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
        papers, setPapers,
        isLoading, setIsLoading,
        error, setError,
        summaryLength, setSummaryLength,
        summaryStyle, setSummaryStyle,
        hasSearched, setHasSearched,
        sortConfig, setSortConfig,
        analysis, setAnalysis,
        refinedQueries, setRefinedQueries,
        isScreeningMode, setIsScreeningMode,
        isReranking, setIsReranking,
        searchSources, setSearchSources,
        searchSuggestions, setSearchSuggestions,
        isGeneratingSearchSuggestions, setIsGeneratingSearchSuggestions,
        summary, setSummary,
        currentPage, setCurrentPage,
        isLoadingMore, setIsLoadingMore,
        hasMore, setHasMore,
        lastUsedOptions, setLastUsedOptions,
        handleSearch,
        handleSuggestionSearch,
        handleLoadMore,
        handleSortChange,
        handleSetScreeningMode,
        handleScreenPaper,
        handleAiRerank,
        handleSuggestionClick,
        handleConceptSearch,
        handleAddSource,
        sortedPapers,
        justFoundDoiPaper, setJustFoundDoiPaper
    };
};
