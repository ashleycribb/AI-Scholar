import type { ResearchPaper, ModelDefinition } from '../types';
import * as embeddingService from '../utils/embeddings';
import { cosineSimilarity } from '../utils/math';
import { GenerateRAGAnswerTool } from '../agent-backend/src/tools/researchTools'; // Import the tool for direct use if needed or call agent

const CONTEXT_SIZE = 5; // Use top 5 most relevant papers for context

// New Agent Backend URL for RAG
const AGENT_BACKEND_URL = 'http://localhost:3002/api/agents';

/**
 * Helper for making requests to the new agent backend
 * (duplicated from apiService.ts to avoid circular dependency if apiService.ts is too big)
 */
const callAgentBackend = async (intent: string, payload: any): Promise<any> => {
    try {
        const response = await fetch(AGENT_BACKEND_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ intent, payload }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `Agent backend failed with unknown error (Status: ${response.status}).` }));
            throw new Error(errorData.error || `Agent backend failed with status: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error(`Error calling agent backend for intent '${intent}':`, error);
        if (error instanceof TypeError) {
            throw new Error(`Could not connect to the AI agent backend. Please ensure the backend server is running and accessible at ${AGENT_BACKEND_URL}.`);
        }
        throw error;
    }
};

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

    // 2. AUGMENTED GENERATION: Pass the context to the LLM via the agent.
    const contextChunks = topPapers.map(item => `Title: ${item.paper.title}\nAbstract: ${item.paper.abstract}`);
    
    // Call the agent backend for RAG answer
    const answer = await callAgentBackend('generateRAGAnswer', { query, context: contextChunks, model });
    
    return answer;
};