
// This file now handles all direct AI model interactions, removing the need for a backend.

import { GoogleGenAI, Type } from "@google/genai";
import type {
  ChatMessage,
  ConnectedPaper,
  PaperAnalysis,
  ResearchPaper,
  SearchSourceInfo,
  SummaryLength,
  SummaryStyle,
  SynthesisResult,
  GroundingSource,
  ModelDefinition,
  KnowledgeGraph,
  AdvancedSearchOptions
} from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const safeJsonParse = (jsonString: string) => {
  try {
    const cleanedString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedString);
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return null;
  }
};

const mockApiAdapter = async (prompt: string, modelId: string, schema: any): Promise<any> => {
    console.warn(`[MOCK] Adapter called for model ${modelId}. Returning mock data.`);
    if (schema.properties?.hypothetical_abstract) { return { hypothetical_abstract: `[Mock Response from ${modelId}] This is a mock abstract.` }; }
    if (schema.properties?.score && schema.properties?.rationale) { return { score: 75, rationale: `[Mock Response] This paper seems like a reasonably good fit.` }; }
    if (schema.properties?.summary) { return { summary: `[Mock Summary from ${modelId}] This mock summary.` }; }
    if (schema.properties?.concepts) { return { concepts: ['Mock Concept 1', 'Mock Concept 2'] }; }
    if (schema.properties?.suggestions) { return { suggestions: [`Mock suggestion from ${modelId}`, 'Another idea'] }; }
    if (schema.properties?.recipeName) { return { title: '[Mock] Chocolate Chip Cookies', author: [{ family: 'Mock', given: 'Chef' }], issued: { 'date-parts': [[2023]] }, type: 'article-journal' }; }
    if (schema.properties?.answer) { return { answer: `[Mock RAG Response from ${modelId}] The answer is mocked.` }; }
    if (schema.properties?.study_design) { return { study_design: 'Observational Study' }; }
    if (schema.properties?.entities) { return { entities: [{id: 'e1', type: 'Concept', label: 'Mock Concept', description: 'A mock concept'}], relationships: [] }; }
    if (schema.properties?.papers) { return { papers: [ { title: `[Mock Paper from ${modelId}]`, authors: 'Mock Author', year: 2023, abstract: 'A mock abstract.', sourceURL: 'https://mock.url', connection: 'mock connection', summary: 'mock summary' } ] }; }
    if (schema.properties?.core_search_query) { return { core_search_query: prompt }; }
    return { mock_response: "This is a generic mock response." };
};

const geminiApiAdapter = async (prompt: string, modelId: string, schema: any, useGoogleSearch: boolean = false): Promise<any> => {
    const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
        tools: useGoogleSearch ? [{googleSearch: {}}] : undefined,
        config: {
            responseMimeType: "application/json",
            responseSchema: schema,
        },
    });
    const result = safeJsonParse(response.text ?? '');
    if (!result) {
        throw new Error("AI model returned invalid JSON.");
    }
    return result;
};

const generateJsonWithModel = async (prompt: string, model: ModelDefinition, schema: any, useGoogleSearch: boolean = false): Promise<any> => {
    try {
        switch (model.provider) {
            case 'gemini':
                return await geminiApiAdapter(prompt, model.id, schema, useGoogleSearch);
            case 'openai':
            case 'anthropic':
                return await mockApiAdapter(prompt, model.id, schema);
            default:
                throw new Error(`Unsupported model provider: ${model.provider}`);
        }
    } catch (error) {
        console.error(`Error during AI generation with ${model.name}:`, error);
        throw error;
    }
};

const structuredSearchSchema = {
    type: Type.OBJECT,
    properties: {
        core_search_query: {
            type: Type.STRING,
            description: "The main topic or concept of the user's query, rephrased as an optimal search string for an academic database."
        },
        startYear: { type: Type.NUMBER, description: "The starting publication year, if specified." },
        endYear: { type: Type.NUMBER, description: "The ending publication year, if specified." },
        authors: { type: Type.STRING, description: "Any author names mentioned, formatted as a string." },
        excludeKeywords: { type: Type.STRING, description: "Any concepts, words, or authors the user wants to exclude, as a comma-separated string." },
        journal: { type: Type.STRING, description: "A specific journal or publication venue mentioned." },
        minCitations: { type: Type.NUMBER, description: "A minimum number of citations, if specified." },
        isOpenAccess: { type: Type.BOOLEAN, description: "Whether the user requested only open access results." },
    },
    required: ["core_search_query"],
};

export const parseQueryToStructuredFilters = async (userQuery: string, model: ModelDefinition): Promise<Partial<AdvancedSearchOptions> & { core_search_query: string }> => {
    const prompt = `You are an expert academic librarian. Your task is to parse a user's natural language research query into a structured JSON object that can be used to query an academic database like OpenAlex.

    **Instructions:**
    1.  Identify the main topic and rephrase it into a 'core_search_query'. This should be a concise and effective search string.
    2.  Extract any specific filters mentioned by the user.
    3.  If a filter is not mentioned, do not include its key in the final JSON.
    4.  Pay attention to dates, author names, exclusions, journals, citation counts, and open access requirements.
    5.  For date ranges, extract 'startYear' and 'endYear'. A query like "since 2020" means startYear is 2020. "before 2019" means endYear is 2018. "in 2021" means both startYear and endYear are 2021.
    6.  For exclusions, combine them into a single 'excludeKeywords' string.

    **User's Query:** "${userQuery}"

    Return ONLY the JSON object.`;

    try {
        const result = await generateJsonWithModel(prompt, model, structuredSearchSchema);
        if (!result || !result.core_search_query) {
            console.warn("Neuro-symbolic parsing failed. Falling back to using the raw query.");
            return { core_search_query: userQuery };
        }
        return result;
    } catch (error) {
        console.error("Error in neuro-symbolic query parsing:", error);
        return { core_search_query: userQuery }; // Fallback on error
    }
};


const hypotheticalAnswerSchema = {
    type: Type.OBJECT,
    properties: {
        hypothetical_abstract: { 
            type: Type.STRING,
            description: "A concise, academic-style abstract for a hypothetical paper that directly answers the user's question."
        },
    },
    required: ["hypothetical_abstract"],
};

export const generateHypotheticalAnswer = async (userQuery: string, model: ModelDefinition): Promise<string> => {
    const prompt = `You are an expert academic researcher. A user has provided a research question. Your task is to generate a concise, hypothetical abstract for a non-existent paper that would be the *perfect* answer to their question. This abstract will be used to find real papers that are semantically similar to it.

    **CRITICAL INSTRUCTIONS:**
    1.  **Directly Answer:** The abstract must directly address and answer the user's question.
    2.  **Use Academic Language:** Write in a formal, academic style, incorporating relevant keywords and concepts from the user's query domain.
    3.  **Be Factual and Plausible:** The content should be plausible and sound like a real research summary. Do not use phrases like "In this hypothetical paper...".
    4.  **Keep it Concise:** The abstract should be around 150-250 words.

    **User's Research Question:** "${userQuery}"

    Return your response as a single JSON object with a single key "hypothetical_abstract". Do not include any other text or markdown.`;

    try {
        const result = await generateJsonWithModel(prompt, model, hypotheticalAnswerSchema);
        if (!result || !result.hypothetical_abstract) {
            console.warn("Hypothetical answer generation failed. Falling back to original query.");
            return userQuery;
        }
        return result.hypothetical_abstract;
    } catch (error) {
        console.error("Error generating hypothetical answer:", error);
        return userQuery;
    }
};

const screeningFitSchema = {
    type: Type.OBJECT,
    properties: {
        score: {
            type: Type.NUMBER,
            description: "A score from 0 (poor fit) to 100 (perfect fit) representing how well the abstract meets inclusion criteria and avoids exclusion criteria."
        },
        rationale: {
            type: Type.STRING,
            description: "A brief, one-sentence explanation for the assigned score."
        },
    },
    required: ["score", "rationale"],
};

export const evaluateScreeningFit = async (
    paper: ResearchPaper,
    inclusionCriteria: string,
    exclusionCriteria: string,
    model: ModelDefinition
): Promise<{ score: number; rationale: string; }> => {
    if (!inclusionCriteria && !exclusionCriteria) {
        return { score: 100, rationale: "No screening criteria provided." };
    }

    const prompt = `Evaluate how well the following research paper abstract fits the given screening criteria.
    
    **Abstract:** "${paper.abstract}"

    **Inclusion Criteria:** ${inclusionCriteria || "None"}
    **Exclusion Criteria:** ${exclusionCriteria || "None"}

    Provide a score from 0 (poor fit) to 100 (perfect fit) and a brief, one-sentence rationale. Return as a JSON object with keys "score" and "rationale".`;

    try {
        const result = await generateJsonWithModel(prompt, model, screeningFitSchema);
        return { score: result.score ?? 0, rationale: result.rationale ?? "No rationale provided." };
    } catch (error) {
        console.error("Error evaluating screening fit:", error);
        return { score: 0, rationale: "An error occurred during AI screening." };
    }
};

const summaryStyleMap = {
    'paragraph': 'a concise summary paragraph.',
    'bullets': 'a bulleted list of the key findings.',
    'qa': 'a list of question/answer pairs about the research.',
};

const summaryLengthMap = {
    'short': 'very brief (1-2 sentences).',
    'medium': 'of medium length (3-5 sentences or bullet points).',
    'detailed': 'detailed and comprehensive.'
};

const overallSummarySchema = {
    type: Type.OBJECT,
    properties: {
        summary: { type: Type.STRING, description: "The overall summary of all provided abstracts." },
    },
    required: ["summary"],
};

export const generateSummaryForPapers = async (
    papers: ResearchPaper[],
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
    model: ModelDefinition
): Promise<string> => {
    if (papers.length === 0) return "";
    const abstracts = papers.slice(0, 5).map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `You are a research assistant. Based on the following abstracts from top search results, generate an overall summary.
    
    **Instructions:**
    1. Synthesize the information from all abstracts into a single, coherent overview.
    2. Do not just summarize each paper individually. Find the common themes, main findings, and overall narrative.
    3. The output should be ${summaryStyleMap[summaryStyle]}
    4. The output should be ${summaryLengthMap[summaryLength]}

    **Abstracts:**
    ${abstracts}

    Return a single JSON object with a "summary" key.`;

    try {
        const result = await generateJsonWithModel(prompt, model, overallSummarySchema);
        return result?.summary || "Could not generate a summary for the search results.";
    } catch (error) {
        console.error("Error generating summary for papers:", error);
        return "An error occurred while generating the summary.";
    }
};

const gapAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        report: { type: Type.STRING, description: "A markdown-formatted report outlining research gaps, future directions, and unanswered questions." },
    },
    required: ["report"],
};

export const analyzeResearchGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    const abstracts = papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `As an expert researcher, analyze the following collection of paper abstracts to identify research gaps.
    
    **Instructions:**
    1.  Synthesize the key findings and limitations from all abstracts.
    2.  Identify common themes and areas where the research converges or diverges.
    3.  Based on this synthesis, identify and articulate potential research gaps, unanswered questions, and promising future directions.
    4.  Structure your response as a formal report in Markdown format. Use headings (e.g., '## Identified Research Gaps') and bullet points.

    **Paper Abstracts:**
    ${abstracts}
    
    Return a single JSON object with a "report" key.`;

    try {
        const result = await generateJsonWithModel(prompt, model, gapAnalysisSchema);
        return result?.report || "Could not complete the research gap analysis.";
    } catch (error) {
        console.error("Error analyzing research gaps:", error);
        throw new Error("The AI failed to analyze the research gaps. Please try again.");
    }
};

const paperAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        researchQuestion: { type: Type.STRING, description: "The primary research question or objective of the paper." },
        methodology: { type: Type.STRING, description: "A brief description of the methodology used." },
        keyFindings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of the key findings or results." },
        limitations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of potential limitations mentioned or implied." },
    },
    required: ["researchQuestion", "methodology", "keyFindings", "limitations"],
};

export const analyzeSinglePaper = async (paper: ResearchPaper, model: ModelDefinition): Promise<PaperAnalysis> => {
    const prompt = `Perform a structured analysis of the following research paper based on its title and abstract.
    
    **Title:** ${paper.title}
    **Abstract:** ${paper.abstract}

    Extract the following information:
    1.  The primary research question or objective.
    2.  The methodology used.
    3.  A bulleted list of key findings.
    4.  A bulleted list of potential limitations mentioned or implied.
    
    Return the result as a JSON object.`;

    try {
        const result = await generateJsonWithModel(prompt, model, paperAnalysisSchema);
        if (!result) {
            throw new Error("AI analysis returned an invalid format.");
        }
        return result;
    } catch (error) {
        console.error("Error analyzing single paper:", error);
        throw new Error("Failed to perform AI-powered analysis on the paper.");
    }
};

const keyConceptsSchema = {
    type: Type.OBJECT,
    properties: {
        concepts: { type: Type.ARRAY, items: { type: Type.STRING }, description: "An array of 3-5 key concepts or technical terms." },
    },
    required: ["concepts"],
};

export const extractKeyConcepts = async (abstract: string, model: ModelDefinition): Promise<string[]> => {
    const prompt = `From the following academic abstract, extract the 3-5 most important and specific key concepts or technical terms.
    
    **Abstract:** "${abstract}"
    
    Return a single JSON object with a "concepts" key, which is an array of strings.`;

    try {
        const result = await generateJsonWithModel(prompt, model, keyConceptsSchema);
        return result?.concepts || [];
    } catch (error) {
        console.error("Error extracting key concepts:", error);
        return [];
    }
};

const synthesisSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING, description: "The original title of the paper." },
            mainFinding: { type: Type.STRING, description: "The single most important finding or conclusion of the paper." },
            methodology: { type: Type.STRING, description: "A brief (1-sentence) description of the methodology." },
            context: { type: Type.STRING, description: "The context, population, or sample studied (e.g., 'University students', 'Clinical trial participants')." },
        },
        required: ["title", "mainFinding", "methodology", "context"]
    }
};

export const synthesizePapers = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    const abstracts = papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `Synthesize the key information from the following paper abstracts into a structured table format. For each paper, extract its title, main finding, methodology, and context/sample.
    
    **Paper Abstracts:**
    ${abstracts}
    
    Return the result as a JSON array of objects, where each object represents a paper.`;

    try {
        const result = await generateJsonWithModel(prompt, model, synthesisSchema);
        return result || [];
    } catch (error) {
        console.error("Error synthesizing papers:", error);
        throw new Error("The AI failed to synthesize the papers. Please try again.");
    }
};

const cslSchema = {
    type: Type.OBJECT,
    properties: {
        'type': { type: Type.STRING, description: "The type of work (e.g., 'article-journal')." },
        'title': { type: Type.STRING, description: "The title of the paper." },
        'author': {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    'family': { type: Type.STRING },
                    'given': { type: Type.STRING }
                },
                required: ['family', 'given']
            }
        },
        'issued': {
            type: Type.OBJECT,
            properties: {
                'date-parts': {
                    type: Type.ARRAY,
                    items: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER }
                    }
                }
            },
            required: ['date-parts']
        },
        'container-title': { type: Type.STRING, description: "The name of the journal or publication." },
        'URL': { type: Type.STRING, description: "The URL to the paper." },
        'DOI': { type: Type.STRING, description: "The DOI of the paper." },
    },
    required: ["type", "title", "author", "issued"]
};

export const extractCitationMetadata = async (paper: ResearchPaper, model: ModelDefinition): Promise<object> => {
    const prompt = `From the provided paper metadata, extract the necessary fields to create a CSL JSON object for citation.
    - The author names need to be split into "family" and "given" names. Assume the last word of each author name is the family name.
    - The date should be represented in the 'date-parts' format.
    - Infer 'container-title' if not explicitly provided.
    - Set type to 'article-journal'.

    **Paper Metadata:**
    Title: "${paper.title}"
    Authors: "${paper.authors}"
    Year: ${paper.year}
    Journal: "${paper.journal || 'Unknown Journal'}"
    URL: "${paper.sourceURL || ''}"
    DOI: "${paper.doi || ''}"

    Return a single CSL JSON object.`;

    try {
        const result = await generateJsonWithModel(prompt, model, cslSchema);
        if (!result) {
            return { title: paper.title };
        }
        return result;
    } catch (error) {
        console.error("Error extracting citation metadata:", error);
        return {
            title: paper.title,
            author: [{ literal: paper.authors }],
            issued: { 'date-parts': [[paper.year]] },
        };
    }
};

const studyDesignSchema = {
    type: Type.OBJECT,
    properties: {
        study_design: { type: Type.STRING, description: "The classified study design." },
    },
    required: ["study_design"],
};

export const classifyStudyDesign = async (paper: ResearchPaper, model: ModelDefinition): Promise<string> => {
    const prompt = `Classify the study design from the following abstract into one of: 'Randomized Controlled Trial', 'Systematic Review', 'Observational Study', 'Qualitative Study', 'Other'.
    
    Abstract: "${paper.abstract}"
    
    Return a single JSON object with a "study_design" key.`;

    try {
        const result = await generateJsonWithModel(prompt, model, studyDesignSchema);
        return result?.study_design || 'Other';
    } catch (error) {
        console.error("Error classifying study design:", error);
        return 'Other';
    }
};

export const rerankByScreeningExample = async (
    included: ResearchPaper[],
    excluded: ResearchPaper[],
    paperToRerank: ResearchPaper,
    model: ModelDefinition
): Promise<{ score: number; rationale: string; }> => {
    const formatExamples = (papers: ResearchPaper[]) =>
        papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `You are an AI assistant helping with a systematic review screening. A user has provided examples of papers they have INCLUDED and EXCLUDED. Based on these examples, evaluate the following 'Candidate Paper' and determine how well it fits the user's implicit criteria.
    
    == INCLUDED EXAMPLES ==
    ${formatExamples(included)}

    == EXCLUDED EXAMPLES ==
    ${formatExamples(excluded)}

    == CANDIDATE PAPER ==
    Title: ${paperToRerank.title}
    Abstract: ${paperToRerank.abstract}

    Provide a relevance score from 0 (does not fit) to 100 (perfect fit) based on the examples, and a brief, one-sentence rationale for your score. Return as a JSON object with keys "score" and "rationale".`;

    try {
        const result = await generateJsonWithModel(prompt, model, screeningFitSchema);
        return result || { score: 0, rationale: "AI re-ranking failed." };
    } catch (error) {
        console.error("Error in re-ranking by example:", error);
        throw new Error("Failed to re-rank paper with AI.");
    }
};

const ragAnswerSchema = {
    type: Type.OBJECT,
    properties: {
        answer: { type: Type.STRING, description: "A comprehensive answer to the user's question, synthesized exclusively from the provided context." },
    },
    required: ["answer"],
};

export const generateRAGAnswer = async (query: string, context: string[], model: ModelDefinition): Promise<string> => {
    const formattedContext = context.map((c, i) => `CONTEXT ${i+1}:\n${c}`).join('\n\n---\n\n');
    
    const prompt = `You are a research assistant. Your task is to answer a user's question based *only* on the provided context from research paper abstracts. Do not use any outside knowledge.

    **User's Question:** "${query}"

    **Provided Context:**
    ${formattedContext}

    **Instructions:**
    1.  Read the user's question carefully.
    2.  Synthesize an answer using only the information contained in the provided context above.
    3.  If the context does not contain enough information to answer the question, state that clearly.
    4.  Be concise and directly address the question.
    
    Return your response as a single JSON object with a single key "answer".`;
    
    try {
        const result = await generateJsonWithModel(prompt, model, ragAnswerSchema);
        return result?.answer || "I could not find an answer in the provided context.";
    } catch (error) {
        console.error("Error generating RAG answer:", error);
        throw new Error("The AI failed to generate an answer based on the project papers.");
    }
};

const paperBasedSuggestionsSchema = {
    type: Type.OBJECT,
    properties: {
        suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of 5 distinct and insightful search queries."
        },
    },
    required: ["suggestions"],
};

export const generatePaperBasedSuggestions = async (paper: ResearchPaper, model: ModelDefinition): Promise<string[]> => {
    const prompt = `You are a research expert. Based on the title and abstract of the following academic paper, generate 5 distinct and insightful search queries that would help a user find related or follow-up research.

    Seed Paper:
    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return your response as a single JSON object with a single key "suggestions", which is an array of strings.`;

    try {
        const result = await generateJsonWithModel(prompt, model, paperBasedSuggestionsSchema);
        return result?.suggestions || [];
    } catch (error) {
        console.error("Error generating paper-based suggestions:", error);
        throw new Error("Failed to generate search suggestions for the selected paper.");
    }
};

const knowledgeGraphSchema = {
    type: Type.OBJECT,
    properties: {
        entities: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    id: { type: Type.STRING, description: "A unique identifier for the entity (e.g., 'concept_1')." },
                    type: { type: Type.STRING, description: "The type of entity. Must be one of: 'Concept', 'Methodology', 'Finding', 'Context'" },
                    label: { type: Type.STRING, description: "The name of the entity." },
                    description: { type: Type.STRING, description: "A brief one-sentence description of the entity." }
                },
                required: ["id", "type", "label", "description"]
            }
        },
        relationships: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    source: { type: Type.STRING, description: "The ID of the source entity." },
                    target: { type: Type.STRING, description: "The ID of the target entity." },
                    label: { type: Type.STRING, description: "The type of relationship (e.g., 'uses', 'investigates')." },
                    description: { type: Type.STRING, description: "A brief one-sentence description of how the entities are related." }
                },
                required: ["source", "target", "label", "description"]
            }
        }
    },
    required: ["entities", "relationships"]
};

export const extractKnowledgeGraph = async (abstract: string, model: ModelDefinition): Promise<KnowledgeGraph> => {
    const prompt = `You are an expert in scientific literature analysis. Your task is to extract a structured knowledge graph from the provided research abstract.

    Identify the core entities:
    - **Concepts**: Key ideas, theories, or subjects being investigated.
    - **Methodologies**: The techniques, tools, or procedures used in the research.
    - **Findings**: The results, conclusions, or key takeaways of the study.
    - **Context**: The domain or environment of the study.
    
    Identify the relationships between these entities, such as:
    - A 'Concept' **is investigated by** a 'Methodology'.
    - A 'Methodology' **produces** a 'Finding'.
    - A 'Concept' **is related to** another 'Concept'.
    - A 'Finding' **supports** or **contradicts** a 'Concept'.

    Abstract:
    "${abstract}"

    Return a single JSON object that strictly follows the provided schema. Generate unique IDs for each entity.`;

    const result = await generateJsonWithModel(prompt, model, knowledgeGraphSchema);
    return result || { entities: [], relationships: [] };
};


const foundPapersSchema = {
    type: Type.OBJECT,
    properties: {
        papers: {
            type: Type.ARRAY,
            description: "An array of academic papers found, up to a maximum of 10.",
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    authors: { type: Type.STRING, description: "A single string of comma-separated authors." },
                    year: { type: Type.NUMBER },
                    abstract: { type: Type.STRING, description: "A brief summary or abstract of the paper. If a full abstract is not available, a descriptive snippet is acceptable." },
                    sourceURL: { type: Type.STRING, description: "A direct URL to the paper's landing page (e.g., on arXiv, a publisher's site, or Google Scholar)." }
                },
                required: ["title", "authors", "year", "abstract", "sourceURL"]
            }
        }
    },
    required: ["papers"]
};

export const findPapersWithGoogleSearch = async (
    query: string,
    model: ModelDefinition
): Promise<Pick<ResearchPaper, 'title' | 'authors' | 'year' | 'abstract' | 'sourceURL'>[]> => {
    const prompt = `You are an expert research assistant. A user has provided a research query. Your task is to use Google Search to find up to 10 of the most relevant academic papers, dissertations, or pre-prints that answer this query. Do not prioritize only recent papers; older, foundational work is just as important.

**CRITICAL INSTRUCTIONS:**
1.  **Prioritize Academic Sources:** Focus on results from Google Scholar, university repositories (like ProQuest, institutional archives), arXiv, Semantic Scholar, PubMed, etc.
2.  **Extract All Fields:** For each paper you find, you MUST provide: title, authors (use "N/A" if not found), publication year, a concise abstract or summary (a descriptive snippet is acceptable if a full abstract isn't visible), and a direct URL to the paper's source page.
3.  **Be Resilient:** Do not give up if a source is not a major publisher. University dissertations and conference proceedings are highly valuable. It is better to return a result with a short summary than no result at all.

**User Query:** "${query}"

Return your findings as a single JSON object containing a "papers" array.`;

    try {
        // Use a more powerful model for this complex task involving tool use.
        const groundedModel = { ...model, id: 'gemini-2.5-pro' };
        const result = await generateJsonWithModel(prompt, groundedModel, foundPapersSchema, true);
        return result?.papers || [];
    } catch (error) {
        console.error("Error during AI Grounded Search:", error);
        throw new Error("The AI-powered search failed. This may be a temporary issue. Please try again.");
    }
};

const connectedPapersSchema = {
    type: Type.OBJECT,
    properties: {
        papers: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING },
                    authors: { type: Type.STRING },
                    year: { type: Type.NUMBER },
                    connection: { type: Type.STRING, description: "How this paper is connected (e.g., 'builds upon', 'refutes', 'is cited by')." },
                    summary: { type: Type.STRING, description: "A one-sentence summary of the connected paper." },
                    sourceURL: { type: Type.STRING, description: "A URL to the paper, if found." }
                },
                required: ["title", "authors", "year", "connection", "summary"]
            }
        }
    },
    required: ["papers"]
};

export const findConnectedPapers = async (paper: ResearchPaper, model: ModelDefinition): Promise<ConnectedPaper[]> => {
    const prompt = `You are a research expert. Based on the provided seed paper, use Google Search to find 5 connected academic papers. For each, identify a specific connection (e.g., "builds upon", "refutes the findings of", "is a foundational work for", "applies the methodology of") and provide a brief summary.

    **Seed Paper:**
    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return the results as a JSON object with a "papers" array.`;

    try {
        const groundedModel = { ...model, id: 'gemini-2.5-pro' };
        const result = await generateJsonWithModel(prompt, groundedModel, connectedPapersSchema, true);
        return result?.papers || [];
    } catch (error) {
        console.error("Error finding connected papers:", error);
        throw new Error("The AI failed to find connected papers.");
    }
};

const searchSuggestionsSchema = {
    type: Type.OBJECT,
    properties: {
        suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of 3-5 concise and relevant search query suggestions based on the user's partial input."
        },
    },
    required: ["suggestions"],
};

export const generateSearchSuggestions = async (partialQuery: string, model: ModelDefinition): Promise<string[]> => {
    const prompt = `You are an expert academic librarian. A user is typing a search query. Based on their partial input, generate 3-5 distinct and insightful search query suggestions that could help them find relevant academic papers. The suggestions should be alternative phrasings, more specific queries, or related concepts.

    User's partial query: "${partialQuery}"

    Return your response as a single JSON object with a "suggestions" key, which is an array of strings.`;

    try {
        const result = await generateJsonWithModel(prompt, model, searchSuggestionsSchema);
        return result?.suggestions || [];
    } catch (error) {
        console.error("Error generating search suggestions:", error);
        return [];
    }
};
