import type { ResearchPaper, ModelDefinition } from '../types';

// Use an environment variable for the backend URL, with a fallback for local development.
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://localhost:3002/api/agents';

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
 * Executes a Retrieval-Augmented Generation (RAG) pipeline via the backend agent to chat with project papers.
 * @param query The user's question.
 * @param projectPapers The list of all papers in the project, used as the knowledge base.
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

    // The entire RAG process (retrieval, context augmentation, generation) is now handled by the agent.
    // The frontend just sends the query and the knowledge base (project papers).
    const answer = await callAgentBackend('chatWithProject', { query, projectPapers, model });
    
    return answer;
};