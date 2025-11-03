import { GoogleGenAI } from "@google/genai";

// API key must be provided via environment variables
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Generates an embedding for a single piece of text.
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') {
        return [];
    }
    // FIX: The parameter for embedContent should be 'contents', not 'content'.
    const response = await ai.models.embedContent({ model, contents: { parts: [{ text }] } });
    // FIX: The response contains an 'embeddings' array. For a single request, access the first element.
    return response.embeddings[0].values;
};