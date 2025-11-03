import type { ResearchPaper, ModelDefinition } from '../types';
import * as embeddingService from '../utils/embeddings';
import { cosineSimilarity } from '../utils/math';
import { generateRAGAnswer } from './geminiService';

const CONTEXT_SIZE = 5; // Use top 5 most relevant papers for context

/**
 * Simulates a Retrieval-Augmented Generation (RAG) pipeline to chat with project papers.
 * @param query The user's question.
 * @param projectPapers The list of all papers in the project.
 * @param model The AI model to use for generation.
 * @returns A promise that resolves to the AI-generated answer.
 */
export const chatWithProject = async (
    query: string,
    projectPapers: ResearchPaper[],
    model: ModelDefinition
): Promise<string> => {
    if (projectPapers.length === 0) {
        return "There are no papers in this project to search. Please add some papers first.";
    }

    // 1. RETRIEVAL: Find the most relevant papers to the query.
    // In this simulation, the "chunks" are the paper abstracts.
    const queryEmbedding = await embeddingService.embedText(query);
    if (queryEmbedding.length === 0) {
        throw new Error("Could not process your question.");
    }

    const paperAbstracts = projectPapers.map(p => p.abstract);
    const paperEmbeddings = await embeddingService.batchEmbedText(paperAbstracts);

    const scoredPapers = projectPapers.map((paper, index) => {
        const embedding = paperEmbeddings[index];
        if (!embedding || embedding.length === 0) {
            return { paper, score: -1 };
        }
        const score = cosineSimilarity(queryEmbedding, embedding);
        return { paper, score };
    });

    // Sort by relevance and take the top N as context.
    const topPapers = scoredPapers
        .sort((a, b) => b.score - a.score)
        .slice(0, CONTEXT_SIZE)
        .filter(item => item.score > 0.3); // Exclude very irrelevant results
    
    if (topPapers.length === 0) {
        return "I couldn't find any relevant information in the project papers to answer your question.";
    }

    // 2. AUGMENTED GENERATION: Pass the context to the LLM.
    const contextChunks = topPapers.map(item => `Title: ${item.paper.title}\nAbstract: ${item.paper.abstract}`);
    
    const answer = await generateRAGAnswer(query, contextChunks, model);
    
    return answer;
};