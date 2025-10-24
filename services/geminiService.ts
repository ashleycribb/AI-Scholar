

import { GoogleGenAI, Type } from "@google/genai";
import type {
  ChatMessage,
  ConnectedPaper,
  EnhancedQuery,
  PaperAnalysis,
  ResearchPaper,
  SearchSourceInfo,
  SummaryLength,
  SummaryStyle,
  SynthesisResult,
  GroundingSource
} from "../types";
import * as crossrefService from './crossrefService';
import * as unpaywallService from './unpaywallService';

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


const searchQueryEnhancementSchema = {
    type: Type.OBJECT,
    properties: {
        refined_query: { type: Type.STRING },
        key_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["refined_query", "key_concepts"],
};

export const enhanceSearchQuery = async (userQuery: string): Promise<EnhancedQuery> => {
    const prompt = `You are an expert research librarian. Your task is to refine a user's research query for an academic database like OpenAlex.

    **CRITICAL INSTRUCTIONS - FOLLOW THESE RULES STRICTLY:**
    1.  **STRICT DOMAIN ADHERENCE:** You MUST ONLY use concepts, terms, and synonyms that are explicitly within the domain of the user's original query.
    2.  **NO DOMAIN CROSSING:** Under NO circumstances should you introduce terms from unrelated fields. For example, if the query is about "financial risk management", concepts like "medical diagnosis" or "climate change" are strictly forbidden.
    3.  **BASE ON USER'S WORDS:** All generated key concepts and query terms must directly derive from the words provided by the user.

    User Query: "${userQuery}"

    Analyze the query to identify its core concepts. Generate synonyms and alternative phrasings for these core concepts ONLY. Then, construct a refined search query string using boolean operators (AND, OR) and phrase searching (using double quotes).

    Return your response as a single JSON object with the following structure. Do not include any text, code blocks, or explanations outside of the JSON object.

    **CORRECT Example:**
    User Query: "using machine learning for sentiment analysis in social media"
    Your JSON response:
    {
      "refined_query": "(\\"machine learning\\" OR \\"deep learning\\" OR \\"NLP\\") AND (\\"sentiment analysis\\" OR \\"opinion mining\\") AND (\\"social media\\" OR \\"twitter\\" OR \\"facebook\\")",
      "key_concepts": ["machine learning", "sentiment analysis", "social media"]
    }

    **INCORRECT Example (DOMAIN CROSSING):**
    User Query: "impact of interest rates on stock market"
    Incorrect JSON response that introduces unrelated terms:
    {
      "refined_query": "(\\"interest rates\\" OR \\"monetary policy\\") AND (\\"stock market\\" OR \\"equity prices\\" OR \\"patient outcomes\\")",
      "key_concepts": ["interest rates", "stock market", "patient outcomes"]
    }`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: searchQueryEnhancementSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result) throw new Error("Could not enhance search query.");
        return result;
    } catch (error) {
        console.error("Error enhancing search query:", error);
        // Fallback to the original query in case of an error
        return {
            refined_query: userQuery,
            key_concepts: [userQuery],
        };
    }
};

const refinedQueriesSchema = {
    type: Type.OBJECT,
    properties: {
        queries: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
    },
    required: ["queries"],
};

export const generateRefinedQueries = async (userQuery: string): Promise<string[]> => {
    const prompt = `You are an expert research librarian. Based on the user's research topic, generate 4 distinct and sophisticated search queries for an academic database like OpenAlex or Google Scholar.
    Each query should use boolean operators (AND, OR), phrase searching (""), and parentheses for grouping to explore different facets of the topic.

    User Topic: "${userQuery}"

    Return your response as a single JSON object with a single key "queries", which is an array of 4 query strings. Do not include any other text or markdown.

    Example for topic "AI in systematic reviews":
    {
        "queries": [
            "(\\"artificial intelligence\\" OR \\"machine learning\\" OR \\"deep learning\\") AND (\\"systematic review\\" OR \\"literature review\\") AND (\\"automation\\" OR \\"screening\\" OR \\"data extraction\\")",
            "(\\"natural language processing\\" OR \\"NLP\\") AND (\\"systematic review automation\\") AND (\\"bias\\" OR \\"accuracy\\" OR \\"efficiency\\")",
            "(\\"generative AI\\" OR \\"large language models\\") AND (\\"research synthesis\\" OR \\"literature review support\\")",
            "(\\"AI\\" OR \\"machine learning\\") AND (\\"challenges\\" OR \\"limitations\\" OR \\"ethical considerations\\") AND (\\"automated literature review\\")"
        ]
    }`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: refinedQueriesSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result || !result.queries) return [];
        return result.queries;
    } catch (error) {
        console.error("Error generating refined queries:", error);
        // Return empty array on failure, so the UI can handle it gracefully.
        return [];
    }
};

export const generateSummaryForPapers = async (
    papers: ResearchPaper[],
    summaryLength: SummaryLength,
    summaryStyle: SummaryStyle,
): Promise<string> => {
    if (papers.length === 0) return "";
    
    const paperContext = papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `Based on the following list of research paper abstracts, generate a cohesive summary. The summary should be a "${summaryStyle}" of "${summaryLength}" length.
    
    Papers:
    ${paperContext}
    
    Summary:`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text ?? '';
    } catch (error) {
        console.error("Error generating summary for papers:", error);
        throw new Error("Failed to generate summary.");
    }
};

const paperBasedSuggestionsSchema = {
    type: Type.OBJECT,
    properties: {
        suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
    },
    required: ["suggestions"],
};

export const generatePaperBasedSuggestions = async (paper: ResearchPaper): Promise<string[]> => {
    const prompt = `You are a research expert. Based on the title and abstract of the following academic paper, generate 5 distinct and insightful search queries that would help a user find related or follow-up research. The new queries should explore different facets of the topic, such as alternative methodologies, applications in different domains, or future research directions implied by the paper.

    Seed Paper:
    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return your response as a single JSON object with a single key "suggestions", which is an array of strings. Do not include any other text or markdown.

    Example:
    {
        "suggestions": [
            "long-term effects of [key concept] on [specific population]",
            "application of [methodology] in [different field]",
            "alternative approaches to solving [research problem]",
            "ethical implications of [main finding]",
            "longitudinal studies following up on [paper's conclusion]"
        ]
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: paperBasedSuggestionsSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result || !result.suggestions) return [];
        return result.suggestions;
    } catch (error) {
        console.error("Error generating paper-based suggestions:", error);
        throw new Error("Failed to generate search suggestions for the selected paper.");
    }
};

export const chatWithResults = async (
    history: ChatMessage[],
    papers: ResearchPaper[]
): Promise<{ text: string, sources: GroundingSource[] }> => {
    const paperContext = papers.map((p, i) => `[Paper ${i+1}] ${p.title}\n${p.abstract}`).join('\n\n');
    
    const systemInstruction = `You are a helpful research assistant. The user is asking questions about a set of research papers.
    Your knowledge is limited to the provided papers. Answer the user's questions based *only* on the information in the abstracts below.
    If the answer cannot be found in the papers, say that you cannot answer based on the provided information. Be concise.

    Reference Papers:
    ${paperContext}`;
    
    try {
        const contents = history.map(msg => ({
            role: msg.role,
            parts: msg.parts
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config: { systemInstruction }
        });
        
        // Return an empty sources array as we are no longer using grounding tools here.
        return { text: response.text ?? '', sources: [] };
    } catch (error) {
        console.error("Error in chat:", error);
        throw new Error("Failed to get chat response.");
    }
};

export const findConnectedPapers = async (seedPaper: ResearchPaper): Promise<{ seedPaper: ResearchPaper, connections: ConnectedPaper[] }> => {
    const prompt = `Find 5-7 highly relevant papers connected to the following seed paper. The connections could be citations, papers that build on its work, or papers with contrasting findings.
    
    Seed Paper:
    Title: ${seedPaper.title}
    Authors: ${seedPaper.authors}
    Abstract: ${seedPaper.abstract}

    Instructions:
    1.  Use Google Scholar search to find the connected papers.
    2.  For each connected paper, provide the title, authors, publication year, a brief summary, an explanation of its connection to the seed paper, and a direct source URL if available.
    3.  Follow this JSON format precisely. The top-level object must have a single key "connections" which is an array of paper objects. Do not add any text outside this JSON structure.
    4.  Each paper object must have these keys: "title", "authors", "year", "summary", "connection", and an optional "sourceURL".
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });
        
        const result = safeJsonParse(response.text ?? '');
        if (!result || !result.connections) throw new Error("Invalid response format for connected papers.");
        
        return { seedPaper, connections: result.connections };
    } catch (error) {
        console.error("Error finding connected papers:", error);
        throw new Error("Failed to find connected papers.");
    }
};

const databaseFinderSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING, description: "A unique ID for the database, e.g., 'pubmed'." },
            name: { type: Type.STRING, description: "The full name of the database, e.g., 'PubMed'." },
            description: { type: Type.STRING, description: "A short description of the database's focus." },
        },
        required: ["id", "name", "description"]
    }
};

export const findDatabasesForField = async (field: string): Promise<SearchSourceInfo[]> => {
    const prompt = `List the top 3-5 most relevant and reputable academic databases for the field of "${field}". For each, provide a unique ID, its name, and a brief description. Return the result as a JSON array.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: databaseFinderSchema,
            },
        });
        
        const result = safeJsonParse(response.text ?? '');
        if (!result) throw new Error("Could not find databases.");
        return result;
    } catch (error) {
        console.error("Error finding databases:", error);
        throw new Error("Failed to find academic databases.");
    }
};

const paperAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        researchQuestion: { type: Type.STRING },
        methodology: { type: Type.STRING },
        keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
        limitations: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["researchQuestion", "methodology", "keyFindings", "limitations"],
};

export const analyzeSinglePaper = async (paper: ResearchPaper): Promise<PaperAnalysis> => {
    const prompt = `Perform a structured analysis of the following research paper based on its abstract.
    
    Title: ${paper.title}
    Abstract: ${paper.abstract}

    Extract the following information:
    1.  The primary research question or objective.
    2.  The methodology used.
    3.  A bulleted list of key findings.
    4.  A bulleted list of potential limitations mentioned or implied.
    
    Return the result in JSON format.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: paperAnalysisSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result) throw new Error("Could not analyze paper.");
        return result;
    } catch (error) {
        console.error("Error analyzing paper:", error);
        throw new Error("Failed to perform structured analysis on the paper.");
    }
};

export const analyzeResearchGaps = async (papers: ResearchPaper[]): Promise<string> => {
    const paperContext = papers.map((p, i) => 
        `Paper ${i+1}:\nTitle: ${p.title}\nAbstract: ${p.abstract}`
    ).join('\n\n---\n\n');

    const prompt = `You are an expert research analyst. Your task is to perform a research gap analysis based on the provided academic paper abstracts.

    Context: The user has compiled a list of papers on a specific topic. They need you to synthesize the information and identify potential areas for future research.

    Provided Papers:
    ${paperContext}

    Instructions:
    1.  **Synthesize Core Themes:** Briefly summarize the main themes, methodologies, and key findings that are common across the papers.
    2.  **Identify Contradictions & Tensions:** Point out any areas where the papers present conflicting findings or different perspectives on the same issue.
    3.  **Highlight Unanswered Questions:** Identify questions that are raised but not fully answered by the collective literature provided. What are the limitations acknowledged by the authors that could be starting points for new research?
    4.  **Suggest Future Research Directions:** Based on the synthesis and identified gaps, propose 3-5 specific, actionable research questions or directions for future work. These should logically extend from the provided material.

    Please structure your response as a concise, well-organized report in Markdown format. Use headings (e.g., "## Core Themes") for each section.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
        });
        return response.text ?? '';
    } catch (error) {
        console.error("Error analyzing research gaps:", error);
        throw new Error("Failed to perform research gap analysis.");
    }
};

const synthesisSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            mainFinding: { type: Type.STRING },
            methodology: { type: Type.STRING },
            context: { type: Type.STRING },
        },
        required: ["title", "mainFinding", "methodology", "context"],
    }
};

export const synthesizePapers = async (papers: ResearchPaper[]): Promise<SynthesisResult> => {
    const paperContext = papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `You are a research synthesis expert. Based on the provided abstracts, create a structured summary for each paper, focusing on four key areas. This will be used to generate a comparative table for a literature review.

    Provided Papers:
    ${paperContext}

    Instructions:
    For each paper, extract the following information and return it as an array of JSON objects.
    1.  **title**: The exact title of the paper.
    2.  **mainFinding**: A concise, one-sentence summary of the paper's primary conclusion or key finding.
    3.  **methodology**: A brief description of the research method used (e.g., "Quantitative survey," "Qualitative interviews," "Systematic literature review," "Controlled experiment").
    4.  **context**: The context of the study, including the sample population or data source (e.g., "250 undergraduate students," "Tweets from 2020," "fMRI data from 30 patients").
    
    Ensure your response is a single, valid JSON array.
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro", // Using a more powerful model for this complex task
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: synthesisSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result) throw new Error("Could not synthesize papers.");
        return result;
    } catch (error) {
        console.error("Error synthesizing papers:", error);
        throw new Error("Failed to synthesize the provided literature.");
    }
};

const keyConceptsSchema = {
    type: Type.OBJECT,
    properties: {
        concepts: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
        },
    },
    required: ["concepts"],
};

export const extractKeyConcepts = async (abstract: string): Promise<string[]> => {
    if (!abstract || abstract.trim().length < 100) {
        return [];
    }

    const prompt = `You are a research expert skilled in identifying the core themes of academic literature.
    Read the following abstract and extract the 5-7 most important keywords or key concepts.
    These concepts should be concise and represent the main topics of the research.

    Abstract: "${abstract}"

    Return your response as a single JSON object with a single key "concepts" which is an array of strings.
    Do not include any other text or markdown.

    Example:
    {
        "concepts": ["machine learning", "sentiment analysis", "social media", "opinion mining", "natural language processing"]
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: keyConceptsSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result || !result.concepts) return [];
        return result.concepts;
    } catch (error) {
        console.error("Error extracting key concepts:", error);
        throw new Error("Failed to extract key concepts from abstract.");
    }
};

const cslSchema = {
    type: Type.OBJECT,
    properties: {
        type: { 
            type: Type.STRING, 
            description: "The CSL type of the publication (e.g., 'article-journal', 'paper-conference', 'book-chapter', 'report', 'thesis')." 
        },
        title: { type: Type.STRING },
        author: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    given: { type: Type.STRING },
                    family: { type: Type.STRING },
                },
                required: ["family"]
            }
        },
        issued: {
            type: Type.OBJECT,
            properties: {
                'date-parts': { 
                    type: Type.ARRAY, 
                    items: { type: Type.ARRAY, items: { type: Type.NUMBER } } 
                },
            },
        },
        'container-title': { type: Type.STRING, description: "The title of the journal, conference proceedings, or book." },
        volume: { type: Type.STRING },
        issue: { type: Type.STRING },
        page: { type: Type.STRING },
        publisher: { type: Type.STRING },
        DOI: { type: Type.STRING },
        URL: { type: Type.STRING },
    },
    required: ["type", "title", "author", "issued"]
};


export const extractCitationMetadata = async (paper: ResearchPaper): Promise<any> => {
    // Start with the basic info we already have
    const initialCsl = {
        type: 'article-journal', // Default, to be overridden by AI
        id: paper.id,
        title: paper.title,
        author: paper.authors.split(',').map(name => {
            const trimmedName = name.trim();
            const parts = trimmedName.split(' ');
            const family = parts.pop() || '';
            const given = parts.join(' ');
            return { given, family };
        }),
        issued: { 'date-parts': [[paper.year]] },
        DOI: paper.doi,
        URL: paper.doi ? undefined : paper.sourceURL, // Prefer DOI over URL
    };


    const prompt = `You are an expert librarian specializing in bibliographic metadata. Your task is to analyze the provided information for a research paper and extract detailed metadata in CSL-JSON format.

    Paper Information:
    - Title: "${paper.title}"
    - Authors: "${paper.authors}"
    - Year: ${paper.year}
    - Abstract: "${paper.abstract}"
    
    Instructions:
    1.  Determine the correct publication type. Common types are 'article-journal', 'paper-conference', 'book-chapter', 'report', 'thesis'.
    2.  If it's a journal article, extract the journal title ('container-title'), volume, issue, and page numbers.
    3.  If it's a conference paper, extract the conference name ('container-title').
    4.  If it is a book chapter, extract the book title ('container-title') and publisher.
    5.  Based on this analysis, complete the provided CSL-JSON object. The 'title', 'author', and 'issued' fields are already provided for you. Focus on correcting the 'type' and adding any other relevant fields you can extract.

    Return only the completed JSON object. Do not include any explanatory text or markdown.
    
    Base JSON to complete:
    ${JSON.stringify(initialCsl, null, 2)}
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: cslSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result) {
            console.warn("AI metadata extraction failed, falling back to basic data for:", paper.title);
            return initialCsl;
        };
        // Ensure essential fields from initialCsl are preserved if AI misses them
        return { ...initialCsl, ...result };
    } catch (error) {
        console.error("Error extracting citation metadata for:", paper.title, error);
        // On error, fall back to the simple, non-AI-enhanced CSL object.
        return initialCsl;
    }
};