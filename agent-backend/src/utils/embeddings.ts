// agent-backend/src/utils/embeddings.ts (Copy of frontend utils/embeddings.ts)

import { GoogleGenAI } from "@google/genai";

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