





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
  ModelDefinition
} from "../types";

// Always use `const ai = new GoogleGenAI({apiKey: process.env.API_KEY});`.
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Utility to safely parse JSON from a string
const safeJsonParse = (jsonString: string) => {
  try {
    const cleanedString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedString);
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    console.error("Original string:", jsonString);
    return null;
  }
};

// --- ADAPTER IMPLEMENTATIONS ---

/**
 * [MOCK] Adapter for OpenAI or other non-Gemini models for demonstration.
 * In a real implementation, this would use the OpenAI SDK.
 */
const mockApiAdapter = async (prompt: string, modelId: string, schema: any): Promise<any> => {
    console.warn(`[MOCK] Adapter called for model ${modelId}. Returning mock data.`);

    // Based on the schema, return a mock response.
    if (schema.properties?.hypothetical_abstract) {
        return {
            hypothetical_abstract: `[Mock Response from ${modelId}] This is a mock abstract demonstrating how a different model could respond. It highlights the architectural pattern of using adapters for different AI providers.`
        };
    }
    if (schema.properties?.score && schema.properties?.rationale) {
        return { score: 75, rationale: `[Mock Response] This paper seems like a reasonably good fit based on the mock analysis.` };
    }
    if (schema.properties?.summary) {
        return { summary: `[Mock Summary from ${modelId}] This mock summary demonstrates the multi-model architecture.` };
    }
    if (schema.properties?.concepts) {
        return { concepts: ['Mock Concept 1', 'Mock Concept 2', 'Adapter Pattern'] };
    }
    if (schema.properties?.recipeName) { // From a generic example, good for citation testing
        return { title: '[Mock] Chocolate Chip Cookies', author: [{ family: 'Mock', given: 'Chef' }], issued: { 'date-parts': [[2023]] }, type: 'article-journal' };
    }
    if (schema.properties?.answer) { // For RAG
        return { answer: `[Mock RAG Response from ${modelId}] Based on the provided context, the answer appears to be related to the core themes of the mocked-up papers.` };
    }

    // Generic fallback mock
    return { mock_response: "This is a generic mock response from a mock adapter." };
};

/**
 * [REAL] Adapter for Google Gemini models.
 */
const geminiApiAdapter = async (prompt: string, modelId: string, schema: any): Promise<any> => {
    const response = await ai.models.generateContent({
        model: modelId,
        contents: prompt,
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


// --- UNIFIED GENERATION FUNCTION (THE "FACTORY") ---
const generateJsonWithModel = async (
    prompt: string,
    model: ModelDefinition,
    schema: any
): Promise<any> => {
    try {
        switch (model.provider) {
            case 'gemini':
                return await geminiApiAdapter(prompt, model.id, schema);
            case 'openai':
            case 'anthropic':
                // In a real implementation, these would call their respective SDKs.
                // For now, they all use the same mock adapter for demonstration.
                return await mockApiAdapter(prompt, model.id, schema);
            default:
                throw new Error(`Unsupported model provider: ${model.provider}`);
        }
    } catch (error) {
        console.error(`Error during AI generation with ${model.name}:`, error);
        throw error; // Re-throw to be handled by the caller
    }
};


/**
 * Attempts to verify a URL points to an accessible PDF by making a HEAD request.
 * This is a best-effort client-side check and may be blocked by CORS policies.
 * @param url The URL of the PDF to check.
 * @returns An object with the determined link state and a reason.
 */
export const checkPdfUrl = async (url: string): Promise<{ linkState: 'valid' | 'invalid' | 'paywalled' | 'unchecked', reason: string }> => {
    if (!url) {
        return { linkState: 'invalid', reason: 'No URL provided.' };
    }

    try {
        // Use a timeout to prevent long waits on unresponsive servers
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5-second timeout

        // A HEAD request is lighter than GET. It's still subject to CORS, but it's our best-effort client-side check.
        const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
        clearTimeout(timeoutId);

        if (!response.ok) {
             return { linkState: 'invalid', reason: `Link is broken or inaccessible (Status: ${response.status}).` };
        }

        const contentType = response.headers.get('Content-Type');
        if (contentType?.includes('application/pdf')) {
            return { linkState: 'valid', reason: 'Direct PDF link confirmed.' };
        }
        if (contentType?.includes('text/html')) {
            return { linkState: 'paywalled', reason: 'Link leads to a webpage, not a direct PDF. A paywall is likely.' };
        }

        return { linkState: 'unchecked', reason: 'Could not definitively determine content type from headers.' };

    } catch (error) {
        // This will be triggered by timeouts, network errors, and most CORS errors.
        console.warn(`Could not verify PDF link (${url}):`, error);
        return { linkState: 'invalid', reason: 'Could not access the link due to network issues, a timeout, or browser security (CORS) restrictions.' };
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
        // If generation fails or returns an empty string, fall back to the original query.
        // This ensures the search can still proceed, albeit with less accuracy.
        if (!result || !result.hypothetical_abstract) {
            console.warn("Hypothetical answer generation failed. Falling back to original query.");
            return userQuery;
        }
        return result.hypothetical_abstract;
    } catch (error) {
        console.error("Error generating hypothetical answer:", error);
        // Fallback to the original query in case of an API error
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
        if (!result) {
            return { score: 0, rationale: "AI screening failed to produce a valid response." };
        }
        return { score: result.score ?? 0, rationale: result.rationale ?? "No rationale provided." };
    } catch (error) {
        console.error("Error evaluating screening fit:", error);
        return { score: 0, rationale: "An error occurred during AI screening." };
    }
};

// Fix: Implement and export generateSummaryForPapers
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
    const topPapers = papers.slice(0, 5); // Use top 5 papers for the summary
    const abstracts = topPapers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

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

// Fix: Implement and export analyzeResearchGaps
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
        // Use the provided model for the analysis
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

// Fix: Implement and export extractKeyConcepts
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

// Fix: Implement and export synthesizePapers
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
        // Use the provided model for the synthesis
        const result = await generateJsonWithModel(prompt, model, synthesisSchema);
        return result || [];
    } catch (error) {
        console.error("Error synthesizing papers:", error);
        throw new Error("The AI failed to synthesize the papers. Please try again.");
    }
};

// Fix: Implement and export extractCitationMetadata
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
            // Fallback for AI failure
            return { title: paper.title };
        }
        return result;
    } catch (error) {
        console.error("Error extracting citation metadata:", error);
        // Fallback for API error
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