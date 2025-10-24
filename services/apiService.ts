
import type { AdvancedSearchOptions, AnalysisResult, ResearchPaper, SummaryLength, SummaryStyle } from '../types';
import * as openAlexService from './openalexService';
import * as arxivService from './arxivService';
import * as validationService from './validationService';
import * as embeddingService from './embeddingService';
import { generateSummaryForPapers } from './geminiService';
import { analyzePapers } from './analysisService';
import { createPaperId } from './extensionService';

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    onProgress: (message: string) => void
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    onProgress('Fetching candidates...');
    const initialPapers = await openAlexService.searchOpenAlex(query, options);

    if (initialPapers.length === 0) {
        return { papers: [], summary: 'No results found for your query. Please try different keywords or broaden your search criteria.', analysis: null };
    }

    onProgress('Enriching paper data...');
    // Data Enrichment Step:
    const enrichedPapers = await Promise.all(
        initialPapers.map(async (paper) => {
            const enrichedData = await arxivService.enrichFromArxiv(paper);
            return enrichedData ? { ...paper, ...enrichedData } : paper;
        })
    );
    
    const papersWithIds = enrichedPapers.map(p => ({ ...p, id: createPaperId(p) }));
    
    let rankedPapers = papersWithIds;

    // Semantic Re-ranking Step
    if (options.searchMode === 'semantic') {
        onProgress('Calculating semantic relevance...');
        rankedPapers = await embeddingService.calculateSemanticScores(query, papersWithIds);
    }

    onProgress('Validating papers and generating analysis...');
    // Run summary, analysis, and validation in parallel
    const [summary, analysis, validationResponses] = await Promise.all([
        generateSummaryForPapers(rankedPapers, summaryLength, summaryStyle),
        analyzePapers(rankedPapers),
        Promise.all(rankedPapers.map(p => validationService.validatePaper(p)))
    ]);
    
    const validatedPapers = rankedPapers.map((paper, index) => ({
        ...paper,
        ...validationResponses[index].updatedPaperData,
        validation: validationResponses[index].validation,
    }));

    return { papers: validatedPapers, summary, analysis };
};