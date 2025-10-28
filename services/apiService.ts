

import type { AdvancedSearchOptions, AnalysisResult, ResearchPaper, SummaryLength, SummaryStyle } from '../types';
import * as openAlexService from './openalexService';
import * as arxivService from './arxivService';
import * as validationService from './validationService';
import * as embeddingService from './embeddingService';
import { generateSummaryForPapers, generateHypotheticalAnswer } from './geminiService';
import { analyzePapers } from './analysisService';
import { createPaperId } from './extensionService';

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    onProgress: (message: string) => void
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    onProgress('Understanding your question...');
    const hypotheticalAnswer = await generateHypotheticalAnswer(query);

    onProgress('Fetching candidate papers...');
    // We still use the original query for keyword search against OpenAlex for broad candidate retrieval.
    const initialPapers = await openAlexService.searchOpenAlex(query, options);

    let filteredPapers = initialPapers;
    if (options.excludeKeywords && options.excludeKeywords.trim()) {
        const excludedTitles = new Set(options.excludeKeywords.split('|||'));
        if (excludedTitles.size > 0) {
            onProgress('Applying exclusion filter...');
            filteredPapers = initialPapers.filter(p => !excludedTitles.has(p.title));
        }
    }

    if (filteredPapers.length === 0) {
        return { papers: [], summary: 'No results found for your query. Please try different keywords or broaden your search criteria.', analysis: null };
    }

    onProgress('Enriching paper data...');
    // Data Enrichment Step:
    const enrichedPapers = await Promise.all(
        filteredPapers.map(async (paper) => {
            const enrichedData = await arxivService.enrichFromArxiv(paper);
            return enrichedData ? { ...paper, ...enrichedData } : paper;
        })
    );
    
    const papersWithIds = enrichedPapers.map(p => ({ ...p, id: createPaperId(p) }));
    
    // Semantic Re-ranking Step using the hypothetical answer
    onProgress('Calculating semantic relevance...');
    const semanticallyRankedPapers = await embeddingService.calculateSemanticScores(hypotheticalAnswer, papersWithIds);
    
    // New Step: Impact Scoring and Combined Ranking
    onProgress('Assessing academic impact...');
    const maxCitations = Math.max(...semanticallyRankedPapers.map(p => p.citations || 0), 1); // Avoid division by zero
    
    const papersWithCombinedScore = semanticallyRankedPapers.map(paper => {
        // Normalize citation count on a logarithmic scale to handle outliers
        const normalizedCitations = Math.log10((paper.citations || 0) + 1);
        const maxNormalizedCitations = Math.log10(maxCitations + 1);
        const impactScore = maxNormalizedCitations > 0 ? (normalizedCitations / maxNormalizedCitations) * 100 : 0;
        
        const semanticScore = paper.semanticScore || 0;
        
        // Weighted average: 70% semantic relevance, 30% citation impact
        const combinedScore = (semanticScore * 0.7) + (impactScore * 0.3);
        
        return {
            ...paper,
            impactScore,
            combinedScore
        };
    });

    // Sort by the new combined score
    const rankedPapers = papersWithCombinedScore.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));


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