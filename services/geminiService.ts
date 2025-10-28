
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
  GroundingSource
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

export const generateHypotheticalAnswer = async (userQuery: string): Promise<string> => {
    const prompt = `You are an expert academic researcher. A user has provided a research question. Your task is to generate a concise, hypothetical abstract for a non-existent paper that would be the *perfect* answer to their question. This abstract will be used to find real papers that are semantically similar to it.

    **CRITICAL INSTRUCTIONS:**
    1.  **Directly Answer:** The abstract must directly address and answer the user's question.
    2.  **Use Academic Language:** Write in a formal, academic style, incorporating relevant keywords and concepts from the user's query domain.
    3.  **Be Factual and Plausible:** The content should be plausible and sound like a real research summary. Do not use phrases like "In this hypothetical paper...".
    4.  **Keep it Concise:** The abstract should be around 150-250 words.

    **User's Research Question:** "${userQuery}"

    Return your response as a single JSON object with a single key "hypothetical_abstract". Do not include any other text or markdown.

    **Example:**
    User Question: "What is the impact of using large language models on the quality of scientific literature reviews?"
    Your JSON Response:
    {
      "hypothetical_abstract": "This study investigates the impact of Large Language Models (LLMs) on the quality and efficiency of scientific literature reviews. We conducted a comparative analysis of reviews produced by human researchers versus those augmented by state-of-the-art LLMs like GPT-4. Quality was assessed using metrics such as comprehensiveness, bias detection, and synthesis accuracy. Our findings indicate that LLM-assisted reviews are completed approximately 40% faster and demonstrate a 15% increase in comprehensiveness by identifying a broader range of relevant studies. However, we also identified a novel 'automation bias,' where researchers tended to over-rely on the LLM's initial filtering, potentially missing nuanced or conflicting studies. We conclude that while LLMs are powerful tools for accelerating literature synthesis, they require structured human oversight to mitigate inherent biases and ensure high-quality, reliable scientific conclusions."
    }`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: hypotheticalAnswerSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
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

// FIX: Implement extractKeyConcepts to resolve error in App.tsx
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
    const prompt = `Based on the following academic abstract, extract the 5 most important key concepts, terms, or phrases.
    
    Abstract: "${abstract}"

    Return your response as a single JSON object with a single key "concepts", which is an array of strings. Do not include any other text or markdown.

    Example:
    {
        "concepts": [
            "Large Language Models (LLMs)",
            "Scientific Literature Reviews",
            "Automation Bias",
            "Comprehensiveness",
            "Synthesis Accuracy"
        ]
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
        throw new Error("Failed to extract key concepts from the abstract.");
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

// FIX: Implement analyzeSinglePaper to resolve error in App.tsx
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

// FIX: Implement analyzeResearchGaps to resolve error in App.tsx
export const analyzeResearchGaps = async (papers: ResearchPaper[]): Promise<string> => {
    const paperContext = papers.map((p, i) => `[Paper ${i+1}] Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `You are an expert research analyst. Based on the provided abstracts from several research papers, identify and articulate the potential research gaps, contradictions, or areas for future investigation. Structure your response as a formal report in Markdown.

    **Instructions:**
    1.  **Introduction:** Briefly summarize the general theme connecting the papers.
    2.  **Identified Gaps:** Create a section titled "## Potential Research Gaps" and list the identified gaps as bullet points. For each gap, explain the reasoning based on the provided abstracts.
    3.  **Contradictions:** If any contradictions or diverging results are apparent, create a section titled "## Apparent Contradictions" and detail them.
    4.  **Future Directions:** Create a section titled "## Future Research Directions" suggesting specific studies or questions that could address the identified gaps.
    5.  **Conclusion:** Provide a brief concluding summary.
    6.  **Formatting:** Use Markdown for headings (##) and bullet points (*).

    **Provided Papers:**
    ${paperContext}

    **Report:**
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-pro", // Use a more powerful model for this complex task
            contents: prompt,
        });
        return response.text ?? 'No research gaps could be identified.';
    } catch (error) {
        console.error("Error analyzing research gaps:", error);
        throw new Error("Failed to generate research gap analysis.");
    }
};

// FIX: Implement synthesizePapers to resolve error in App.tsx
const synthesisSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            title: { type: Type.STRING },
            mainFinding: { type: Type.STRING },
            methodology: { type: Type.STRING },
            context: { type: Type.STRING, description: "The context or sample population of the study (e.g., 'University students', 'Clinical trial patients')." },
        },
        required: ["title", "mainFinding", "methodology", "context"],
    },
};

export const synthesizePapers = async (papers: ResearchPaper[]): Promise<SynthesisResult> => {
    const paperContext = papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

    const prompt = `You are a research assistant. Based on the provided list of research paper abstracts, synthesize the key information for each paper into a structured table format. For each paper, extract the following:
    1.  **title**: The original title of the paper.
    2.  **mainFinding**: A concise summary of the primary result or conclusion.
    3.  **methodology**: A brief description of the method used (e.g., "Systematic Review", "RCT", "Qualitative Survey").
    4.  **context**: The context or sample population of the study (e.g., "350 undergraduate students", "fMRI data from 20 participants").

    **Papers to Synthesize:**
    ${paperContext}

    Return your response as a single JSON array of objects, where each object represents a paper. Do not include any other text or markdown.
    `;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: synthesisSchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        if (!result) throw new Error("Failed to parse synthesis response.");
        return result;
    } catch (error) {
        console.error("Error synthesizing papers:", error);
        throw new Error("Failed to synthesize the provided papers.");
    }
};

// FIX: Implement extractCitationMetadata to resolve error in citationService.ts
const cslSchema = {
    type: Type.OBJECT,
    properties: {
        "type": { type: Type.STRING, description: "The type of the work, e.g., 'article-journal'." },
        "title": { type: Type.STRING },
        "author": { 
            type: Type.ARRAY, 
            items: { 
                type: Type.OBJECT,
                properties: {
                    given: { type: Type.STRING },
                    family: { type: Type.STRING }
                },
                required: ["family"]
            } 
        },
        "issued": { 
            type: Type.OBJECT,
            properties: {
                "date-parts": { 
                    type: Type.ARRAY,
                    items: {
                        type: Type.ARRAY,
                        items: { type: Type.NUMBER }
                    }
                }
            },
            required: ["date-parts"]
        },
        "container-title": { type: Type.STRING, description: "The name of the journal or publication." },
        "URL": { type: Type.STRING },
        "DOI": { type: Type.STRING }
    },
    required: ["type", "title", "author", "issued"]
};

export const extractCitationMetadata = async (paper: ResearchPaper): Promise<any> => {
    const prompt = `You are a bibliographic expert. Based on the provided research paper metadata, extract the information and format it as a CSL-JSON object.
    
    **Instructions:**
    1.  Parse the author names into 'given' and 'family' parts. If only one name is present, use it as 'family'.
    2.  The 'issued' date-part should be an array containing a single array with just the year, like [[${paper.year}]].
    3.  Set the 'type' to 'article-journal'.
    4.  Include 'container-title' if a journal name can be inferred, otherwise omit it.
    5.  Include 'URL' and 'DOI' if available.

    **Paper Metadata:**
    Title: ${paper.title}
    Authors: ${paper.authors}
    Year: ${paper.year}
    Source URL: ${paper.sourceURL}
    DOI: ${paper.doi}

    Return a single, valid CSL-JSON object. Do not include any other text or markdown.
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
            // Fallback for safety
            return {
                type: 'article-journal',
                title: paper.title,
                author: paper.authors.split(',').map(name => ({ family: name.trim() })),
                issued: { 'date-parts': [[paper.year]] },
                URL: paper.sourceURL,
                DOI: paper.doi
            };
        }
        return result;
    } catch (error) {
        console.error("Error extracting citation metadata:", error);
        throw new Error("Failed to extract metadata for citation generation.");
    }
};

const databaseFinderSchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            id: { type: Type.STRING, description: "A unique ID for the database, e.g., 'pubmed' or 'scopus'" },
            name: { type: Type.STRING, description: "The full name of the database, e.g., 'PubMed Central'" },
            description: { type: Type.STRING, description: "A one-sentence description of the database's focus." },
        },
        required: ['id', 'name', 'description'],
    }
};

// FIX: Implement findDatabasesForField to resolve error in App.tsx
export const findDatabasesForField = async (fieldOfStudy: string): Promise<SearchSourceInfo[]> => {
    const prompt = `You are an expert academic librarian. For the given field of study, recommend the top 5 most relevant and reputable academic databases or search engines.
    
    Field of Study: "${fieldOfStudy}"

    Provide a unique ID, the database name, and a concise one-sentence description for each.
    Return your response as a single JSON array of objects. Do not include any other text or markdown.

    Example for "Computer Science":
    [
      { "id": "acm_dl", "name": "ACM Digital Library", "description": "A comprehensive collection of articles and conference proceedings from the Association for Computing Machinery." },
      { "id": "ieee_xplore", "name": "IEEE Xplore", "description": "Provides access to technical literature in electrical engineering, computer science, and electronics." },
      { "id": "dblp", "name": "DBLP Computer Science Bibliography", "description": "An online reference for bibliographic information on major computer science publications." },
      { "id": "scopus", "name": "Scopus", "description": "A large abstract and citation database of peer-reviewed literature: scientific journals, books and conference proceedings." },
      { "id": "google_scholar", "name": "Google Scholar", "description": "A freely accessible web search engine that indexes the full text or metadata of scholarly literature." }
    ]
    `;

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
        if (!result) throw new Error("Could not parse database finder response.");
        return result;
    } catch (error) {
        console.error("Error finding databases:", error);
        throw new Error("Failed to find academic databases for the specified field.");
    }
};
