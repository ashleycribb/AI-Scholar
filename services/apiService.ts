import type { AdvancedSearchOptions, AnalysisResult, PaperAnalysis, ResearchPaper, SummaryLength, SummaryStyle, SynthesisResult, ModelDefinition, SearchSourceInfo, KnowledgeGraph } from '../types';
import * as validationService from './validationService'; // This is a client-side utility
import { createPaperId } from './extensionService';
import * as unpaywallService from './unpaywallService';
import * as openAlexService from './openalexService';

// Use an environment variable for the backend URL, with a fallback for local development.
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://localhost:3002/api/agents';

// Helper for making requests to the new agent backend
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

export const search = async (
    query: string,
    options: AdvancedSearchOptions,
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    model: ModelDefinition,
    sources: SearchSourceInfo[]
): Promise<{ papers: ResearchPaper[], summary: string }> => {
    const agentPayload = { query, options, summaryLength, summaryStyle, model, searchSources: sources };
    const agentResponse = await callAgentBackend('search', agentPayload);
    
    // The agent backend returns papers and a summary. Analysis is now done client-side.
    const papers = agentResponse.papers as ResearchPaper[];
    const summary = agentResponse.summary as string;
    
    // Client-side validation is quick, so we keep it here.
    const validationResponses = await Promise.all(papers.map(p => validationService.validatePaper(p)));
    const validatedPapers = papers.map((paper, index) => ({
        ...paper,
        id: createPaperId(paper), // Ensure client-side ID is stable
        ...validationResponses[index].updatedPaperData,
        validation: validationResponses[index].validation,
    }));

    return { papers: validatedPapers, summary };
};


export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    return await callAgentBackend('analyzeGaps', { papers, model });
};

export const analyzeSinglePaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<PaperAnalysis> => {
    return await callAgentBackend('analyzeSinglePaper', { paper, model });
};

export const extractKeyConcepts = async (abstract: string, model: ModelDefinition): Promise<string[]> => {
    return await callAgentBackend('extractKeyConcepts', { abstract, model });
};

export const extractKnowledgeGraph = async (abstract: string, model: ModelDefinition): Promise<KnowledgeGraph> => {
    return await callAgentBackend('extractKnowledgeGraph', { abstract, model });
};

export const synthesizePapers = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    return await callAgentBackend('synthesizePapers', { papers, model });
};

export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    // This is a direct, simple service call, so we can keep it on the client.
    return await unpaywallService.findOpenAccessPdf(doi);
};

export const fetchMetadataByDOI = async (doi: string): Promise<ResearchPaper | null> => {
    // This is a direct, simple service call.
    return await openAlexService.searchOpenAlexByDoi(doi);
};

export const rerankForScreening = async (
    included: ResearchPaper[],
    excluded: ResearchPaper[],
    unscreened: ResearchPaper[],
    model: ModelDefinition
): Promise<{ paperId: string, score: number, rationale: string }[]> => {
    if (unscreened.length === 0) return [];
    const agentPayload = { included, excluded, unscreened, model };
    const rerankedResults = await callAgentBackend('rerankForScreening', agentPayload);
    return rerankedResults;
};

export const generateSuggestions = async (paper: ResearchPaper, model: ModelDefinition): Promise<string[]> => {
    return await callAgentBackend('generateSuggestions', { paper, model });
};