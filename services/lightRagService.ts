
import type { ResearchPaper, KnowledgeGraph, ModelDefinition, Entity, Relationship } from '../types';
import * as apiService from './apiService';
import { embedText, batchEmbedText } from '../utils/embeddings';
import { cosineSimilarity } from '../utils/math';

// --- IN-MEMORY CACHE ---
// In a real application, this would be persisted (e.g., IndexedDB or Backend).
const embeddingCache = new Map<string, number[]>();
const graphCache = new Map<string, KnowledgeGraph>();

// --- CONFIG ---
const SIMILARITY_THRESHOLD = 0.7; // Minimum cosine similarity to consider a vector match
const MAX_CONTEXT_ITEMS = 5; // Max number of papers/chunks to include in context

/**
 * Indexes a paper for LightRAG:
 * 1. Generates/Retrieves Knowledge Graph (Entities & Relationships).
 * 2. Generates/Retrieves Vector Embedding for the abstract.
 * 3. Caches these for fast retrieval.
 */
export const indexPaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<ResearchPaper> => {
    let updatedPaper = { ...paper };

    // 1. Ensure Knowledge Graph exists
    if (!updatedPaper.knowledgeGraph || updatedPaper.knowledgeGraph.entities.length === 0) {
        console.log(`[LightRAG] Extracting Knowledge Graph for paper: ${paper.id}`);
        try {
            const kg = await apiService.extractKnowledgeGraph(paper.abstract, model);
            updatedPaper.knowledgeGraph = kg;
            graphCache.set(paper.id, kg);
        } catch (error) {
            console.error(`[LightRAG] Failed to extract KG for ${paper.id}:`, error);
        }
    } else {
        graphCache.set(paper.id, updatedPaper.knowledgeGraph);
    }

    // 2. Ensure Embedding exists
    if (!embeddingCache.has(paper.id)) {
        console.log(`[LightRAG] Generating embedding for paper: ${paper.id}`);
        try {
            const embedding = await embedText(paper.abstract);
            if (embedding && embedding.length > 0) {
                embeddingCache.set(paper.id, embedding);
            }
        } catch (error) {
            console.error(`[LightRAG] Failed to generate embedding for ${paper.id}:`, error);
        }
    }

    return updatedPaper;
};

/**
 * Performs a Hybrid Search (Vector + Graph) across the provided project papers.
 */
export const queryProject = async (query: string, papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    if (papers.length === 0) return "No papers in project to search.";

    // --- 1. Vector Search (Local Context) ---
    console.log(`[LightRAG] Starting Vector Search for query: "${query}"`);
    const queryEmbedding = await embedText(query);

    const vectorResults: { paper: ResearchPaper, score: number }[] = [];

    for (const paper of papers) {
        // Ensure embedding is available (might be cached or need fetching if not indexed yet)
        let embedding = embeddingCache.get(paper.id);
        if (!embedding) {
            // Fallback: try to embed on the fly if not indexed (slower)
            try {
                embedding = await embedText(paper.abstract);
                if (embedding) embeddingCache.set(paper.id, embedding);
            } catch (e) { continue; }
        }

        if (embedding) {
            const score = cosineSimilarity(queryEmbedding, embedding);
            if (score > SIMILARITY_THRESHOLD) {
                vectorResults.push({ paper, score });
            }
        }
    }

    // Sort by similarity
    vectorResults.sort((a, b) => b.score - a.score);
    const topVectorPapers = vectorResults.slice(0, MAX_CONTEXT_ITEMS).map(r => r.paper);


    // --- 2. Graph Search (Global/Relational Context) ---
    console.log(`[LightRAG] Starting Graph Search...`);

    // Extract entities from the user's query to find entry points in the graph
    const queryEntities = await apiService.extractKeyConcepts(query, model); // Re-using concept extraction as a proxy for entity extraction on query

    const graphContext: string[] = [];
    const relevantPapersFromGraph = new Set<string>();

    if (queryEntities.length > 0) {
        // Find papers that contain these entities in their KG
        for (const paper of papers) {
            const kg = paper.knowledgeGraph || graphCache.get(paper.id);
            if (!kg) continue;

            const relevantEntities = kg.entities.filter(e =>
                queryEntities.some(qe => e.label.toLowerCase().includes(qe.toLowerCase()))
            );

            if (relevantEntities.length > 0) {
                relevantPapersFromGraph.add(paper.id);

                // Add the specific relationships involving these entities to the context
                const relevantRelationships = kg.relationships.filter(r =>
                    relevantEntities.some(e => e.id === r.source || e.id === r.target)
                );

                if (relevantRelationships.length > 0) {
                     const relationsStr = relevantRelationships.map(r => {
                        const source = kg.entities.find(e => e.id === r.source)?.label || "Unknown";
                        const target = kg.entities.find(e => e.id === r.target)?.label || "Unknown";
                        return `- ${source} ${r.label} ${target} (${r.description})`;
                     }).join('\n');

                     graphContext.push(`From paper "${paper.title}":\n${relationsStr}`);
                }
            }
        }
    }


    // --- 3. Synthesis & Context Construction ---

    // Merge papers found via vector search and graph search
    const allRelevantPapers = new Set([...topVectorPapers, ...papers.filter(p => relevantPapersFromGraph.has(p.id))]);
    const finalPapers = Array.from(allRelevantPapers);

    if (finalPapers.length === 0) {
        return "No directly relevant information found in the project papers for this specific query.";
    }

    let contextParts: string[] = [];

    // Add full abstract context for high-relevance vector matches
    topVectorPapers.forEach(p => {
        contextParts.push(`PAPER: "${p.title}" (${p.year})\nABSTRACT: ${p.abstract}`);
    });

    // Add specific graph insights (relationships) if found
    if (graphContext.length > 0) {
        contextParts.push(`\n--- KNOWLEDGE GRAPH INSIGHTS ---\n${graphContext.join('\n')}`);
    }

    return contextParts.join('\n\n');
};
