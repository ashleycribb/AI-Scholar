
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY
});
const EMBEDDING_MODEL = "gemini-embedding-2-preview";

// Persistent Cache using localStorage (simple string-key store)
const PERSISTENT_CACHE_KEY = 'are_embeddings_index_v1';
const getStoredEmbeddings = (): Record<string, number[]> => {
    try {
        const stored = localStorage.getItem(PERSISTENT_CACHE_KEY);
        return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
};

const saveEmbeddingsToStore = (newEmbeddings: Record<string, number[]>) => {
    try {
        const current = getStoredEmbeddings();
        const updated = { ...current, ...newEmbeddings };
        // Basic eviction: if cache > 1MB, clear old entries
        if (JSON.stringify(updated).length > 1024 * 1024) {
            localStorage.removeItem(PERSISTENT_CACHE_KEY);
            localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(newEmbeddings));
        } else {
            localStorage.setItem(PERSISTENT_CACHE_KEY, JSON.stringify(updated));
        }
    } catch {}
};

// Helper for exponential backoff with jitter
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry<T>(fn: () => Promise<T>, retries = 3, delay = 2000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for rate limit errors (429 or RESOURCE_EXHAUSTED)
    const errBody = error?.error || error;
    const errorCode = errBody?.code || error?.status;
    const errorMessage = errBody?.message || error?.message || "";

    if (retries > 0 && (
        errorCode === 429 || 
        errorMessage.includes('429') || 
        errorMessage.includes('RESOURCE_EXHAUSTED') ||
        errorMessage.includes('quota')
    )) {
      const jitter = Math.random() * 1000;
      console.warn(`Embedding API rate limit hit. Retrying in ${(delay + jitter).toFixed(0)}ms...`);
      await wait(delay + jitter);
      return runWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

export const embedText = async (text: string): Promise<number[]> => {
    if (!text || text.trim() === '') return [];

    const cacheKey = text.trim().substring(0, 500); // Index by truncated text
    const store = getStoredEmbeddings();
    
    if (store[cacheKey]) return store[cacheKey];

    try {
        const response = await runWithRetry<any>(() => ai.models.embedContent({ 
            model: EMBEDDING_MODEL, 
            contents: text
        }));
        
        const embedding = response.embedding?.values || response.embeddings?.[0]?.values || response.embeddings || [];
        if (embedding.length > 0) {
            saveEmbeddingsToStore({ [cacheKey]: embedding });
        }
        return embedding;
    } catch (e) {
        console.error(`Embedding failed for text "${text.substring(0, 20)}..."`, e);
        return [];
    }
};

export const batchEmbedText = async (texts: string[]): Promise<number[][]> => {
    if (!texts || texts.length === 0) return [];
    
    const store = getStoredEmbeddings();
    const results: number[][] = new Array(texts.length);
    const indicesToFetch: number[] = [];
    const textsToFetch: string[] = [];

    texts.forEach((text, i) => {
        const key = text.substring(0, 500);
        if (store[key]) {
            results[i] = store[key];
        } else {
            indicesToFetch.push(i);
            textsToFetch.push(text);
        }
    });

    if (textsToFetch.length > 0) {
        // Fetch remaining in parallel with concurrency limit
        const BATCH_SIZE = 5; 
        for (let i = 0; i < textsToFetch.length; i += BATCH_SIZE) {
            const chunk = textsToFetch.slice(i, i + BATCH_SIZE);
            const chunkIndices = indicesToFetch.slice(i, i + BATCH_SIZE);
            
            try {
                const fetchedChunk = await Promise.all(chunk.map(t => embedText(t)));
                
                fetchedChunk.forEach((embedding, idx) => {
                    const originalIndex = chunkIndices[idx];
                    results[originalIndex] = embedding;
                });
            } catch (e) {
                console.error("Batch embedding chunk failed", e);
                chunkIndices.forEach(idx => {
                    results[idx] = []; 
                });
            }

            if (i + BATCH_SIZE < textsToFetch.length) {
                await wait(100);
            }
        }
    }

    for(let i=0; i<results.length; i++) {
        if(!results[i]) results[i] = [];
    }

    return results;
};
