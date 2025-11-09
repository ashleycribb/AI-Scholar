import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
// FIX: The batch embedding API requires the full model path.
const model = "models/gemini-2.5-flash-preview-embedder";

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
 * Generates embeddings for multiple pieces of text using the efficient batch API.
 */
export const batchEmbedText = async (texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) {
        return [];
    }
    
    try {
        // The API requires valid content. We create a map to handle sparse valid texts
        // and reconstruct the full array later to maintain order and length.
        const validRequests: { text: string, originalIndex: number }[] = [];
        texts.forEach((text, index) => {
            if (text && typeof text === 'string' && text.trim() !== '') {
                validRequests.push({ text, originalIndex: index });
            }
        });

        // If no valid texts to embed, return empty arrays for all.
        if (validRequests.length === 0) {
            return texts.map(() => []);
        }

        const requests = validRequests.map(({ text }) => ({
            model,
            content: { parts: [{ text }] },
        }));

        const response = await ai.models.batchEmbedContents({ requests });
        const embeddings = response.embeddings.map(e => e.values);

        // Reconstruct the full array of embeddings, placing results in their original positions.
        const finalEmbeddings: number[][] = Array(texts.length).fill([]);
        validRequests.forEach(({ originalIndex }, i) => {
            // Ensure we don't try to access an index that's out of bounds
            if (i < embeddings.length) {
                finalEmbeddings[originalIndex] = embeddings[i];
            }
        });
        
        return finalEmbeddings;

    } catch (error) {
        console.error("Error during batch embedding:", error);
        // In case of an error, return an empty array for each text to prevent crashes.
        return texts.map(() => []);
    }
};