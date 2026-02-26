import type { AdvancedSearchOptions, ResearchPaper, SummaryLength, SummaryStyle, ModelDefinition, SearchSourceInfo, KnowledgeGraph, PaperAnalysis, SynthesisResult, ConnectedPaper } from '../types';
import * as validationService from './validationService';
import { createPaperId } from './extensionService';
import * as unpaywallService from './unpaywallService';
import * as openalexService from './openalexService';
import * as arxivService from './arxivService';
import * as geminiService from './geminiService';
import * as embeddingService from './embeddingService';
import { cosineSimilarity } from '../utils/math';
// FIX: Import batchEmbedText directly as it's not exported from embeddingService.
import { batchEmbedText } from '../utils/embeddings';
import * as crossrefService from './crossrefService';
import * as semanticScholarService from './semanticScholarService';

// --- HELPER FUNCTIONS MOVED FROM AGENT BACKEND ---

const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'what', 'when', 'where', 'who', 'how', 'which', 'what', 'is', 'the', 'impact', 'of', 'on']);

const calculateTitleMatchScore = (query: string, title: string): number => {
    if (!query || !title) return 0;
    const queryWords = query.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(word => word && !stopWords.has(word));
    const uniqueQueryWords = new Set(queryWords);
    if (uniqueQueryWords.size === 0) return 0;
    const titleLower = title.toLowerCase();
    let matchCount = 0;
    uniqueQueryWords.forEach(word => {
        if (titleLower.includes(word)) {
            matchCount++;
        }
    });
    return (matchCount / uniqueQueryWords.size) * 100;
};

function combineAndDeduplicateResults(allPapers: ResearchPaper[]): ResearchPaper[] {
    const paperGroups = new Map<string, ResearchPaper[]>();

    allPapers.forEach(paper => {
        const id = createPaperId(paper);
        if (!paperGroups.has(id)) {
            paperGroups.set(id, []);
        }
        paperGroups.get(id)!.push(paper);
    });

    const mergedPapers: ResearchPaper[] = [];

    paperGroups.forEach((papers, id) => {
        // Simple merge strategy: start with the first paper and fill in missing fields from others.
        // A more sophisticated strategy could prioritize sources (e.g., OpenAlex for citations, arXiv for PDF).
        const merged = papers.reduce((acc, current) => {
            return {
                ...acc,
                // Prioritize longer abstracts
                abstract: (current.abstract && current.abstract.length > (acc.abstract?.length || 0) && current.abstract !== 'No abstract available for this paper.') ? current.abstract : acc.abstract,
                // Prioritize available citations
                citations: current.citations ?? acc.citations,
                // Prioritize available PDF URLs
                pdfURL: current.pdfURL ?? acc.pdfURL,
                // Prioritize more specific source URLs
                sourceURL: current.sourceURL?.includes('doi.org') ? current.sourceURL : (acc.sourceURL || current.sourceURL),
                journal: current.journal ?? acc.journal,
                enrichmentSource: current.enrichmentSource ?? acc.enrichmentSource,
            };
        }, { ...papers[0], id }); // Start with the first paper as the base
        
        mergedPapers.push(merged);
    });

    return mergedPapers;
}

// Optimized centrality calculation using pre-computed norms and triangular matrix traversal
export function calculateCentrality(embeddings: number[][]): number[] {
    const n = embeddings.length;
    const sums = new Float64Array(n);
    const counts = new Int32Array(n);

    // Precompute norms
    const norms = new Float64Array(n);
    for (let i = 0; i < n; i++) {
        const vec = embeddings[i];
        if (vec && vec.length > 0) {
            let sumSq = 0;
            for (let k = 0; k < vec.length; k++) {
                sumSq += vec[k] * vec[k];
            }
            norms[i] = Math.sqrt(sumSq);
        } else {
            norms[i] = 0;
        }
    }

    for (let i = 0; i < n; i++) {
        const vecA = embeddings[i];
        const normA = norms[i];

        if (!vecA || vecA.length === 0 || normA === 0) continue;

        for (let j = i + 1; j < n; j++) {
            const vecB = embeddings[j];
            const normB = norms[j];

            if (!vecB || vecB.length === 0 || normB === 0) continue;

            // Dot product
            let dot = 0;
            const len = vecA.length;
            for (let k = 0; k < len; k++) {
                dot += vecA[k] * (vecB[k] || 0);
            }

            const sim = dot / (normA * normB);

            sums[i] += sim;
            counts[i]++;
            sums[j] += sim;
            counts[j]++;
        }
    }

    const result: number[] = [];
    for (let i = 0; i < n; i++) {
        const count = counts[i];

        if (norms[i] === 0) {
            result.push(0);
        } else {
            const avgSimilarity = count > 0 ? sums[i] / count : 0;
            result.push(((avgSimilarity + 1) / 2) * 100);
        }
    }

    return result;
}

async function calculatePaperScores(
    papers: ResearchPaper[],
    query: string,
    hypotheticalAnswer: string,
    model: ModelDefinition,
    options: AdvancedSearchOptions
): Promise<ResearchPaper[]> {
    if (papers.length === 0) return [];

    const semanticallyRankedPapers = await embeddingService.calculateSemanticScores(hypotheticalAnswer, papers);

    let processedPapers = semanticallyRankedPapers;

    // --- New Semantic Impact Score Calculation ---
    const papersWithAbstracts = processedPapers.filter(p => p.abstract && p.abstract.trim().length > 50);

    if (papersWithAbstracts.length > 1) {
        const abstracts = papersWithAbstracts.map(p => p.abstract);
        // FIX: Call batchEmbedText directly since it is not exported from embeddingService.
        const allPaperEmbeddings = await batchEmbedText(abstracts);

        const embeddingMap = new Map<string, number[]>();
        papersWithAbstracts.forEach((paper, index) => {
            embeddingMap.set(paper.id, allPaperEmbeddings[index]);
        });

        // Use optimized centrality calculation
        const centralityValues = calculateCentrality(allPaperEmbeddings);
        const centralityScores = new Map<string, number>();
        papersWithAbstracts.forEach((paper, index) => {
            centralityScores.set(paper.id, centralityValues[index]);
        });

        const currentYear = new Date().getFullYear();
        const papersWithCitationsPerYear = papersWithAbstracts.map(paper => {
            const age = Math.max(1, currentYear - paper.year);
            const citationsPerYear = (paper.citations || 0) / age;
            return { id: paper.id, citationsPerYear };
        });
        const maxCitationsPerYear = Math.max(...papersWithCitationsPerYear.map(p => p.citationsPerYear), 1);

        processedPapers = processedPapers.map(paper => {
            const centrality = centralityScores.get(paper.id) || 0;
            const cpyData = papersWithCitationsPerYear.find(p => p.id === paper.id);
            const citationImpact = cpyData ? (cpyData.citationsPerYear / maxCitationsPerYear) * 100 : 0;
            
            // New impactScore combines semantic centrality (how representative it is of the topic)
            // with citation velocity (how impactful it has been over time).
            const newImpactScore = (citationImpact * 0.6) + (centrality * 0.4);
            return { ...paper, impactScore: newImpactScore };
        });
    } else {
         // Fallback for single result or if no abstracts are available
        const currentYear = new Date().getFullYear();
        processedPapers = processedPapers.map(paper => {
            const age = Math.max(1, currentYear - paper.year);
            const citationsPerYear = (paper.citations || 0) / age;
            const impactScore = citationsPerYear > 0 ? 50 : 0; // Can't normalize with one item, give it a medium score.
            return { ...paper, impactScore };
        });
    }

    // The design classification is now handled asynchronously on the client-side
    // to improve perceived performance.
    let papersWithScreening = processedPapers;

    if (options.inclusionCriteria?.trim() || options.exclusionCriteria?.trim()) {
        const screeningPromises = papersWithScreening.map(p => 
            geminiService.evaluateScreeningFit(p, options.inclusionCriteria, options.exclusionCriteria, model)
        );
        const screeningResults = await Promise.all(screeningPromises);
        papersWithScreening = papersWithScreening.map((paper, index) => ({
            ...paper,
            screeningFitScore: screeningResults[index].score,
            screeningRationale: screeningResults[index].rationale,
        }));
    }
    
    const papersWithCombinedScore = papersWithScreening.map(paper => {
        const semanticScore = paper.semanticScore || 0;
        const impactScore = paper.impactScore || 0;
        const currentYear = new Date().getFullYear();
        const recencyScore = Math.max(0, 100 - ((currentYear - paper.year) * 5));
        const titleMatchScore = calculateTitleMatchScore(query, paper.title);

        const combinedScore = (semanticScore * 0.60) + (impactScore * 0.20) + (titleMatchScore * 0.15) + (recencyScore * 0.05);
        
        return { ...paper, combinedScore };
    });

    return papersWithCombinedScore.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));
}

// --- API SERVICE IMPLEMENTATION ---

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    model: ModelDefinition,
    sources: SearchSourceInfo[],
    page: number = 1
): Promise<{ papers: ResearchPaper[], summary: string, hasMore: boolean }> => {
    
    // Neuro-Symbolic Step: Parse the natural language query into structured filters.
    const parsedFilters = await geminiService.parseQueryToStructuredFilters(query, model);

    // Merge explicitly set options from the UI with the parsed filters. UI options take precedence.
    const finalOptions: AdvancedSearchOptions = {
        ...parsedFilters,
        ...options,
        startYear: options.startYear || parsedFilters.startYear?.toString() || '',
        endYear: options.endYear || parsedFilters.endYear?.toString() || '',
        authors: options.authors || parsedFilters.authors || '',
        excludeKeywords: options.excludeKeywords || parsedFilters.excludeKeywords || '',
        journal: options.journal || parsedFilters.journal || '',
        minCitations: options.minCitations || parsedFilters.minCitations?.toString() || '',
        isOpenAccess: options.isOpenAccess || parsedFilters.isOpenAccess || false,
    };

    const retrievalQuery = parsedFilters.core_search_query;
    const hypotheticalAnswer = await geminiService.generateHypotheticalAnswer(retrievalQuery, model);

    const searchPromises: Promise<ResearchPaper[]>[] = [];
    let openAlexHasMore = false; 

    // Add API-based searches
    if (sources.some(s => s.id === 'openalex')) {
        const promise = openalexService.searchOpenAlex(retrievalQuery, finalOptions, page).then(result => {
            openAlexHasMore = result.hasMore;
            return result.papers;
        });
        searchPromises.push(promise);
    }
    if (sources.some(s => s.id === 'arxiv')) {
        const promise = arxivService.searchArxiv(retrievalQuery, page).then(result => result.papers);
        searchPromises.push(promise);
    }

    // Add AI Grounded Search to run in parallel on the first page load.
    if (page === 1) {
        console.log("Running parallel AI Grounded Search.");
        const groundedSearchPromise = geminiService.findPapersWithGoogleSearch(query, model).then(foundPapers => 
            foundPapers.map(p => {
                const paperData: Omit<ResearchPaper, 'id'> = {
                    title: p.title,
                    authors: p.authors,
                    year: p.year,
                    abstract: p.abstract,
                    sourceURL: p.sourceURL,
                    pdfURL: undefined,
                    citations: undefined, 
                };
                return { ...paperData, id: createPaperId(paperData) };
            })
        ).catch(err => {
            console.warn("AI Grounded search failed, but other sources may succeed.", err);
            return []; // Return empty array on failure so other sources aren't blocked
        });
        searchPromises.push(groundedSearchPromise);
    }

    const allResults = await Promise.all(searchPromises);
    const allPapers = allResults.flat();
    
    if (allPapers.length === 0) {
        throw new Error("No academic papers were found for this query from any source. Please try a different query.");
    }
    
    // For pagination, we'll rely on the structured source (OpenAlex)
    const hasMore = openAlexHasMore;
    
    let papers = combineAndDeduplicateResults(allPapers);
    
    // --- Apply Manticore-inspired pre-filters before scoring ---
    if (finalOptions.titleKeywords) {
        const keywords = finalOptions.titleKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (keywords.length > 0) {
            papers = papers.filter(p => keywords.every(kw => p.title.toLowerCase().includes(kw)));
        }
    }
    if (finalOptions.abstractKeywords) {
        const keywords = finalOptions.abstractKeywords.split(',').map(k => k.trim().toLowerCase()).filter(Boolean);
        if (keywords.length > 0) {
            papers = papers.filter(p => keywords.every(kw => p.abstract.toLowerCase().includes(kw)));
        }
    }

    papers = await calculatePaperScores(papers, retrievalQuery, hypotheticalAnswer, model, finalOptions);

    const validationPromises = papers.map(async (p) => {
        const { validation, updatedPaperData } = await validationService.validatePaper(p);
        return {
            ...p,
            ...updatedPaperData,
            validation,
        };
    });

    let validatedPapers = await Promise.all(validationPromises);
    
    // Apply Open Access filter *after* validation, which discovers OA status
    if (finalOptions.isOpenAccess) {
        validatedPapers = validatedPapers.filter(p => p.validation?.checks.open_access);
    }

    const summary = page === 1 && validatedPapers.length > 0
        ? await geminiService.generateSummaryForPapers(validatedPapers.slice(0, 5), summaryLength, summaryStyle, model)
        : "";

    return { papers: validatedPapers, summary, hasMore };
};

export const searchByDoi = async (doi: string, model: ModelDefinition): Promise<ResearchPaper | null> => {
    // 1. Fetch primary metadata from a reliable source like OpenAlex.
    const paper = await openalexService.searchOpenAlexByDoi(doi);

    if (!paper) {
        return null;
    }

    // 2. We have a paper object. Now, enrich and validate it.
    const { validation, updatedPaperData } = await validationService.validatePaper(paper);

    const validatedPaper: ResearchPaper = {
        ...paper,
        ...updatedPaperData,
        validation,
    };

    // 3. Semantic scores are not applicable for a direct DOI lookup.
    // Set a high relevance score to ensure it appears correctly.
    validatedPaper.combinedScore = 100;
    validatedPaper.semanticScore = 100;
    
    validatedPaper.impactScore = undefined;

    return validatedPaper;
};


export const generateSearchSuggestions = async (query: string, model: ModelDefinition): Promise<string[]> => {
    return await geminiService.generateSearchSuggestions(query, model);
};

export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    return await geminiService.analyzeResearchGaps(papers, model);
};

export const analyzeSinglePaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<PaperAnalysis> => {
    return await geminiService.analyzeSinglePaper(paper, model);
};

export const extractKeyConcepts = async (abstract: string, model: ModelDefinition): Promise<string[]> => {
    return await geminiService.extractKeyConcepts(abstract, model);
};

export const extractKnowledgeGraph = async (abstract: string, model: ModelDefinition): Promise<KnowledgeGraph> => {
    return await geminiService.extractKnowledgeGraph(abstract, model);
};

export const synthesizePapers = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    return await geminiService.synthesizePapers(papers, model);
};

export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    return await unpaywallService.findOpenAccessPdf(doi);
};

export const fetchMetadataByDOI = async (doi: string): Promise<ResearchPaper | null> => {
    return await openalexService.searchOpenAlexByDoi(doi);
};

export const findDoiForPaper = async (paper: ResearchPaper): Promise<string | null> => {
    return await crossrefService.findDoiForPaper(paper);
};

export const rerankForScreening = async (
    included: ResearchPaper[],
    excluded: ResearchPaper[],
    unscreened: ResearchPaper[],
    model: ModelDefinition
): Promise<{ paperId: string, score: number, rationale: string }[]> => {
    if (unscreened.length === 0) return [];
    
    const rerankingPromises = unscreened.map(async (paper) => {
        const result = await geminiService.rerankByScreeningExample(included, excluded, paper, model);
        return {
            paperId: paper.id,
            score: result.score,
            rationale: result.rationale,
        };
    });

    return await Promise.all(rerankingPromises);
};

export const generateSuggestions = async (paper: ResearchPaper, model: ModelDefinition): Promise<string[]> => {
    return await geminiService.generatePaperBasedSuggestions(paper, model);
};

export const findConnectedPapers = async (paper: ResearchPaper, model: ModelDefinition): Promise<ConnectedPaper[]> => {
    if (!paper.doi) {
        // Fallback to the original Gemini-based method if there's no DOI
        console.log("No DOI for connected papers, falling back to AI search.");
        return await geminiService.findConnectedPapers(paper, model);
    }

    try {
        const { references, citations } = await semanticScholarService.getCitationGraph(paper.doi);
        
        // Combine them into a single list for the modal, the `connection` field will distinguish them
        return [...citations, ...references];

    } catch (error) {
        console.error("Failed to get citation graph, falling back to AI search.", error);
        // Fallback to Gemini if the new service fails
        return await geminiService.findConnectedPapers(paper, model);
    }
};

export const classifyStudyDesign = async (paper: ResearchPaper, model: ModelDefinition): Promise<string> => {
    return await geminiService.classifyStudyDesign(paper, model);
};
