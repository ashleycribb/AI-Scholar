import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Generates an embedding for a single piece of text.
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') {
        // Cannot embed empty string, return empty array or handle as error.
        return [];
    }
    const response = await ai.models.embedContent({ model, content: { parts: [{ text }] } });
    return response.embedding.values;
};

/**
 * Generates embeddings for multiple pieces of text by running requests in parallel.
 */
export const batchEmbedText = async (texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) {
        return [];
    }
    
    try {
        // Use Promise.all to execute multiple embedText calls in parallel.
        const embeddingPromises = texts.map(text => {
            if (!text || typeof text !== 'string' || text.trim() === '') {
                return Promise.resolve([]); // Return empty array for invalid input
            }
            return embedText(text);
        });
        
        const embeddings = await Promise.all(embeddingPromises);
        return embeddings;

    } catch (error) {
        console.error("Error during batch embedding:", error);
        // In case of an error, return an empty array for each text to prevent crashes.
        return texts.map(() => []);
    }
};