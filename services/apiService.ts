import type { AdvancedSearchOptions, ResearchPaper, SummaryLength, SummaryStyle, ModelDefinition, SearchSourceInfo, KnowledgeGraph, PaperAnalysis, SynthesisResult } from '../types';
import * as validationService from './validationService';
import { createPaperId } from './extensionService';
import * as unpaywallService from './unpaywallService';
import * as openalexService from './openalexService';
import * as arxivService from './arxivService';
import * as geminiService from './geminiService';
import * as embeddingService from './embeddingService';

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

async function combineArxivAndOpenAlexResults(allPapers: ResearchPaper[]): Promise<ResearchPaper[]> {
    const uniquePapersMap = new Map<string, ResearchPaper>();
    allPapers.forEach(paper => {
        // Use createPaperId for robust de-duplication
        const id = createPaperId(paper);
        const existingPaper = uniquePapersMap.get(id);
        // Prioritize arXiv entries if they exist, as they are often more complete
        if (!existingPaper || paper.enrichmentSource === 'arXiv') {
            uniquePapersMap.set(id, { ...paper, id });
        }
    });
    return Array.from(uniquePapersMap.values());
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

    let papersWithStudyDesign = semanticallyRankedPapers;
    if (options.studyDesign && options.studyDesign !== 'any') {
        const designClassificationPromises = semanticallyRankedPapers.map(async (paper) => {
            const design = await geminiService.classifyStudyDesign(paper, model);
            return { ...paper, detectedStudyDesign: design };
        });
        papersWithStudyDesign = await Promise.all(designClassificationPromises);
    }

    let papersWithScreening = papersWithStudyDesign;
    if (options.inclusionCriteria?.trim() || options.exclusionCriteria?.trim()) {
        const screeningPromises = papersWithStudyDesign.map(p => 
            geminiService.evaluateScreeningFit(p, options.inclusionCriteria, options.exclusionCriteria, model)
        );
        const screeningResults = await Promise.all(screeningPromises);
        papersWithScreening = papersWithStudyDesign.map((paper, index) => ({
            ...paper,
            screeningFitScore: screeningResults[index].score,
            screeningRationale: screeningResults[index].rationale,
        }));
    }
    
    const currentYear = new Date().getFullYear();
    const maxCitations = Math.max(...papersWithScreening.map(p => p.citations || 0), 1);

    const papersWithCombinedScore = papersWithScreening.map(paper => {
        const semanticScore = paper.semanticScore || 0;
        const normalizedCitations = Math.log10((paper.citations || 0) + 1);
        const maxNormalizedCitations = Math.log10(maxCitations + 1);
        const impactScore = maxNormalizedCitations > 0 ? (normalizedCitations / maxNormalizedCitations) * 100 : 0;
        const age = currentYear - paper.year;
        const recencyScore = Math.max(0, 100 - (age * 5));
        const titleMatchScore = calculateTitleMatchScore(query, paper.title);

        const combinedScore = (semanticScore * 0.5) + (impactScore * 0.2) + (recencyScore * 0.15) + (titleMatchScore * 0.15);
        
        return { ...paper, impactScore, combinedScore };
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
    
    const hypotheticalAnswer = await geminiService.generateHypotheticalAnswer(query, model);
    
    const searchPromises: Promise<{ papers: ResearchPaper[], hasMore: boolean }>[] = [];
    if (sources.some(s => s.id === 'openalex')) {
        searchPromises.push(openalexService.searchOpenAlex(query, options, page));
    }
    if (sources.some(s => s.id === 'arxiv')) {
        searchPromises.push(arxivService.searchArxiv(query, page));
    }

    const searchResults = await Promise.all(searchPromises);
    const allPapers = searchResults.flatMap(r => r.papers);
    const hasMore = searchResults.some(r => r.hasMore);
    
    let papers = await combineArxivAndOpenAlexResults(allPapers);
    papers = await calculatePaperScores(papers, query, hypotheticalAnswer, model, options);

    const validationPromises = papers.map(async (p) => {
        const { validation, updatedPaperData } = await validationService.validatePaper(p);
        return {
            ...p,
            ...updatedPaperData,
            validation,
        };
    });

    const validatedPapers = await Promise.all(validationPromises);

    const summary = page === 1 
        ? await geminiService.generateSummaryForPapers(validatedPapers.slice(0, 5), summaryLength, summaryStyle, model)
        : "";

    return { papers: validatedPapers, summary, hasMore };
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
