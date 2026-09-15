
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import type { ModelDefinition, ResearchPaper, DeepResearchStep, DeepResearchReport, UserSettings, DeepResearchReflection } from "../types";
import * as openalexService from "./openalexService";
import * as oaiService from "./oaiService";
import * as semanticScholarService from "./semanticScholarService";
import * as geminiService from "./geminiService";
import * as arxivService from "./arxivService";
import * as crossrefService from "./crossrefService";
import * as pubmedService from "./pubmedService";
import * as biorxivService from "./biorxivService";
import * as zenodoService from "./zenodoService";
import * as doajService from "./doajService";
import * as coreService from "./coreService";
import * as dissertationService from "./dissertationService";
import { createPaperId } from "./extensionService";
import { papersToToonCollection } from "../utils/toon";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY
});

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errBody = error?.error || error;
    const errorCode = errBody?.code || error?.status;
    const errorMessage = errBody?.message || error?.message || JSON.stringify(error);
    const errorStatus = errBody?.status;

    if (retries > 0 && (
        errorCode === 429 || 
        errorStatus === 'RESOURCE_EXHAUSTED' ||
        errorMessage?.includes('429') || 
        errorMessage?.includes('RESOURCE_EXHAUSTED') ||
        errorMessage?.includes('quota')
    )) {
      const jitter = Math.random() * 1000;
      console.warn(`Deep Research API rate limit hit. Retrying in ${(delay + jitter).toFixed(0)}ms...`);
      await wait(delay + jitter);
      return runWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

const safeJsonParse = (jsonString: string) => {
    try {
        const cleanedString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanedString);
    } catch (e) {
        console.error("Failed to parse JSON:", e);
        return null;
    }
};

const planSchema = {
    type: Type.OBJECT,
    properties: {
        initial_query: { type: Type.STRING, description: "The single most important query to start with." },
        rationale: { type: Type.STRING, description: "Why this query is the best starting point." }
    },
    required: ["initial_query", "rationale"]
};

// Phase 3: Dynamic Planning - Initial Step
export const generateInitialPlan = async (topic: string, model: ModelDefinition): Promise<DeepResearchStep> => {
    // We now use the advanced prompt from geminiService (ported from Python)
    // to get highly specific queries if possible.
    try {
        const expandedQueries = await geminiService.generateSearchQueries(topic);
        const initialQuery = expandedQueries[0] || topic;

        return {
            id: 'step_0',
            query: initialQuery,
            status: 'pending',
            papersFound: 0,
            rationale: "AI-Optimized initial query based on OpenScholar logic."
        };
    } catch (e) {
        console.error("Deep Research Plan Error:", e);
        return { id: 'step_0', query: topic, status: 'pending', papersFound: 0 };
    }
};

// Legacy support if needed
export const generateResearchPlan = async (topic: string, model: ModelDefinition): Promise<DeepResearchStep[]> => {
    const step = await generateInitialPlan(topic, model);
    return [step];
};

const reflectionSchema = {
    type: Type.OBJECT,
    properties: {
        isSufficient: { type: Type.BOOLEAN, description: "True if we have enough info to write a comprehensive report." },
        missingInformation: { type: Type.STRING, description: "What specific information is missing?" },
        nextQuery: { type: Type.STRING, description: "A new search query to find the missing info. Leave empty if sufficient." },
        reasoning: { type: Type.STRING, description: "Critique of the current findings." }
    },
    required: ["isSufficient", "missingInformation", "nextQuery", "reasoning"]
};

// Phase 3: Reflexion Loop - Critique & Next Step
export const reflectOnState = async (
    topic: string, 
    currentPapers: ResearchPaper[], 
    executedQueries: string[]
): Promise<DeepResearchReflection> => {
    const paperSummaries = currentPapers.map(p => `- ${p.title} (${p.year})`).join('\n');
    const pastQueries = executedQueries.join(', ');

    const prompt = `Goal: Comprehensive literature review on "${topic}".
    
    Current Findings (Titles):
    ${paperSummaries}
    
    Queries Executed: ${pastQueries}
    
    Critique the findings. Do we have enough breadth (theoretical, methodological, empirical) and depth (recent state-of-the-art)?
    If YES, set isSufficient to true.
    If NO, formulate ONE specific "nextQuery" to fill the gap.
    
    Return JSON matching the schema.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: reflectionSchema,
            }
        }));

        const result = safeJsonParse(response.text || '');
        if (!result) return { isSufficient: true, missingInformation: '', nextQuery: '', reasoning: 'Error parsing reflection.' };
        return result;
    } catch (e) {
        console.error("Reflection Error:", e);
        return { isSufficient: true, missingInformation: '', nextQuery: '', reasoning: 'Error during reflection.' };
    }
};

/**
 * Executes a search step using Multi-Source retrieval + Query Expansion + Full Text Enrichment
 * This mirrors the logic in `use_search_apis.py`
 */
export const executeSearchStep = async (step: DeepResearchStep, settings?: UserSettings): Promise<ResearchPaper[]> => {
    try {
        // 1. Query Expansion (Ported from Python script logic)
        // If the query seems complex, expand it into keywords
        const expandedKeywords = await geminiService.generateSearchQueries(step.query);
        const queriesToRun = expandedKeywords.slice(0, 2); // Take top 2 variations
        if (queriesToRun.length === 0) queriesToRun.push(step.query);

        console.log(`[DeepResearch] Executing queries:`, queriesToRun);

        const searchPromises: Promise<ResearchPaper[]>[] = [];

        queriesToRun.forEach(q => {
            // Search OpenAlex
            searchPromises.push(
                openalexService.searchOpenAlex(q, {
                    startYear: '', endYear: '', authors: '', excludeKeywords: '', inclusionCriteria: '', exclusionCriteria: '', studyDesign: 'any',
                    isOpenAccess: false
                }).then(res => res.papers).catch(() => [])
            );

            // Search Semantic Scholar
            searchPromises.push(
                semanticScholarService.searchSemanticScholar(q, {
                    startYear: '', endYear: '', authors: '', excludeKeywords: '', inclusionCriteria: '', exclusionCriteria: '', studyDesign: 'any',
                    isOpenAccess: false
                }).then(res => res.papers).catch(() => [])
            );

            // Open Environment Registries (Crossref, PubMed, bioRxiv, Zenodo, DOAJ, ERIC, CORE, Dissertations)
            searchPromises.push(crossrefService.searchCrossref(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(pubmedService.searchPubMed(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(biorxivService.searchBioRxiv(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(zenodoService.searchZenodo(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(doajService.searchDOAJ(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(coreService.searchCORE(q, 4).then(res => res.papers).catch(() => []));
            searchPromises.push(dissertationService.searchDissertations(q, 4).then(res => res.papers).catch(() => []));
        });

        if (settings?.isOaiEnabled && settings?.oaiEndpoint) {
            searchPromises.push(oaiService.queryInstitutionalRepository(settings.oaiEndpoint, step.query));
        }

        const resultsArrays = await Promise.all(searchPromises);
        const rawPapers = resultsArrays.flat();

        // 2. Deduplication & Merging
        const unique = new Map<string, ResearchPaper>();
        rawPapers.forEach(p => {
            const key = p.title.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!unique.has(key)) {
                unique.set(key, p);
            } else {
                // Merge logic: prefer longer abstract
                const existing = unique.get(key)!;
                if ((p.abstract?.length || 0) > (existing.abstract?.length || 0)) {
                    unique.set(key, p);
                }
            }
        });
        
        let papers = Array.from(unique.values()).slice(0, 15);

        // 3. Full Text Enrichment (Ported from Python script logic)
        // Try to fetch full text from Ar5iv if it's an arXiv paper
        const enrichedPapers = await Promise.all(papers.map(async (p) => {
            if (p.sourceURL?.includes('arxiv.org')) {
                const enriched = await arxivService.enrichFromArxiv(p);
                if (enriched) return { ...p, ...enriched };
            }
            return p;
        }));

        return enrichedPapers; 
    } catch (e) {
        console.error(`Search failed for ${step.query}:`, e);
        return [];
    }
};

const reportSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING },
        summary: { type: Type.STRING },
        sections: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    heading: { type: Type.STRING },
                    claims: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                text: { type: Type.STRING, description: "The claim or statement." },
                                citationIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                                confidence: { type: Type.NUMBER, description: "Confidence 0-1 based on source support." }
                            },
                            required: ["text", "citationIds", "confidence"]
                        }
                    }
                },
                required: ["heading", "claims"]
            }
        }
    },
    required: ["title", "summary", "sections"]
};

// Phase 2: Citation-Aware Synthesis
export const synthesizeReport = async (topic: string, papers: ResearchPaper[], model: ModelDefinition): Promise<DeepResearchReport> => {
    // Deduplicate papers by ID and Title
    const uniquePapersMap = new Map<string, ResearchPaper>();
    papers.forEach(p => {
        if (!uniquePapersMap.has(p.id)) uniquePapersMap.set(p.id, p);
    });
    const uniquePapers = Array.from(uniquePapersMap.values());
    
    // Sort by influence to prioritize context
    uniquePapers.sort((a, b) => (b.citations || 0) - (a.citations || 0));

    // Convert to TOON.
    const context = papersToToonCollection(uniquePapers.slice(0, 50)); 
    
    const prompt = `Act as a Principal Investigator. Write a rigorous literature review on: "${topic}".
    
    Source Material (TOON):
    ${context}
    
    Instructions:
    1. Organize the report into 4-6 thematic sections.
    2. For each section, output a list of **Claims**. 
    3. **Verification**: For every claim, you MUST cite the source ID (e.g., "#1") found in the TOON block. 
    4. Assign a **confidence score** (0.0 - 1.0) to each claim based on how strongly the source supports it.
    5. Be critical. If sources conflict, note it in a separate claim.
    
    Return JSON matching the schema.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-pro-preview",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: reportSchema,
                thinkingConfig: { thinkingBudget: 16000 }
            }
        }));

        const result = safeJsonParse(response.text || '');
        if (!result) throw new Error("Failed to parse report.");

        const sections = result.sections.map((section: any) => {
            const content = section.claims.map((c: any) => {
                const citations = c.citationIds.map((id: string) => {
                    const index = parseInt(id.replace('#', '')) - 1;
                    return index >= 0 && index < uniquePapers.length ? `[${index + 1}]` : '';
                }).join('');
                return `${c.text} ${citations}`;
            }).join(' ');

            return {
                heading: section.heading,
                content: content,
                claims: section.claims
            };
        });

        return {
            title: result.title,
            summary: result.summary,
            sections: sections,
            references: uniquePapers.slice(0, 50)
        };
    } catch (e) {
        console.error("Report Synthesis Error:", e);
        throw new Error("Failed to generate research report.");
    }
};
