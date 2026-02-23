
import { GoogleGenAI, FunctionDeclaration, Type, Chat } from "@google/genai";
import type { ResearchPaper, ModelDefinition, Project, ChatMessage, ConnectedPaper } from '../types';
import * as apiService from './apiService';

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || "" });

// --- AGENT TOOL DEFINITIONS ---

const getPapersInProjectTool: FunctionDeclaration = {
    name: "get_papers_in_project",
    description: "Lists all the papers currently saved in the user's project.",
    parameters: { type: Type.OBJECT, properties: {} }
};

const getPaperDetailsTool: FunctionDeclaration = {
    name: "get_paper_details",
    description: "Retrieves the full details (title, authors, abstract, citations) for a specific paper using its ID.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            paper_id: { type: Type.STRING, description: "The unique ID of the paper." }
        },
        required: ["paper_id"]
    }
};

const findConnectedPapersTool: FunctionDeclaration = {
    name: "find_connected_papers",
    description: "Finds papers that are connected to a given paper, either by citing it or being cited by it.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            paper_id: { type: Type.STRING, description: "The unique ID of the paper to find connections for." }
        },
        required: ["paper_id"]
    }
};

const availableTools = [
    getPapersInProjectTool,
    getPaperDetailsTool,
    findConnectedPapersTool,
];

// --- AGENT EXECUTION LOGIC ---

type AgentUpdate = 
    | { type: 'tool-start'; toolCall: { name: string; args: any; thinking: string; } }
    | { type: 'tool-end'; toolResponse: { name: string; result: any; } }
    | { type: 'final-answer'; text: string };


export async function* runAgentTask(
    query: string,
    project: Project,
    projectPapers: ResearchPaper[],
    modelDef: ModelDefinition
): AsyncGenerator<AgentUpdate> {

    const modelId = 'gemini-2.5-pro'; // Use a powerful model for agentic tasks

    const toolImplementations = {
        get_papers_in_project: () => projectPapers.map(p => ({ id: p.id, title: p.title, year: p.year })),
        get_paper_details: (args: { paper_id: string }) => {
            const paper = projectPapers.find(p => p.id === args.paper_id);
            if (!paper) return { error: "Paper not found." };
            return {
                id: paper.id,
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                abstract: paper.abstract,
                citations: paper.citations,
            };
        },
        find_connected_papers: async (args: { paper_id: string }): Promise<ConnectedPaper[] | { error: string }> => {
            const paper = projectPapers.find(p => p.id === args.paper_id);
            if (!paper) return { error: "Paper not found." };
            try {
                return await apiService.findConnectedPapers(paper, modelDef);
            } catch (e) {
                return { error: e instanceof Error ? e.message : "Failed to find connected papers." };
            }
        },
    };

    const chat: Chat = ai.chats.create({
        model: modelId,
        config: {
            systemInstruction: `You are an expert AI research assistant.
- You have access to a set of tools to answer questions about the user's current research project.
- The project is named "${project.name}".
- First, understand the user's request. Then, devise a plan and use the available tools step-by-step to gather the necessary information.
- If you need to list papers first to get an ID, do so.
- When calling a tool, explain your reasoning in the 'thinking' field.
- Once you have gathered enough information, synthesize it and provide a final, comprehensive answer to the user.
- Do not invent information. If the tools do not provide the answer, state that.`,
            tools: [{ functionDeclarations: availableTools }],
        },
    });

    let response = await chat.sendMessage({ message: query });
    
    while (response.functionCalls && response.functionCalls.length > 0) {
        for (const fnCall of response.functionCalls) {
            
            const { name, args, id } = fnCall;
            const thinking = `Calling tool '${name}' to gather information.`;

            yield { type: 'tool-start', toolCall: { name, args, thinking } };
            
            const toolImplementation = (toolImplementations as any)[name];
            if (!toolImplementation) {
                throw new Error(`Unknown tool called by the model: ${name}`);
            }

            const toolResult = await Promise.resolve(toolImplementation(args));
            
            yield { type: 'tool-end', toolResponse: { name, result: toolResult } };

            response = await chat.sendMessage({
                message: {
                    functionResponses: { id, name, response: { result: toolResult } }
                }
            });
        }
    }

    yield { type: 'final-answer', text: response.text };
}
