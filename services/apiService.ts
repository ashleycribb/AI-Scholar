import type { AdvancedSearchOptions, AnalysisResult, PaperAnalysis, ResearchPaper, SummaryLength, SummaryStyle, SynthesisResult, ModelDefinition, AuthorFrequencyData, SearchSourceInfo } from '../types';
import * as openAlexService from './openalexService'; // Keep for now for non-AI specific parts if agent doesn't fully replace
import * as arxivService from './arxivService'; // Keep for now for non-AI specific parts if agent doesn't fully replace
import * as validationService from './validationService'; // This is a client-side utility
import * as embeddingService from './embeddingService'; // This is a client-side utility
import { createPaperId } from './extensionService';
import * as unpaywallService from './unpaywallService'; // Keep for now for direct calls

// New Agent Backend URL
const AGENT_BACKEND_URL = 'http://localhost:3002/api/agents';

// Helper for making requests to the new agent backend
const callAgentBackend = async (intent: string, payload: any, onProgress?: (message: string) => void): Promise<any> => {
    if (onProgress) onProgress(`Sending request to AI agent: ${intent}...`);
    try {
        const response = await fetch(AGENT_BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ intent, payload }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Agent backend failed with unknown error (Status: ${response.status}).` }));
            throw new Error(errorData.error || `Agent backend failed with status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error calling agent backend for intent '${intent}':`, error);
        if (error instanceof TypeError) {
            throw new Error(`Could not connect to the AI agent backend. Please ensure the backend server is running and accessible at ${AGENT_BACKEND_URL}.`);
        }
        throw error;
    }
};

// A set of common English stop words.
const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'what', 'when', 'where', 'who', 'how', 'which', 'what', 'is', 'the', 'impact', 'of', 'on']);

const calculateTitleMatchScore = (query: string, title: string): number => {
    if (!query || !title) return 0;

    const queryWords = query.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word && !stopWords.has(word));
    
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


export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    model: ModelDefinition,
    onProgress: (message: string) => void,
    sources: SearchSourceInfo[] // Renamed 'sources' to 'searchSources' for clarity and to match agent call
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    onProgress('Initiating AI search...');
    // Fix: Passed 'sources' as 'searchSources' to match the payload expectation.
    const agentPayload = { query, options, summaryLength, summaryStyle, model, searchSources: sources };
    const agentResponse = await callAgentBackend('search', agentPayload, onProgress);
    
    let papers = agentResponse.papers as ResearchPaper[];
    const summary = agentResponse.summary as string;

    // Frontend-specific post-processing that the agent might not handle directly
    onProgress('Enriching paper data (client-side)...');
    const enrichedPapers = await Promise.all(
        papers.map(async (paper) => {
            if (paper.enrichmentSource !== 'arXiv') {
                 const enrichedData = await arxivService.enrichFromArxiv(paper);
                 return enrichedData ? { ...paper, ...enrichedData } : paper;
            }
            return paper;
        })
    );
    
    const papersWithIds = enrichedPapers.map(p => ({ ...p, id: createPaperId(p) }));

    onProgress('Calculating semantic relevance (client-side)...');
    // We still do semantic ranking on the client for now, as the embedding model might be different
    // or to keep embedding calls off the agent for high volume.
    const hypotheticalAnswer = await callAgentBackend('generateHypotheticalAnswer', { userQuery: query, model }, onProgress);

    const semanticallyRankedPapers = await embeddingService.calculateSemanticScores(hypotheticalAnswer, papersWithIds);
    
    // Recalculate combined scores with all client-side enriched data
    onProgress('Calculating final relevance scores (client-side)...');
    const maxCitations = Math.max(...semanticallyRankedPapers.map(p => p.citations || 0), 1);
    const currentYear = new Date().getFullYear();
    
    // Simplified author and journal metrics calculation, assuming `topAuthors` from agent.
    // If agent provides raw authorFreq, we can use that. For now, re-derive.
    const authorFreq = Object.values(
        semanticallyRankedPapers.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
            if (author) {
                // Fix: Corrected property name to 'totalCitations' to match the interface.
                acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                acc[author].count++;
                const paper = semanticallyRankedPapers.find(p => p.authors.includes(author)); // find first paper by this author
                acc[author].totalCitations += paper?.citations || 0; // sum citations from a paper the author is on
            }
            return acc;
        }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
    );
    // Fix: Corrected property name to 'totalCitations' to match the interface.
    const authorCitationMap = new Map(authorFreq.map(a => [a.author, a.totalCitations]));
    const maxAuthorCitations = Math.max(...Array.from(authorCitationMap.values()), 1);

    const journalStats = new Map<string, { totalCitations: number, count: number }>();
    semanticallyRankedPapers.forEach(p => {
        if (p.journal) {
            const stats = journalStats.get(p.journal) || { totalCitations: 0, count: 0 };
            stats.totalCitations += p.citations || 0;
            stats.count++;
            journalStats.set(p.journal, stats);
        }
    });
    const journalAvgCitations = new Map<string, number>();
    journalStats.forEach((stats, journal) => {
        journalAvgCitations.set(journal, stats.totalCitations / stats.count);
    });
    const maxAvgJournalCitations = Math.max(...Array.from(journalAvgCitations.values()), 1);

    const papersWithCombinedScore = semanticallyRankedPapers.map(paper => {
        const semanticScore = paper.semanticScore || 0;
        const normalizedCitations = Math.log10((paper.citations || 0) + 1);
        const maxNormalizedCitations = Math.log10(maxCitations + 1);
        const impactScore = maxNormalizedCitations > 0 ? (normalizedCitations / maxNormalizedCitations) * 100 : 0;
        const age = currentYear - paper.year;
        const recencyScore = Math.max(0, 100 - (age * 5));
        const titleMatchScore = calculateTitleMatchScore(query, paper.title);

        const firstAuthor = paper.authors.split(',')[0].trim();
        const authorCitations = authorCitationMap.get(firstAuthor) || 0;
        const normalizedAuthorCitations = Math.log10(authorCitations + 1);
        const maxNormalizedAuthorCitations = Math.log10(maxAuthorCitations + 1);
        const authorAuthorityScore = maxNormalizedAuthorCitations > 0 ? (normalizedAuthorCitations / maxNormalizedAuthorCitations) * 100 : 0;
        
        const journalAvg = journalAvgCitations.get(paper.journal || '') || 0;
        const journalImpactScore = (journalAvg / maxAvgJournalCitations) * 100;
        const trustScore = (authorAuthorityScore * 0.5) + (journalImpactScore * 0.5);

        const combinedScore =
            (semanticScore * 0.40) +   // 40%
            (impactScore * 0.15) +     // 15%
            (recencyScore * 0.15) +    // 15%
            (trustScore * 0.20) +      // 20%
            (titleMatchScore * 0.10);  // 10%
        
        return { ...paper, impactScore, combinedScore };
    });

    const rankedPapers = papersWithCombinedScore.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

    // Get top authors for analysis after all papers are scored (client-side)
    // Fix: The inferred type of `authorFreq` matches `AuthorFrequencyData`, so direct assignment is now correct.
    const topAuthors: AuthorFrequencyData = authorFreq.sort((a,b) => b.count - a.count).slice(0, 10);
    
    // Client-side analysis
    const analysisService = await import('./analysisService');
    const analysisResult = await analysisService.analyzePapers(rankedPapers, topAuthors);

    // Client-side validation
    onProgress('Validating papers (client-side)...');
    const validationResponses = await Promise.all(rankedPapers.map(p => validationService.validatePaper(p)));
    const validatedPapers = rankedPapers.map((paper, index) => ({
        ...paper,
        ...validationResponses[index].updatedPaperData,
        validation: validationResponses[index].validation,
    }));


    return { papers: validatedPapers, summary, analysis: analysisResult };
};

export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    return await callAgentBackend('analyzeGaps', { papers, model });
};

export const analyzeSinglePaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<PaperAnalysis> => {
    return await callAgentBackend('analyzeSinglePaper', { paper, model });
};

export const extractKeyConcepts = async (abstract: string, model: ModelDefinition): Promise<string[]> => {
    return await callAgentBackend('extractKeyConcepts', { abstract, model });
};

export const synthesizePapers = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    return await callAgentBackend('synthesizePapers', { papers, model });
};

export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    // This is still a direct service call, consider if it should go through agent.
    return await unpaywallService.findOpenAccessPdf(doi);
};

export const fetchMetadataByDOI = async (doi: string): Promise<ResearchPaper | null> => {
    // This is still a direct service call, consider if it should go through agent.
    return await openAlexService.searchOpenAlexByDoi(doi);
};

export const rerankForScreening = async (
    included: ResearchPaper[],
    excluded: ResearchPaper[],
    unscreened: ResearchPaper[],
    model: ModelDefinition
): Promise<{ paperId: string, score: number, rationale: string }[]> => {
    if (unscreened.length === 0) return [];

    // The agent call for reranking is designed to handle a batch of unscreened papers.
    // Each paper's reranking is an independent tool call within the agent.
    const agentPayload = { included, excluded, unscreened, model };
    const rerankedResults = await callAgentBackend('rerankForScreening', agentPayload);
    return rerankedResults;
};

export const generateSuggestions = async (paper: ResearchPaper, model: ModelDefinition): Promise<string[]> => {
    return await callAgentBackend('generateSuggestions', { paper, model });
};