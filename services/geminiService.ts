
import { GoogleGenAI, Type, Chat, GenerateContentResponse } from "@google/genai";
import type { ResearchPaper, SummaryLength, SummaryStyle, ModelDefinition, CitationStyle, InnovationResult, SynthesisResult } from "../types";
import { papersToToonCollection } from "../utils/toon";

export const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY
});

// Helper for exponential backoff with jitter
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    // Check for rate limit errors (429 or RESOURCE_EXHAUSTED)
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
      console.warn(`Gemini API rate limit hit. Retrying in ${(delay + jitter).toFixed(0)}ms...`);
      await wait(delay + jitter);
      return runWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

// Existing summarization function updated to use TOON
export const generateSummaryForPapers = async (papers: ResearchPaper[], length: SummaryLength, style: SummaryStyle): Promise<string> => {
  if (papers.length === 0) return "";

  // Use TOON format for denser context representation
  const papersText = papersToToonCollection(papers);

  const lengthPrompt = length === 'short' ? "1-2 paragraphs" : length === 'medium' ? "3-4 paragraphs" : "a detailed report";
  const stylePrompt = style === 'bullets' ? "bullet points" : "paragraphs";

  const prompt = `Based on the following academic papers (formatted in TOON), write a synthesis summary of the research topic. 
  
  Format: ${stylePrompt}
  Length: ${lengthPrompt}
  
  Source Material (TOON):
  ${papersText}
  
  Focus on common themes, conflicting results, and the overall state of research represented by these papers. Cite the papers using their index numbers like [1], [2].`;

  try {
    const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    }));
    return response.text || "Failed to generate summary.";
  } catch (error) {
    console.error("Error generating summary:", error);
    return "Error generating summary. Rate limit exceeded or API error.";
  }
};

/**
 * Generates optimal search queries for academic databases based on a user's natural language question.
 */
export const generateSearchQueries = async (question: string): Promise<string[]> => {
    const prompt = `Suggest academic search queries to retrieve relevant papers to answer the following research question. The search queries must be short (2-4 words), technical, and comma separated.
    
    Question: ${question}
    Search queries:`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        }));
        
        const text = response.text || "";
        const cleanText = text.replace(/Search queries:/i, '').trim();
        return cleanText.split(',').map(q => q.trim()).filter(q => q.length > 0);
    } catch (error) {
        console.error("Error generating search queries:", error);
        return [question]; 
    }
};

/**
 * Generates a plain-language (layman) summary of an academic abstract.
 * Inspired by the "Get The Research" plain language translation feature.
 */
export const generateLaymanSummary = async (paper: ResearchPaper): Promise<string> => {
    const prompt = `Translate the following academic abstract into plain language that a curious non-specialist (e.g., a high school student or a patient) can understand perfectly. 
    
    Guidelines:
    1. Avoid all technical jargon. If you must use a complex term, define it simply.
    2. Focus on the real-world significance and practical findings.
    3. Use an engaging, empathetic, and clear tone.
    4. Keep it under 150 words.
    
    Paper Title: ${paper.title}
    Abstract: ${paper.abstract}
    
    Layman Summary:`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        }));
        return response.text || "No summary could be generated.";
    } catch (error) {
        console.error("Error generating layman summary:", error);
        return "Error generating layman summary. The scientific content may be too complex for a simple translation or quota has been reached.";
    }
};

/**
 * NEW: Extracts keywords specifically from a dense text block like a hypothetical abstract.
 * Used to expand search scope based on semantic predictions.
 */
export const extractKeywordsFromText = async (text: string): Promise<string[]> => {
    const prompt = `Extract 3 high-impact, technical academic search keywords from this text that would yield similar research papers.
    Return only the keywords, separated by commas.
    
    Text: ${text}`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: prompt,
        }));
        return (response.text || "").split(',').map(s => s.trim()).filter(Boolean);
    } catch (e) {
        return [];
    }
};

/**
 * Generates a hypothetical answer (abstract) for the user's query.
 * This is used for HyDE (Hypothetical Document Embeddings).
 */
export const generateHypotheticalAnswer = async (query: string): Promise<string> => {
  const prompt = `Act as an expert academic researcher. Generate a high-quality, dense hypothetical abstract for a peer-reviewed paper that provides a comprehensive answer to the following research question: "${query}".

The abstract should:
1. Use professional academic terminology.
2. Outline a standard methodology (e.g., randomized control trial, quantitative longitudinal study, or qualitative meta-synthesis).
3. State specific, plausible findings and statistical results.
4. Conclude with the theoretical and practical implications.

The goal is to generate a document that is semantically similar to real relevant research papers in scientific databases. Do not include placeholders like "[Result Here]".`;

  try {
    const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    }));
    return response.text || query; // Fallback to query if generation fails
  } catch (error) {
    console.error("Error generating hypothetical answer:", error);
    return query;
  }
};

/**
 * Generates an embedding vector for a given text string.
 */
export const getEmbedding = async (text: string): Promise<number[]> => {
  try {
    // Attempt with gemini-embedding-2-preview
    const model = "gemini-embedding-2-preview";
    const result = await runWithRetry<any>(() => ai.models.embedContent({
      model: model,
      contents: text,
    }));
    return result.embedding?.values || result.embeddings?.[0]?.values || result.embeddings || [];
  } catch (error: any) {
    // Suppress 404 errors for embeddings as they are optional
    const isNotFound = error?.message?.includes('not found') || error?.status === 404 || error?.error?.code === 404;
    if (isNotFound) {
        console.warn(`[SemanticSearch] Embedding model not available (404). Semantic search disabled. Error details: ${error?.message || JSON.stringify(error)}`);
        return [];
    }
    console.error("Error fetching embedding:", error);
    return [];
  }
};

/**
 * Extracts detailed metadata for citation purposes when standard fields are missing.
 */
export const extractCitationMetadata = async (paper: ResearchPaper, model: ModelDefinition): Promise<object> => {
    const prompt = `Extract citation metadata from the following paper information into CSL-JSON format.
    Title: ${paper.title}
    Abstract: ${paper.abstract}
    Authors: ${paper.authors}
    Year: ${paper.year}
    Journal: ${paper.journal || ''}
    DOI: ${paper.doi || ''}
    
    Return ONLY JSON.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: model.id || "gemini-2.0-flash",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }));
        
        try {
            return JSON.parse(response.text || '{}');
        } catch {
            return {};
        }
    } catch (e) {
        return {};
    }
};

/**
 * Fallback citation formatter using LLM if CSL processor fails.
 */
export const formatCitation = async (paper: ResearchPaper, style: CitationStyle, model: ModelDefinition): Promise<string> => {
    const prompt = `Generate a citation for this paper in ${style.toUpperCase()} format.
    Title: ${paper.title}
    Authors: ${paper.authors}
    Year: ${paper.year}
    Journal: ${paper.journal || ''}
    DOI: ${paper.doi || ''}
    
    Return only the citation string.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: model.id || "gemini-2.0-flash",
            contents: prompt,
        }));
        return response.text?.trim() || "";
    } catch (e) {
        return `${paper.authors} (${paper.year}). ${paper.title}.`;
    }
};

/**
 * NEW: Generates innovative research ideas and hypotheses based on a collection of papers.
 * Inspired by DeepInnovator's "Knowledge Synthesis Pipeline".
 */
export const generateInnovationInsights = async (papers: ResearchPaper[], model: ModelDefinition): Promise<InnovationResult> => {
    const papersText = papersToToonCollection(papers);
    const prompt = `Act as an elite scientific innovation strategist. Analyze the following research papers (formatted in TOON) and synthesize breakthrough insights.
    
    Source Material (TOON):
    ${papersText}
    
    Your task is to:
    1. Generate 3 highly novel research ideas that address gaps or combine insights from these papers.
    2. Formulate 2 testable scientific hypotheses with experimental designs.
    3. Identify 2 cross-disciplinary connections (e.g., applying a method from one domain to another).
    
    Return the result in JSON format matching this schema:
    {
      "ideas": [
        { "title": "...", "description": "...", "novelty": "...", "potentialImpact": "...", "feasibility": "..." }
      ],
      "hypotheses": [
        { "hypothesis": "...", "rationale": "...", "proposedExperiment": "...", "expectedOutcome": "..." }
      ],
      "interdisciplinaryConnections": [
        { "domains": ["...", "..."], "connection": "...", "potential": "..." }
      ]
    }`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: model.id || "gemini-2.0-flash",
            contents: prompt,
            config: { responseMimeType: "application/json" }
        }));
        
        return JSON.parse(response.text || '{"ideas":[], "hypotheses":[], "interdisciplinaryConnections":[]}');
    } catch (e) {
        console.error("Innovation Engine Error:", e);
        return { ideas: [], hypotheses: [], interdisciplinaryConnections: [] };
    }
};

/**
 * Creates a chat session context aware of a specific paper.
 */
export const synthesizeWorkspace = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    const papersText = papersToToonCollection(papers);
    const prompt = `Act as an expert academic researcher. Synthesize the following research papers (formatted in TOON) into a comparative matrix.
    
    Source Material (TOON):
    ${papersText}
    
    Return a JSON array where each object represents a paper and contains the following fields:
    - title: The title of the paper.
    - mainFinding: The primary contribution or finding of the paper.
    - methodology: The methodological approach used in the paper.
    - context: A brief context or background of the paper.
    
    Return ONLY the JSON array.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: model.id || "gemini-3-flash-preview",
            contents: prompt,
            config: { 
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            title: { type: Type.STRING, description: "The title of the paper." },
                            mainFinding: { type: Type.STRING, description: "The primary contribution or finding of the paper." },
                            methodology: { type: Type.STRING, description: "The methodological approach used in the paper." },
                            context: { type: Type.STRING, description: "A brief context or background of the paper." }
                        },
                        required: ["title", "mainFinding", "methodology", "context"]
                    }
                }
            }
        }));
        
        return JSON.parse(response.text || '[]');
    } catch (e) {
        console.error("Synthesis Error:", e);
        return [];
    }
};

export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    const papersText = papersToToonCollection(papers);
    const prompt = `Act as an expert academic researcher. Analyze the following research papers (formatted in TOON) and identify theoretical and empirical gaps in the current literature.
    
    Source Material (TOON):
    ${papersText}
    
    Write a detailed report highlighting the missing areas of research, conflicting findings, and opportunities for future studies. Use Markdown formatting.`;

    try {
        const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
            model: model.id || "gemini-3-flash-preview",
            contents: prompt,
        }));
        
        return response.text || "Failed to generate gap analysis.";
    } catch (e) {
        console.error("Gap Analysis Error:", e);
        return "Error generating gap analysis.";
    }
};

export const createPaperChatSession = (paper: ResearchPaper, modelId: string): Chat => {
    return ai.chats.create({
        model: modelId,
        config: {
            systemInstruction: `You are a helpful research assistant discussing the paper: "${paper.title}".
            Abstract: "${paper.abstract}"
            Authors: "${paper.authors}"
            Year: "${paper.year}"
            
            Answer questions based on the abstract and metadata provided. If you don't know, say so.`
        }
    });
};

export const createWorkspaceChatSession = (papers: ResearchPaper[], modelId: string, history: {role: string, parts: {text: string}[]}[] = []): Chat => {
    const papersText = papersToToonCollection(papers);
    return ai.chats.create({
        model: modelId || "gemini-3-flash-preview",
        config: {
            systemInstruction: `You are a helpful research assistant discussing a collection of research papers.
            
            Source Material (TOON):
            ${papersText}
            
            Answer questions based on the provided papers. If you don't know the answer based on the provided papers, say so.`
        },
        history: history
    });
};
