
import { GoogleGenAI } from "@google/genai";
import type { ResearchPaper } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Calculates the cosine similarity between two vectors.
 */
export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

/**
 * Generates an embedding for a single piece of text.
 */
const getEmbedding = async (text: string): Promise<number[]> => {
    const response = await ai.models.embedContent({ model, content: { parts: [{ text }] } });
    return response.embedding.values;
};

/**
 * Takes a query (or a hypothetical answer) and a list of papers, calculates semantic scores, and returns the papers with scores.
 */
export const calculateSemanticScores = async (queryOrHypotheticalAnswer: string, papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    if (papers.length === 0) return [];
    
    try {
        const queryEmbedding = await getEmbedding(queryOrHypotheticalAnswer);
        
        const paperContents = papers.map(p => p.abstract);
        const batchResponse = await ai.models.batchEmbedContents({
            model,
            requests: paperContents.map(content => ({ content: { parts: [{ text: content }] } }))
        });
        const paperEmbeddings = batchResponse.embeddings.map(e => e.values);
        
        return papers.map((paper, index) => {
            const paperEmbedding = paperEmbeddings[index];
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
        // If embedding fails, return papers with a score of 0 so the app doesn't crash.
        return papers.map(p => ({ ...p, semanticScore: 0 }));
    }
};