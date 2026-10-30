
import type { ResearchPaper, SemanticSpan } from '../types';
import { generateHypotheticalAnswer, getEmbedding } from './geminiService';
import { cosineSimilarity } from '../utils/math';
import { batchEmbedText } from '../utils/embeddings';
import { scorePapersLexical } from '../utils/bm25';
import { rerankResults, buildPaperScoreExplanation } from './rerankService';

/**
 * Splits text into overlapping chunks (passages) to improve retrieval context.
 * Window size: 3 sentences. Stride: 2 sentences.
 */
const chunkTextIntoPassages = (text: string): string[] => {
    if (!text || text.length < 50) return [text];
    
    // Simple sentence splitting that respects common academic abbreviations
    const sentences = text.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [text];
    
    if (sentences.length <= 3) return [text.trim()];

    const chunks: string[] = [];
    // Sliding window: size 3, stride 2
    for (let i = 0; i < sentences.length; i += 2) {
        const chunk = sentences.slice(i, i + 3).join(' ').trim();
        if (chunk.length > 30) { // Filter out fragments
            chunks.push(chunk);
        }
        // Break if we've reached the end
        if (i + 3 >= sentences.length) break;
    }
    return chunks;
};

/**
 * Generates the embedding for the hypothetical answer.
 * Implement 'Hypothetical Document Expansion' using local LLMs (Gemini)
 * to transform sparse queries into rich keyword-dense text before traditional indexing.
 */
export const precomputeQueryEmbedding = async (query: string): Promise<number[]> => {
    try {
        console.log(`[SemanticSearch] Generating HyDE for: "${query.substring(0, 50)}..."`);
        // 1. Generate Hypothetical Answer (Expansion)
        const hypotheticalAnswer = await generateHypotheticalAnswer(query);
        console.log(`[SemanticSearch] HyDE Answer: "${hypotheticalAnswer.substring(0, 100)}..."`);
        
        // 2. Get Embedding for it
        const queryEmbedding = await getEmbedding(hypotheticalAnswer);
        
        if (queryEmbedding.length === 0) {
            console.warn("[SemanticSearch] Embedding generation failed for HyDE answer, falling back to raw query.");
            return await getEmbedding(query);
        }
        return queryEmbedding;
    } catch (e) {
        console.error("[SemanticSearch] Error precomputing query embedding:", e);
        return [];
    }
};

/**
 * Calculates semantic scores using PASSAGE-LEVEL ranking.
 * This is "Cross-Passage Scoring": matching the query vector against multiple windows of the abstract.
 */
export const computeScores = async (papers: ResearchPaper[], queryEmbedding: number[], queryFallback?: string): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return [];
    
    // If query embedding failed, return Lexical-First scores immediately
    if (queryEmbedding.length === 0) {
        if (queryFallback) {
            console.warn("[SemanticSearch] Query embedding is empty, using BM25+ Lexical-First fallback.");
            const lexicalScored = computeLexicalScores(papers, queryFallback);
            return await rerankResults(lexicalScored, queryFallback);
        }
        console.warn("[SemanticSearch] Query embedding is empty, skipping scoring.");
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }

    let scoredPapers: ResearchPaper[] = [];

    try {
        // 1. Prepare every passage of every paper up front, so the whole result set is embedded in
        //    as few proxy calls as possible (batchEmbedText chunks, de-duplicates and caches).
        const allChunks: { text: string; paperIdx: number }[] = [];
        papers.forEach((paper, paperIdx) => {
            const text = (paper.abstract && paper.abstract.length > 50 && !paper.abstract.includes("No abstract"))
              ? paper.abstract
              : `${paper.title}. ${paper.abstract || ""}`;
            chunkTextIntoPassages(text).forEach(p => allChunks.push({ text: p, paperIdx }));
        });

        // 2. Embed all passages (one call per ~100 texts; never throws, failures come back as []).
        const passageEmbeddings = await batchEmbedText(allChunks.map(c => c.text));

        // Graceful degradation: if no passage could be embedded (rate limit, outage), rank lexically
        // instead of scoring everything 0. The embedder has already logged a single warning.
        if (!passageEmbeddings.some(e => e && e.length > 0)) {
            const fallbackQuery = queryFallback ?? '';
            const lexicalScored = computeLexicalScores(papers, fallbackQuery);
            return queryFallback ? await rerankResults(lexicalScored, queryFallback) : lexicalScored;
        }

        // 3. Score passages using Cosine Similarity, grouped per paper
        const passagesByPaper: { text: string; score: number }[][] = papers.map(() => []);
        allChunks.forEach((chunk, idx) => {
            const embedding = passageEmbeddings[idx];
            const similarity = (embedding && embedding.length > 0)
                ? cosineSimilarity(queryEmbedding, embedding)
                : 0;
            passagesByPaper[chunk.paperIdx].push({ text: chunk.text, score: similarity });
        });

        // 4. Aggregate passage scores back to their respective papers
        scoredPapers = papers.map((paper, paperIdx) => {
            const paperPassages = passagesByPaper[paperIdx];
            // Sort by similarity descending
            paperPassages.sort((a, b) => b.score - a.score);

            const bestPassage = paperPassages[0];
            const similarity = bestPassage ? bestPassage.score : 0;

            // Normalization:
            // In gemini-embedding-2-preview, typical related hits are between 0.6 and 0.85
            const minSim = 0.45; // Threshold for "0%"
            const maxSim = 0.88; // Threshold for "100%"
            const score = Math.max(0, Math.min(100, Math.round(((similarity - minSim) / (maxSim - minSim)) * 100)));

            // Store top matching snippets for UI display
            const highlights: SemanticSpan[] = paperPassages
                .filter(p => p.score > minSim) // Only keep semi-relevant ones
                .slice(0, 2)
                .map(p => ({
                    text: p.text,
                    score: Math.round(((p.score - minSim) / (maxSim - minSim)) * 100)
                }));

            return {
                ...paper,
                semanticScore: score / 100, // Normalize to 0-1 for reranker
                rawSemanticSimilarity: score,
                semanticHighlights: highlights
            };
        });

        // 5. Local Reranking Step
        if (queryFallback) {
            return await rerankResults(scoredPapers, queryFallback, 'Embedding similarity + keyword boost');
        }

        // Fallback: convert back to 0-100 if no reranking happened
        return scoredPapers.map(p => {
            const finalScore = Math.round((p.semanticScore || 0) * 100);
            const finalPaper: ResearchPaper = {
                ...p,
                semanticScore: finalScore,
                rawSemanticSimilarity: p.rawSemanticSimilarity !== undefined ? p.rawSemanticSimilarity : finalScore
            };
            finalPaper.scoreExplanation = buildPaperScoreExplanation(
                finalPaper,
                queryFallback || '',
                'Embedding similarity + keyword boost'
            );
            return finalPaper;
        });
    } catch (e) {
        console.error("[SemanticSearch] Error computing passage-level scores:", e);
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }
};

/**
 * Lexical-First scoring using BM25+ to ensure high availability and baseline recall.
 */
const computeLexicalScores = (papers: ResearchPaper[], query: string): ResearchPaper[] => {
    const scores = scorePapersLexical(papers, query);
    return papers.map((paper, i) => ({
        ...paper,
        semanticScore: scores[i],
        rawSemanticSimilarity: Math.round((scores[i] || 0) * 100)
    }));
};

/**
 * Legacy combined function for backward compatibility.
 */
export const calculatePaperScores = async (papers: ResearchPaper[], query: string): Promise<ResearchPaper[]> => {
  const queryEmbedding = await precomputeQueryEmbedding(query);
  if (queryEmbedding.length === 0) {
      console.warn("[SemanticSearch] Embedding failed, using BM25+ Lexical-First scoring fallback.");
      const lexicalScored = computeLexicalScores(papers, query);
      return await rerankResults(lexicalScored, query);
  }
  return computeScores(papers, queryEmbedding, query);
};

