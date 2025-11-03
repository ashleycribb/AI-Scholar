import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Generates an embedding for a single piece of text.
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') {
        // Cannot embed empty string, return empty array or handle as error.
        // For now, returning an empty array and letting the caller handle it.
        return [];
    }
    // FIX: The parameter for embedContent should be 'contents', not 'content'.
    const response = await ai.models.embedContent({ model, contents: { parts: [{ text }] } });
    // FIX: The response contains an 'embeddings' array. For a single request, access the first element.
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