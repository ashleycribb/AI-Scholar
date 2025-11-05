// agent-backend/src/agents/utils/paperProcessing.ts
import { ResearchPaper, AdvancedSearchOptions, ModelDefinition } from "../../types";
import * as embeddingService from "../../utils/embeddings";
import { ClassifyStudyDesignTool, EvaluateScreeningFitTool, GenerateHypotheticalAnswerTool } from "../../tools/researchTools";


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


// Helper function to combine arXiv and OpenAlex results (from frontend apiService)
export async function combineArxivAndOpenAlexResults(allPapers: ResearchPaper[]): Promise<ResearchPaper[]> {
    const uniquePapersMap = new Map<string, ResearchPaper>();
    allPapers.forEach(paper => {
        const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!uniquePapersMap.has(normalizedTitle)) {
            uniquePapersMap.set(normalizedTitle, paper);
        }
    });
    return Array.from(uniquePapersMap.values());
}

// Helper function to calculate paper scores (from frontend apiService)
export async function calculatePaperScores(
    papers: ResearchPaper[],
    query: string,
    hypotheticalAnswer: string,
    model: ModelDefinition,
    options: AdvancedSearchOptions
): Promise<ResearchPaper[]> {
    if (papers.length === 0) return [];

    // Ensure abstracts are present before embedding
    const papersWithAbstracts = papers.filter(p => p.abstract && p.abstract.trim() !== '');
    if (papersWithAbstracts.length === 0) {
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }

    // Fix: Call calculateSemanticScores directly from the imported embeddingService
    const semanticallyRankedPapers = await embeddingService.calculateSemanticScores(hypotheticalAnswer, papersWithAbstracts);

    let papersWithStudyDesign = semanticallyRankedPapers;
    if (options.studyDesign && options.studyDesign !== 'any') {
        const designClassificationPromises = semanticallyRankedPapers.map(async (paper) => {
            const design = await new ClassifyStudyDesignTool()._call({ paper: { abstract: paper.abstract }, model });
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

    let papersWithScreening = papersWithStudyDesign;
    if (options.inclusionCriteria?.trim() || options.exclusionCriteria?.trim()) {
        const screeningPromises = papersWithStudyDesign.map(p => 
            new EvaluateScreeningFitTool()._call({ paper: { title: p.title, abstract: p.abstract }, inclusionCriteria: options.inclusionCriteria, exclusionCriteria: options.exclusionCriteria, model })
                .then(JSON.parse) // Parse the JSON string output from the tool
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

    // Author and Journal metrics (simplified for agent backend)
    const authorFreq = Object.values(
        papersWithScreening.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
            if (author) {
                // Fix: Corrected property name to 'totalCitations'
                acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                acc[author].count++;
                const paper = papersWithScreening.find(p => p.authors.includes(author));
                // Fix: Corrected property name to 'totalCitations'
                acc[author].totalCitations += paper?.citations || 0;
            }
            return acc;
        }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
    );
    const authorCitationMap = new Map(authorFreq.map(a => [a.author, a.totalCitations]));
    const maxAuthorCitations = Math.max(...Array.from(authorCitationMap.values()), 1);

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

    const papersWithCombinedScore = papersWithScreening.map(paper => {
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

    return rankedPapers;
}