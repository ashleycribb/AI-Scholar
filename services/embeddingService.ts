import { GoogleGenAI } from "@google/genai";
import type { ResearchPaper } from '../types';
import { cosineSimilarity } from '../utils/math';
import { embedText } from '../utils/embeddings';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Takes a query (or a hypothetical answer) and a list of papers, calculates semantic scores, and returns the papers with scores.
 */
export const calculateSemanticScores = async (queryOrHypotheticalAnswer: string, papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return [];
    
    try {
        const queryEmbedding = await embedText(queryOrHypotheticalAnswer);
        
        // Defensively filter papers to ensure they have a valid, non-empty abstract for embedding.
        // The Gemini API can fail on batch requests if any item has empty content.
        const papersToEmbed = papers.filter(p => 
            p.abstract && 
            typeof p.abstract === 'string' && 
            p.abstract.trim() !== ''
        );

        // If no papers have valid abstracts, return the original list with a score of 0.
        if (papersToEmbed.length === 0) {
            return papers.map(p => ({ ...p, semanticScore: 0 }));
        }

        // Prepare the content for the batch embedding request.
        const paperContents = papersToEmbed.map(p => ({ parts: [{ text: p.abstract }] }));
        
        // Get embeddings for all valid papers in a single batch call.
        const response = await ai.models.embedContents({
            model,
            contents: paperContents,
        });
        const paperEmbeddings = response.embeddings.map(e => e.values);
        
        // Create a map of paper ID to its embedding for efficient lookup.
        const embeddingMap = new Map<string, number[]>();
        papersToEmbed.forEach((paper, index) => {
            embeddingMap.set(paper.id, paperEmbeddings[index]);
        });
        
        // Map the calculated scores back to the original list of papers.
        // Papers that were filtered out will not be in the map and will receive a score of 0.
        return papers.map((paper) => {
            const paperEmbedding = embeddingMap.get(paper.id);
            if (!paperEmbedding) {
                return { ...paper, semanticScore: 0 };
            }
            
            const similarity = cosineSimilarity(queryEmbedding, paperEmbedding);
            // Convert similarity from [-1, 1] to [0, 100]
            const score = Math.round(((similarity + 1) / 2) * 100);
            return {
                ...paper,
                semanticScore: score,
            };
        });

    } catch (error) {
        console.error("Error calculating semantic scores:", error);
        // Fallback: If the API call fails for any reason, return all papers with a score of 0.
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }
};
