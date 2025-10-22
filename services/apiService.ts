
import type { AdvancedSearchOptions, AnalysisResult, CitationStyle, ResearchPaper, SummaryLength, SummaryStyle } from '../types';
import * as openAlexService from './openalexService';
import * as arxivService from './arxivService';
import { generateSummaryForPapers } from './geminiService';
import { analyzePapers } from './analysisService';
import { generateCitations as generateCitationsInternal, generateRIS as generateRISInternal } from './citationService';

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    const initialPapers = await openAlexService.searchOpenAlex(query, options);

    if (initialPapers.length === 0) {
        return { papers: [], summary: 'No results found for your query. Please try different keywords or broaden your search criteria.', analysis: null };
    }

    // Data Enrichment Step:
    // For each paper, check if it's from a known source (like arXiv) and fetch canonical data.
    const enrichedPapers = await Promise.all(
        initialPapers.map(async (paper) => {
            const enrichedData = await arxivService.enrichFromArxiv(paper);
            // If enrichment is successful, merge the new, higher-quality data over the original.
            return enrichedData ? { ...paper, ...enrichedData } : paper;
        })
    );

    // Run summary and analysis in parallel on the enriched data
    const [summary, analysis] = await Promise.all([
        generateSummaryForPapers(enrichedPapers, summaryLength, summaryStyle),
        analyzePapers(enrichedPapers)
    ]);
    
    return { papers: enrichedPapers, summary, analysis };
};

export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle): Promise<string[]> => {
    return await generateCitationsInternal(papers, style);
};

export const generateRIS = async (papers: ResearchPaper[]): Promise<string> => {
    return await generateRISInternal(papers);
};