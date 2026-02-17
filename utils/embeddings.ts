import { GoogleGenAI } from "@google/genai";
import { limitConcurrency } from "./concurrency";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
// FIX: The model name should not include the "models/" prefix.
const model = "gemini-2.5-flash-preview-embedder";

/**
 * Generates an embedding for a single piece of text.
 */
export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') {
        // Cannot embed empty string, return empty array or handle as error.
        return [];
    }
    // The `embedContent` API requires the content to be structured as a `Content` object
    // with a `parts` array, even for a single text input.
    try {
        const response = await ai.models.embedContent({ model, content: { parts: [{ text }] } });
        return response.embedding.values;
    } catch (e) {
        console.error(`Error embedding text: "${text.substring(0, 50)}..."`, e);
        // Return empty array on failure for this specific text to not fail the whole batch
        return [];
    }
};

/**
 * Generates embeddings for multiple pieces of text by running them in parallel.
 */
export const batchEmbedText = async (texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) {
        return [];
    }
    
    try {
        // Use a concurrency limit (e.g., 5) to avoid hitting rate limits
        // while still processing in parallel.
        // `batchEmbedContents` is not available on `ai.models`, so we use `embedText` concurrently.
        return await limitConcurrency(texts, 5, async (text) => {
            return await embedText(text);
        });

    } catch (error) {
        console.error("Error during batch embedding:", error);
        // In case of a global error, return an empty array for each text.
        return texts.map(() => []);
    }
};
