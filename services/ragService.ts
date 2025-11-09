import type { ResearchPaper, ModelDefinition } from '../types';
import * as geminiService from './geminiService';

/**
 * Executes a Retrieval-Augmented Generation (RAG) pipeline to chat with project papers.
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

    // Build the context from the abstracts of the project papers.
    // Ensure only papers that have been 'indexed' (a stand-in for being processed/available) are used.
    const context = projectPapers
        .map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`);

    if (context.length === 0) {
        return "No indexed papers with abstracts are available in this project to answer your question.";
    }

    // Call the local geminiService to generate the answer.
    const answer = await geminiService.generateRAGAnswer(query, context, model);
    
    return answer;
};
