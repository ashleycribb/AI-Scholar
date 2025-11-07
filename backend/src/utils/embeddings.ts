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
    const response = await ai.models.embedContent({ model, content: { parts: [{ text }] } });
    return response.embedding.values;
};