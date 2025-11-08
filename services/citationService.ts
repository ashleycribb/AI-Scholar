import type { ResearchPaper, CitationStyle, ModelDefinition } from '../types';

let citeConstructorPromise: Promise<any> | null = null;

// Use an environment variable for the backend URL, with a fallback for local development.
const AGENT_BACKEND_URL = process.env.AGENT_BACKEND_URL || 'http://localhost:3002/api/agents';

/**
 * Helper for making requests to the new agent backend
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
 * Returns a promise that resolves with the `Cite` constructor.
 * It assumes Citation.js scripts have been loaded globally via script tags in index.html.
 */
const getCiteConstructor = (): Promise<any> => {
    if (citeConstructorPromise) {
        return citeConstructorPromise;
    }

    citeConstructorPromise = new Promise((resolve, reject) => {
        const POLLING_INTERVAL_MS = 100;
        const MAX_WAIT_MS = 8000;
        let totalWait = 0;

        const pollForCite = setInterval(() => {
            const GlobalCite = (window as any).Cite;

            const isReady = typeof GlobalCite === 'function' &&
                            GlobalCite.plugins?.output?.has('ris') &&
                            GlobalCite.plugins?.csl?.templates?.has('apa');

            if (isReady) {
                clearInterval(pollForCite);
                resolve(GlobalCite);
            } else {
                totalWait += POLLING_INTERVAL_MS;
                if (totalWait >= MAX_WAIT_MS) {
                    clearInterval(pollForCite);
                    let reason = "Citation.js library failed to initialize in time.";
                    reject(new Error(reason));
                }
            }
        }, POLLING_INTERVAL_MS);
    });

    return citeConstructorPromise;
};

/**
 * Generates formatted citations for a list of papers using Citation.js.
 * @param papers - An array of ResearchPaper objects.
 * @param style - The citation style to use (e.g., 'apa', 'mla').
 * @returns An array of HTML-formatted citation strings.
 */
export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle, model: ModelDefinition): Promise<string[]> => {
    try {
        const Cite = await getCiteConstructor();
        
        // Use AI agent to get rich metadata for each paper
        const cslDataPromises = papers.map(paper => callAgentBackend('extractCitationMetadata', { paper, model }));
        const cslData = await Promise.all(cslDataPromises);
        
        const cite = new Cite(cslData);
        
        const styleMap = {
            apa: 'apa',
            mla: 'modern-language-association',
            chicago: 'chicago-author-date',
            harvard: 'harvard-cite-them-right',
            ieee: 'ieee',
            vancouver: 'vancouver'
        };
        
        const output = cite.format('bibliography', {
            format: 'html',
            template: styleMap[style] || 'apa',
            lang: 'en-US'
        });
        
        return output.split('\n').filter((c: string) => c.trim().length > 0);
    } catch (error) {
        console.error("Error during citation generation:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to generate citations: ${errorMessage}`);
    }
};

/**
 * Generates a RIS string for a list of papers, suitable for Zotero/Mendeley.
 * @param papers - An array of ResearchPaper objects.
 * @returns A single string containing all references in RIS format.
 */
export const generateRIS = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    try {
        const Cite = await getCiteConstructor();

        // Use AI agent to get rich metadata for each paper
        const cslDataPromises = papers.map(paper => callAgentBackend('extractCitationMetadata', { paper, model }));
        const cslData = await Promise.all(cslDataPromises);

        const cite = new Cite(cslData);
        const risString = cite.format('ris');
        
        return risString;
    } catch (error) {
        console.error("Error generating RIS:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to generate RIS file for Zotero: ${errorMessage}`);
    }
};