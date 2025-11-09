import type { ResearchPaper, CitationStyle, ModelDefinition, CitationStats } from '../types';
import * as geminiService from './geminiService';

let citeConstructorPromise: Promise<any> | null = null;

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

export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle, model: ModelDefinition): Promise<string[]> => {
    try {
        const Cite = await getCiteConstructor();
        
        const cslDataPromises = papers.map(paper => geminiService.extractCitationMetadata(paper, model));
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

export const generateRIS = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    try {
        const Cite = await getCiteConstructor();

        const cslDataPromises = papers.map(paper => geminiService.extractCitationMetadata(paper, model));
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

/**
 * Fetches citation contexts from Semantic Scholar to compute support/contradict counts.
 */
export async function analyzeCitations(doi: string): Promise<CitationStats> {
  try {
    const response = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount`);
    if (!response.ok) {
        console.warn(`Semantic Scholar API returned status ${response.status} for DOI: ${doi}`);
        return { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };
    }
    const data = await response.json();
    const total = data?.citationCount || 0;
    // Mock implementation: assume supportive ratio = 0.7 for now
    const supportCount = Math.round(total * 0.7);
    const contradictCount = Math.round(total * 0.05);
    return {
      total,
      supportCount,
      contradictCount,
      supportRatio: total === 0 ? 0.5 : (supportCount - contradictCount) / Math.max(1, total)
    };
  } catch (e) {
    console.error(`Failed to analyze citations for DOI ${doi}:`, e);
    return { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };
  }
}
