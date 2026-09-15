
import { ResearchPaper } from '../types';

/**
 * Local Reranking Service
 * Refines top results using a more computationally expensive scoring mechanism
 * that goes beyond simple keyword frequency.
 */

export const rerankResults = async (papers: ResearchPaper[], query: string): Promise<ResearchPaper[]> => {
    if (papers.length <= 1) return papers;

    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
    
    // We only rerank the top 50 results for performance
    const toRerank = papers.slice(0, 50);
    const remaining = papers.slice(50);

    const scored = toRerank.map(paper => {
        let rerankScore = 0;
        const text = `${paper.title} ${paper.abstract}`.toLowerCase();
        
        // 1. Exact Phrase Match (High Weight)
        if (text.includes(queryLower)) {
            rerankScore += 5.0;
        }

        // 2. Term Proximity (Bonus if terms are close to each other)
        if (queryTerms.length > 1) {
            let minDistance = Infinity;
            for (let i = 0; i < queryTerms.length - 1; i++) {
                const pos1 = text.indexOf(queryTerms[i]);
                const pos2 = text.indexOf(queryTerms[i+1]);
                if (pos1 !== -1 && pos2 !== -1) {
                    const dist = Math.abs(pos1 - pos2);
                    minDistance = Math.min(minDistance, dist);
                }
            }
            if (minDistance < 100) rerankScore += 2.0;
            if (minDistance < 50) rerankScore += 1.0;
        }

        // 3. Title Weight (Bonus for matches in title)
        const titleLower = paper.title.toLowerCase();
        queryTerms.forEach(term => {
            if (titleLower.includes(term)) {
                rerankScore += 1.5;
            }
        });

        // 4. Recency Bonus (Academic relevance often decays)
        const currentYear = new Date().getFullYear();
        const age = currentYear - paper.year;
        if (age <= 2) rerankScore += 1.0;
        else if (age <= 5) rerankScore += 0.5;

        // Combine with existing semantic score if available
        // rerankScore is roughly 0-10. semanticScore is 0-1.
        const combined = (paper.semanticScore || 0) * 0.4 + (rerankScore / 10) * 0.6;
        const finalScore = Math.min(100, Math.round(combined * 100));

        return { ...paper, semanticScore: finalScore };
    });

    // Sort by the new refined score
    const reranked = scored.sort((a, b) => (b.semanticScore || 0) - (a.semanticScore || 0));
    
    return [...reranked, ...remaining];
};
