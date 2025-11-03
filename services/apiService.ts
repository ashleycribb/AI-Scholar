



import type { AdvancedSearchOptions, AnalysisResult, PaperAnalysis, ResearchPaper, SummaryLength, SummaryStyle, SynthesisResult, ModelDefinition, AuthorFrequencyData } from '../types';
import * as openAlexService from './openalexService';
import * as arxivService from './arxivService';
import * as validationService from './validationService';
import * as embeddingService from './embeddingService';
import { generateSummaryForPapers, generateHypotheticalAnswer, evaluateScreeningFit, analyzeResearchGaps, analyzeSinglePaper as geminiAnalyzeSinglePaper, extractKeyConcepts as geminiExtractKeyConcepts, synthesizePapers as geminiSynthesizePapers, classifyStudyDesign, rerankByScreeningExample } from './geminiService';
import { analyzePapers } from './analysisService';
import { createPaperId } from './extensionService';
import * as unpaywallService from './unpaywallService';

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
    onProgress: (message: string) => void
): Promise<{ papers: ResearchPaper[], summary: string, analysis: AnalysisResult | null }> => {
    onProgress('Understanding your question...');
    const hypotheticalAnswer = await generateHypotheticalAnswer(query, model);

    onProgress('Fetching candidate papers...');
    const initialPapers = await openAlexService.searchOpenAlex(query, options);

    let filteredPapers = initialPapers;
    if (options.excludeKeywords && options.excludeKeywords.trim()) {
        const excludedTitles = new Set(options.excludeKeywords.split('|||'));
        if (excludedTitles.size > 0) {
            onProgress('Applying exclusion filter...');
            filteredPapers = initialPapers.filter(p => !excludedTitles.has(p.title));
        }
    }
    
    let papersWithStudyDesign = filteredPapers;
    if (options.studyDesign && options.studyDesign !== 'any') {
        onProgress('Classifying study designs...');
        const designClassificationPromises = filteredPapers.map(async (paper) => {
            const design = await classifyStudyDesign(paper, model);
            return { ...paper, detectedStudyDesign: design };
        });
        const classifiedPapers = await Promise.all(designClassificationPromises);
        
        const designMap: { [key: string]: string } = {
            'randomized_controlled_trial': 'Randomized Controlled Trial',
            'systematic_review': 'Systematic Review',
            'observational_study': 'Observational Study',
            'qualitative_study': 'Qualitative Study',
        };
        const targetDesign = designMap[options.studyDesign];
        papersWithStudyDesign = classifiedPapers.filter(p => p.detectedStudyDesign === targetDesign);
    }


    if (papersWithStudyDesign.length === 0) {
        return { papers: [], summary: 'No results found for your query. Please try different keywords or broaden your search criteria.', analysis: null };
    }

    onProgress('Enriching paper data...');
    const enrichedPapers = await Promise.all(
        papersWithStudyDesign.map(async (paper) => {
            const enrichedData = await arxivService.enrichFromArxiv(paper);
            return enrichedData ? { ...paper, ...enrichedData } : paper;
        })
    );
    
    const papersWithIds = enrichedPapers.map(p => ({ ...p, id: createPaperId(p) }));
    
    onProgress('Calculating semantic relevance...');
    const semanticallyRankedPapers = await embeddingService.calculateSemanticScores(hypotheticalAnswer, papersWithIds);
    
    let papersWithScreening = semanticallyRankedPapers;
    if (options.inclusionCriteria?.trim() || options.exclusionCriteria?.trim()) {
        onProgress('Screening papers against criteria...');
        const screeningPromises = semanticallyRankedPapers.map(p => 
            evaluateScreeningFit(p, options.inclusionCriteria, options.exclusionCriteria, model)
        );
        const screeningResults = await Promise.all(screeningPromises);
        papersWithScreening = semanticallyRankedPapers.map((paper, index) => ({
            ...paper,
            screeningFitScore: screeningResults[index].score,
            screeningRationale: screeningResults[index].rationale,
        }));
    }

    onProgress('Calculating author and journal metrics...');

    // --- Author Authority Calculation ---
    const authorFreq = Object.values(
        papersWithScreening.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
            if (author) {
                acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                acc[author].count++;
                const paper = papersWithScreening.find(p => p.authors.includes(author));
                acc[author].totalCitations += paper?.citations || 0;
            }
            return acc;
        }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
    );
    const authorCitationMap = new Map(authorFreq.map(a => [a.author, a.totalCitations]));
    const maxAuthorCitations = Math.max(...Array.from(authorCitationMap.values()), 1);

    // --- Journal Impact Calculation ---
    const journalStats = new Map<string, { totalCitations: number, count: number }>();
    papersWithScreening.forEach(p => {
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


    onProgress('Calculating final relevance scores...');
    const maxCitations = Math.max(...papersWithScreening.map(p => p.citations || 0), 1);
    const currentYear = new Date().getFullYear();
    
    const papersWithCombinedScore = papersWithScreening.map(paper => {
        // 1. Semantic Score (from embedding service)
        const semanticScore = paper.semanticScore || 0;

        // 2. Paper Impact Score (citation-based)
        const normalizedCitations = Math.log10((paper.citations || 0) + 1);
        const maxNormalizedCitations = Math.log10(maxCitations + 1);
        const impactScore = maxNormalizedCitations > 0 ? (normalizedCitations / maxNormalizedCitations) * 100 : 0;

        // 3. Recency Score (based on publication year)
        const age = currentYear - paper.year;
        const recencyScore = Math.max(0, 100 - (age * 5)); // Linear decay over 20 years

        // 4. Title Match Score (keyword presence in title)
        const titleMatchScore = calculateTitleMatchScore(query, paper.title);

        // 5. Trust Signals Score
        // 5a. Author Authority
        const firstAuthor = paper.authors.split(',')[0].trim();
        const authorCitations = authorCitationMap.get(firstAuthor) || 0;
        const normalizedAuthorCitations = Math.log10(authorCitations + 1);
        const maxNormalizedAuthorCitations = Math.log10(maxAuthorCitations + 1);
        const authorAuthorityScore = maxNormalizedAuthorCitations > 0 ? (normalizedAuthorCitations / maxNormalizedAuthorCitations) * 100 : 0;
        
        // 5b. Journal Impact
        const journalAvg = journalAvgCitations.get(paper.journal || '') || 0;
        const journalImpactScore = (journalAvg / maxAvgJournalCitations) * 100;

        const trustScore = (authorAuthorityScore * 0.5) + (journalImpactScore * 0.5);

        // Final Combined Score with new weights
        const combinedScore =
            (semanticScore * 0.40) +   // 40%
            (impactScore * 0.15) +     // 15%
            (recencyScore * 0.15) +    // 15%
            (trustScore * 0.20) +      // 20%
            (titleMatchScore * 0.10);  // 10%
        
        return { ...paper, impactScore, combinedScore };
    });

    const rankedPapers = papersWithCombinedScore.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

    // Get top authors for analysis after all papers are scored
    const topAuthors = authorFreq.sort((a,b) => b.count - a.count).slice(0, 10);

    onProgress('Validating papers and generating analysis...');
    const [summary, analysis, validationResponses] = await Promise.all([
        generateSummaryForPapers(rankedPapers, summaryLength, summaryStyle, model),
        analyzePapers(rankedPapers, topAuthors),
        Promise.all(rankedPapers.map(p => validationService.validatePaper(p)))
    ]);
    
    const validatedPapers = rankedPapers.map((paper, index) => ({
        ...paper,
        ...validationResponses[index].updatedPaperData,
        validation: validationResponses[index].validation,
    }));

    return { papers: validatedPapers, summary, analysis };
};

export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    return await analyzeResearchGaps(papers, model);
};

export const analyzeSinglePaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<PaperAnalysis> => {
    return await geminiAnalyzeSinglePaper(paper, model);
};

export const extractKeyConcepts = async (abstract: string, model: ModelDefinition): Promise<string[]> => {
    return await geminiExtractKeyConcepts(abstract, model);
};

export const synthesizePapers = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    return await geminiSynthesizePapers(papers, model);
};

// Fix: Expose findOpenAccessPdf through the main apiService
export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    return await unpaywallService.findOpenAccessPdf(doi);
};

export const fetchMetadataByDOI = async (doi: string): Promise<ResearchPaper | null> => {
    return await openAlexService.searchOpenAlexByDoi(doi);
};

export const rerankForScreening = async (
    included: ResearchPaper[],
    excluded: ResearchPaper[],
    unscreened: ResearchPaper[],
    model: ModelDefinition
): Promise<{ paperId: string, score: number, rationale: string }[]> => {
    if (unscreened.length === 0) return [];

    const rerankPromises = unscreened.map(async (paper) => {
        try {
            const result = await rerankByScreeningExample(included, excluded, paper, model);
            return {
                paperId: paper.id,
                score: result.score,
                rationale: result.rationale,
            };
        } catch (error) {
            console.error(`Failed to re-rank paper ${paper.id}:`, error);
            // Return a failed state for this specific paper
            return {
                paperId: paper.id,
                score: 0,
                rationale: "AI re-ranking failed for this paper.",
            };
        }
    });

    return await Promise.all(rerankPromises);
};