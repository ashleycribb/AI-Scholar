
import { ResearchPaper, MatchedTermLocation, ScoreExplanation } from '../types';

const STOP_WORDS = new Set([
    'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
    'what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'does', 'into',
    'about', 'between', 'using', 'based', 'study', 'paper', 'research'
]);

export function computeKeywordAndRecencyBreakdown(paper: ResearchPaper, query: string): {
    keywordScore: number;
    recencyScore: number;
} {
    const queryLower = (query || '').trim().toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    const text = `${paper.title || ''} ${paper.abstract || ''}`.toLowerCase();

    let keywordScore = 0;
    if (queryLower.length > 0 && text.includes(queryLower)) {
        keywordScore += 5.0;
    }

    if (queryTerms.length > 1) {
        let minDistance = Infinity;
        for (let i = 0; i < queryTerms.length - 1; i++) {
            const pos1 = text.indexOf(queryTerms[i]);
            const pos2 = text.indexOf(queryTerms[i + 1]);
            if (pos1 !== -1 && pos2 !== -1) {
                const dist = Math.abs(pos1 - pos2);
                minDistance = Math.min(minDistance, dist);
            }
        }
        if (minDistance < 100) keywordScore += 2.0;
        if (minDistance < 50) keywordScore += 1.0;
    }

    const titleLower = (paper.title || '').toLowerCase();
    queryTerms.forEach(term => {
        if (titleLower.includes(term)) {
            keywordScore += 1.5;
        }
    });

    let recencyScore = 0;
    if (paper.year && paper.year > 0) {
        const currentYear = new Date().getFullYear();
        const age = currentYear - paper.year;
        if (age <= 2) recencyScore = 1.0;
        else if (age <= 5) recencyScore = 0.5;
    }

    return { keywordScore, recencyScore };
}

export function buildPaperScoreExplanation(
    paper: ResearchPaper,
    query: string,
    methodName = 'Embedding similarity + keyword boost'
): ScoreExplanation {
    const rawTerms = (query || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, ' ')
        .split(/\s+/)
        .filter(t => t.length > 2 && !STOP_WORDS.has(t));

    const uniqueTerms = Array.from(new Set(rawTerms));
    const titleLower = (paper.title || '').toLowerCase();
    const abstractLower = (paper.abstract || '').toLowerCase();

    // Determine best passage
    let topPassage = paper.semanticHighlights?.[0]?.text || '';
    const topPassageScore = paper.semanticHighlights?.[0]?.score;

    if (!topPassage && paper.abstract && !paper.abstract.includes('No abstract')) {
        const sentences = paper.abstract.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [paper.abstract];
        let bestSentence = sentences[0] || paper.abstract;
        let maxHits = -1;
        for (const s of sentences) {
            const sLower = s.toLowerCase();
            const hits = uniqueTerms.filter(t => sLower.includes(t)).length;
            if (hits > maxHits) {
                maxHits = hits;
                bestSentence = s.trim();
            }
        }
        topPassage = bestSentence.trim();
    } else if (!topPassage) {
        topPassage = paper.title;
    }

    const passageLower = (topPassage || '').toLowerCase();
    const matchedTerms: MatchedTermLocation[] = [];

    for (const term of uniqueTerms) {
        const locations: ('title' | 'abstract' | 'passage')[] = [];
        if (titleLower.includes(term)) locations.push('title');
        if (abstractLower.includes(term)) locations.push('abstract');
        if (passageLower.includes(term)) locations.push('passage');
        if (locations.length > 0) {
            matchedTerms.push({ term, locations });
        }
    }

    // Also include matched paper concepts if query terms matched semantically
    if (matchedTerms.length === 0 && paper.keyConcepts && paper.keyConcepts.length > 0) {
        paper.keyConcepts.slice(0, 3).forEach(concept => {
            const cLower = concept.toLowerCase();
            const locations: ('title' | 'abstract' | 'passage')[] = [];
            if (titleLower.includes(cLower)) locations.push('title');
            if (abstractLower.includes(cLower)) locations.push('abstract');
            if (passageLower.includes(cLower) || locations.length === 0) locations.push('passage');
            matchedTerms.push({ term: concept, locations });
        });
    }

    const isScoreLoading = paper.semanticScore === undefined;
    const computedBreakdown = computeKeywordAndRecencyBreakdown(paper, query);
    const keywordPts = paper.rawKeywordScore !== undefined ? paper.rawKeywordScore : computedBreakdown.keywordScore;
    const recencyPts = paper.rawRecencyScore !== undefined ? paper.rawRecencyScore : computedBreakdown.recencyScore;
    const semanticPct = paper.rawSemanticSimilarity !== undefined
        ? Math.round(paper.rawSemanticSimilarity)
        : (topPassageScore !== undefined ? Math.round(topPassageScore) : undefined);

    const inputs = [
        {
            label: 'Semantic similarity',
            value: isScoreLoading && semanticPct === undefined
                ? 'Calculating…'
                : (semanticPct !== undefined ? `${semanticPct}%` : `${Math.round(paper.semanticScore || 0)}%`),
            weight: '40%',
            isLoading: isScoreLoading && semanticPct === undefined
        },
        {
            label: 'Keyword match',
            value: query.trim().length === 0 && isScoreLoading
                ? 'Calculating…'
                : `${keywordPts.toFixed(1)} pts (${matchedTerms.length} matched ${matchedTerms.length === 1 ? 'term' : 'terms'})`,
            weight: '54%',
            isLoading: query.trim().length === 0 && isScoreLoading
        },
        {
            label: 'Recency',
            value: paper.year && paper.year > 0
                ? `${recencyPts.toFixed(1)} / 1.0 pts (${paper.year})`
                : '0.0 / 1.0 pts (year unavailable)',
            weight: '6%',
            isLoading: false
        },
        {
            label: 'Citations',
            value: paper.citations !== undefined
                ? `${paper.citations.toLocaleString()} citations`
                : 'Calculating…',
            weight: 'Tie-breaker / sort',
            isLoading: paper.citations === undefined
        }
    ];

    return {
        method: methodName,
        matchedTerms,
        topPassage,
        topPassageScore,
        inputs
    };
}

/**
 * Local Reranking Service
 * Refines top results using a more computationally expensive scoring mechanism
 * that goes beyond simple keyword frequency.
 */
export const rerankResults = async (
    papers: ResearchPaper[],
    query: string,
    methodName = 'Embedding similarity + keyword boost'
): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return papers;

    // We only rerank the top 50 results for performance
    const toRerank = papers.slice(0, 50);
    const remaining = papers.slice(50);

    const scored = toRerank.map(paper => {
        const { keywordScore, recencyScore } = computeKeywordAndRecencyBreakdown(paper, query);
        const rerankScore = keywordScore + recencyScore;

        // Combine with existing semantic score if available
        // rerankScore is roughly 0-10. semanticScore is 0-1.
        const rawSemantic = (paper.semanticScore || 0) > 1 ? (paper.semanticScore || 0) / 100 : (paper.semanticScore || 0);
        const rawSemanticPct = Math.round(rawSemantic * 100);
        const combined = rawSemantic * 0.4 + (rerankScore / 10) * 0.6;
        const finalScore = Math.min(100, Math.round(combined * 100));

        const updatedPaper: ResearchPaper = {
            ...paper,
            semanticScore: finalScore,
            rawSemanticSimilarity: paper.rawSemanticSimilarity !== undefined ? paper.rawSemanticSimilarity : rawSemanticPct,
            rawKeywordScore: keywordScore,
            rawRecencyScore: recencyScore
        };
        updatedPaper.scoreExplanation = buildPaperScoreExplanation(updatedPaper, query, methodName);
        return updatedPaper;
    });

    // Sort by the new refined score
    const reranked = scored.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
    
    return [...reranked, ...remaining];
};

