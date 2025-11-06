// agent-backend/src/utils/embeddings.ts (Copy of frontend utils/embeddings.ts)

import { GoogleGenAI } from "@google/genai";
// FIX: Add necessary imports for the new calculateSemanticScores function.
import type { ResearchPaper } from '../types';
import { cosineSimilarity } from './math';


const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Generates an embedding for a single piece of text.
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') {
        return [];
    }
    const response = await ai.models.embedContent({ model, contents: { parts: [{ text }] } });
    return response.embeddings[0].values;
};

/**
 * Generates embeddings for multiple pieces of text by running requests in parallel.
 */
export const batchEmbedText = async (texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) {
        return [];
    }
    
    try {
        const embeddingPromises = texts.map(text => {
            if (!text || typeof text !== 'string' || text.trim() === '') {
                return Promise.resolve([]);
            }
            return embedText(text);
        });
        
        const embeddings = await Promise.all(embeddingPromises);
        return embeddings;

    } catch (error) {
        console.error("Error during batch embedding:", error);
        return texts.map(() => []);
    }
};

// FIX: Add the calculateSemanticScores function to be used by the agent backend.
/**
 * Takes a query (or a hypothetical answer) and a list of papers, calculates semantic scores, and returns the papers with scores.
 */
export const calculateSemanticScores = async (queryOrHypotheticalAnswer: string, papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return [];
    
    try {
        const queryEmbedding = await embedText(queryOrHypotheticalAnswer);
        
        // Defensively filter papers to ensure they have a valid, non-empty abstract for embedding.
        const papersToEmbed = papers.filter(p => 
            p.abstract && 
            typeof p.abstract === 'string' && 
            p.abstract.trim() !== ''
        );

        if (papersToEmbed.length === 0) {
            return papers.map(p => ({ ...p, semanticScore: 0 }));
        }

        const abstractsToEmbed = papersToEmbed.map(p => p.abstract);
        
        const paperEmbeddings = await batchEmbedText(abstractsToEmbed);
        
        const embeddingMap = new Map<string, number[]>();
        papersToEmbed.forEach((paper, index) => {
            embeddingMap.set(paper.id, paperEmbeddings[index]);
        });
        
        return papers.map((paper) => {
            const paperEmbedding = embeddingMap.get(paper.id);
            if (!paperEmbedding || paperEmbedding.length === 0) {
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
