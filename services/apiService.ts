
import type { AdvancedSearchOptions, AnalysisResult, CitationStyle, ResearchPaper, SummaryLength, SummaryStyle } from '../types';
import * as openAlexService from './openalexService';
import { generateSummaryForPapers } from './geminiService';
import { analyzePapers } from './analysisService';
import { generateCitations as generateCitationsInternal, generateRIS as generateRISInternal } from './citationService';

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    const papers = await openAlexService.searchOpenAlex(query, options);

    if (papers.length === 0) {
        return { papers: [], summary: 'No results found for your query. Please try different keywords or broaden your search criteria.', analysis: null };
    }

    // Run summary and analysis in parallel
    const [summary, analysis] = await Promise.all([
        generateSummaryForPapers(papers, summaryLength, summaryStyle),
        analyzePapers(papers)
    ]);
    
    return { papers, summary, analysis };
};

export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle): Promise<string[]> => {
    return await generateCitationsInternal(papers, style);
};

export const generateRIS = async (papers: ResearchPaper[]): Promise<string> => {
    return await generateRISInternal(papers);
};