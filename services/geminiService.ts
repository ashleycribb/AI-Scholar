
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
  VerificationStatus,
  GroundingSource
} from "../types";
import * as crossrefService from './crossrefService';

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

const searchQueryEnhancementSchema = {
    type: Type.OBJECT,
    properties: {
        refined_query: { type: Type.STRING },
        key_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
    required: ["refined_query", "key_concepts"],
};

export const enhanceSearchQuery = async (userQuery: string): Promise<EnhancedQuery> => {
    const prompt = `You are an expert research librarian specializing in academic databases. Your task is to take a user's research query and transform it into a highly effective, structured search query for a database like OpenAlex.

    User Query: "${userQuery}"

    Analyze the query to identify its core concepts. Generate synonyms, alternative phrasings, and common acronyms for these concepts. Then, construct a refined search query string that uses boolean operators (AND, OR) and phrase searching (using double quotes) to maximize relevance.

    Return your response as a single JSON object with the following structure. Do not include any text, code blocks, or explanations outside of the JSON object.

    {
      "refined_query": "The structured query string you constructed.",
      "key_concepts": ["An array of the primary concepts identified."]
    }

    Example:
    User Query: "using machine learning for sentiment analysis in social media"
    Your JSON response:
    {
      "refined_query": "(\\"machine learning\\" OR \\"deep learning\\" OR \\"NLP\\") AND (\\"sentiment analysis\\" OR \\"opinion mining\\") AND (\\"social media\\" OR \\"twitter\\" OR \\"facebook\\")",
      "key_concepts": ["machine learning", "sentiment analysis", "social media"]
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

export const generateSearchSuggestions = async (query: string): Promise<string[]> => {
  if (query.trim().length < 5) {
    return [];
  }
  try {
    const prompt = `Generate 4 search query suggestions for a research paper search engine, based on the following query. The suggestions should be diverse and explore different facets of the topic. Return only a bulleted list of suggestions.
    Query: "${query}"`;

    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });

    const suggestions = (response.text ?? '').split('\n')
      .map(s => s.replace(/[-*]\s*/, '').trim())
      .filter(s => s.length > 0);
      
    return suggestions;
  } catch (error) {
    console.error("Error generating search suggestions:", error);
    return [];
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
    papers: ResearchPaper[],
    location: { latitude: number; longitude: number } | null
): Promise<{ text: string, sources: GroundingSource[] }> => {
    const paperContext = papers.map((p, i) => `[Paper ${i+1}] ${p.title}\n${p.abstract}`).join('\n\n');
    
    const systemInstruction = `You are a helpful research assistant. The user is asking questions about a set of research papers.
    Your knowledge is limited to the provided papers. Answer the user's questions based *only* on the information in the abstracts below.
    If the answer cannot be found in the papers, say that you cannot answer based on the provided information. Be concise.
    You can also answer general questions or location-based questions if the user asks them.

    Reference Papers:
    ${paperContext}`;

    // FIX: Replaced `findLast` with a compatible alternative (`.reverse().find()`) to support older TS/JS versions.
    const lastUserMessage = [...history].reverse().find(m => m.role === 'user')?.parts[0].text.toLowerCase() || '';
    const isLocationQuery = ['nearby', 'where is', 'directions to', 'restaurants near', 'coffee shops', 'map of'].some(kw => lastUserMessage.includes(kw));

    const config: any = { systemInstruction };
    if (isLocationQuery && location) {
        config.tools = [{ googleMaps: {} }];
        config.toolConfig = {
            retrievalConfig: {
                latLng: {
                    latitude: location.latitude,
                    longitude: location.longitude
                }
            }
        };
    }
    
    try {
        const contents = history.map(msg => ({
            role: msg.role,
            parts: msg.parts
        }));

        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents,
            config
        });
        
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
        const sources: GroundingSource[] = groundingChunks
            .filter((chunk: any) => chunk.maps)
            .map((chunk: any) => ({
                title: chunk.maps.title,
                uri: chunk.maps.uri,
            }));

        return { text: response.text ?? '', sources };
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

export const verifyPaper = async (paper: ResearchPaper): Promise<VerificationStatus> => {
    // Step 1: Attempt verification with Crossref first for a reliable, structured result.
    try {
        const crossrefResult = await crossrefService.fetchPaperFromCrossref(paper);
        if (crossrefResult) {
            // Find a direct PDF link if available from Crossref's link-walking service
            const pdfLink = crossrefResult.link?.find((l) => l['content-type'] === 'application/pdf');
            const sourceUrl = crossrefResult.URL || (crossrefResult.DOI ? `https://doi.org/${crossrefResult.DOI}` : undefined);
            
            return {
                state: 'verified',
                source: 'Crossref',
                linkState: pdfLink ? 'valid' : 'unchecked',
                pdfURL: pdfLink?.URL || sourceUrl, // Prioritize the direct PDF link
            };
        }
    } catch (error) {
        console.warn("Crossref verification failed or returned no match. Proceeding to web search.", error);
    }

    // Step 2: If Crossref fails or finds no match, fall back to the Gemini-powered web search.
    const prompt = `You are a meticulous research assistant. Verify the existence and accessibility of the following academic paper using a web search. Your primary goal is to find a freely accessible PDF. A lookup in the Crossref database was inconclusive, so a broader search is needed.

    Paper Details:
    - Title: "${paper.title}"
    - Authors: "${paper.authors}"
    - Provided URL: ${paper.sourceURL || 'N/A'}
    
    Verification Steps:
    1.  **Confirm Existence:** Use Google Scholar first to confirm the paper's existence. Note the primary source (e.g., Google Scholar, arXiv, Publisher's website).
    2.  **Validate Provided URL:** If a URL was provided, analyze search results to determine its status. Is it a direct link to the paper, a 404 page, or something else?
    3.  **Find Free PDF:** Actively search for a direct, publicly accessible PDF link. Look for links from university repositories, arXiv, or author homepages.
    4.  **Detect Paywalls:** If the primary link leads to a publisher's page that requires payment or a subscription to access the full text, and no free alternative PDF is found, classify it as paywalled.
    5.  **Format Response:** Respond with a single JSON object. Do not include any other text or markdown.
    
    JSON Response Schema:
    - "state": One of "verified", "not_found", "error".
    - "source": The best source found (e.g., "Google Scholar", "arXiv", "Publisher Site").
    - "linkState": The status of the paper's accessibility. One of "valid" (free PDF found), "paywalled" (verified existence but PDF is behind a paywall), "invalid" (provided link is broken/404), "unchecked".
    - "pdfURL": The direct URL to the free PDF, ONLY if "linkState" is "valid".
    - "reason": A brief explanation for "not_found", "error", or "paywalled" states.
    
    Example Responses:
    - Free PDF found: { "state": "verified", "source": "arXiv", "linkState": "valid", "pdfURL": "https://arxiv.org/pdf/1234.5678.pdf" }
    - Paywalled: { "state": "verified", "source": "Elsevier", "linkState": "paywalled", "reason": "Paper is available on the publisher's site but requires a subscription to access the full text." }
    - Broken Link, but PDF found elsewhere: { "state": "verified", "source": "Google Scholar", "linkState": "invalid", "pdfURL": "https://university.edu/repo/paper.pdf", "reason": "The original link was broken, but an alternative free PDF was found." }
    - Not Found: { "state": "not_found", "reason": "Could not find a reliable source for this paper via web search." }
    `;
    
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });
        
        const result = safeJsonParse(response.text ?? '');
        if (!result || !result.state) return { state: 'error', reason: 'Invalid API response for verification.' };
        return result as VerificationStatus;
    } catch (error) {
        console.error("Error verifying paper:", error);
        return { state: 'error', reason: 'An error occurred during verification.' };
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
