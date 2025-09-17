import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { Source, GroundingChunk, SummaryLength, ResearchPaper, AnalysisResult, SearchSource, AdvancedSearchOptions, SummaryStyle } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

export const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const model = 'gemini-2.5-flash';

// Custom Error classes for more specific error handling
export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string = "You've exceeded the request rate limit. Please wait a moment and try again.") {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class ServerError extends ApiError {
  constructor(message: string = "The research service is currently experiencing issues. Please try again later.") {
    super(message);
    this.name = 'ServerError';
  }
}

export class ParsingError extends Error {
  constructor(message: string = "Failed to parse the response from the AI model. The format might be unexpected.") {
    super(message);
    this.name = 'ParsingError';
  }
}

const handleApiError = (error: unknown, context: string): never => {
  console.error(`Error during ${context}:`, error);

  if (error instanceof Error) {
    if (error.message.includes('429') || error.message.toLowerCase().includes('rate limit')) {
      throw new RateLimitError();
    }
    // Check for 5xx server errors
    if (/5\d{2}/.test(error.message) || error.message.toLowerCase().includes('server error')) {
      throw new ServerError();
    }
    throw new ApiError(`An issue occurred while ${context}: ${error.message}`);
  }
  
  throw new ApiError(`An unknown error occurred while ${context}.`);
};

const getSummaryInstruction = (length: SummaryLength): string => {
  switch (length) {
    case 'short':
      return 'The summary should be a single, concise sentence highlighting the main conclusion.';
    case 'detailed':
      return "The summary should be a detailed paragraph (5-7 sentences) covering the paper's background, methodology, key findings, and implications.";
    case 'medium':
    default:
      return 'The summary should be a concise paragraph (3-4 sentences) explaining the key findings.';
  }
};

const getSummaryStyleInstruction = (style: SummaryStyle): string => {
    switch (style) {
      case 'bullets':
        return 'The summary MUST be a bulleted list of the key findings and takeaways, starting each line with a hyphen (-).';
      case 'qa':
        return 'The summary MUST be in a Question & Answer format, with 2-3 key questions the paper answers, followed by their concise answers. Start questions with "Q:" and answers with "A:".';
      case 'paragraph':
      default:
        return ''; // The length instruction already implies a paragraph format.
    }
};

const getSourceInstruction = (source: SearchSource): string => {
  switch (source) {
    case 'google_scholar':
      return 'You MUST prioritize results from Google Scholar (scholar.google.com).';
    case 'jstor':
      return 'You MUST prioritize results from JSTOR (jstor.org).';
    case 'pubmed':
      return 'You MUST prioritize results from PubMed (pubmed.ncbi.nlm.nih.gov).';
    case 'arxiv':
      return 'You MUST prioritize results from arXiv (arxiv.org).';
    case 'general':
    default:
      return 'You should perform a general web search, but prioritize finding academic and peer-reviewed sources.';
  }
};

const buildAdvancedSearchPrompt = (options: AdvancedSearchOptions): string => {
    let promptPart = '';
    const { startYear, endYear, authors, excludeKeywords } = options;
  
    if (startYear && endYear) {
      promptPart += `\n- The papers MUST be published between ${startYear} and ${endYear}.`;
    } else if (startYear) {
      promptPart += `\n- The papers MUST be published in or after ${startYear}.`;
    } else if (endYear) {
      promptPart += `\n- The papers MUST be published in or before ${endYear}.`;
    }
  
    if (authors) {
      promptPart += `\n- The papers MUST include at least one of the following authors: "${authors}".`;
    }
  
    if (excludeKeywords) {
      promptPart += `\n- The search results MUST NOT include papers primarily about the following keywords: "${excludeKeywords}".`;
    }
    
    return promptPart;
};

export const fetchResearchPapers = async (userQuery: string, summaryLength: SummaryLength, summaryStyle: SummaryStyle, searchSource: SearchSource, advancedOptions: AdvancedSearchOptions): Promise<{ text: string; sources: Source[] } | null> => {
  const summaryInstruction = getSummaryInstruction(summaryLength);
  const sourceInstruction = getSourceInstruction(searchSource);
  const advancedSearchInstruction = buildAdvancedSearchPrompt(advancedOptions);
  const summaryStyleInstruction = getSummaryStyleInstruction(summaryStyle);

  const prompt = `
    You are an expert academic research assistant for a doctoral student. 
    Your task is to find and summarize 5 highly relevant academic papers based on the user's query and the following constraints.
    ${sourceInstruction}

    USER QUERY: "${userQuery}"

    CONSTRAINTS:${advancedSearchInstruction || '\n- None.'}

    FORMATTING RULES:
    - For each paper, you MUST provide: Title, Authors, Year, SourceURL, and Summary.
    - The **SourceURL:** MUST be the direct URL to the paper's landing page (e.g., on arXiv, ACM Digital Library, publisher's site) from the search results.
    - Each field MUST start with a specific label in bold followed by a colon (e.g., "**Title:**", "**Authors:**", "**Year:**", "**SourceURL:**", "**Summary:**").
    - Each field MUST be on a new line.
    - ${summaryInstruction} ${summaryStyleInstruction}
    - You MUST separate each paper's entry with the exact delimiter "---" on its own line.
    - Do NOT include any introductory or concluding text outside of this structured format.
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });
    
    const text = response.text;
    const groundingChunks: GroundingChunk[] = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];

    const sources: Source[] = groundingChunks.reduce<Source[]>((acc, chunk) => {
      if (chunk.web && chunk.web.uri && chunk.web.title) {
        acc.push({ uri: chunk.web.uri, title: chunk.web.title });
      }
      return acc;
    }, []);

    return { text, sources };

  } catch (error) {
    handleApiError(error, "fetching research papers");
  }
};

export const analyzeAndClusterPapers = async (papers: ResearchPaper[]): Promise<AnalysisResult> => {
  const paperTexts = papers.map(p => `Title: ${p.title}\nSummary: ${p.summary}`).join('\n---\n');

  const prompt = `
    You are a research analyst. I will provide you with a list of research paper titles and their summaries.
    Your task is to perform a clustering analysis on these papers.
    
    Instructions:
    1. Group the papers into 2-4 distinct clusters based on the similarity of their summaries.
    2. For each cluster, create a short, descriptive theme name (2-5 words).
    3. Return a JSON object containing the clusters. Each cluster must list the exact titles of the papers belonging to it.
    
    Here are the papers:
    ${paperTexts}
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
      model: model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            clusters: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  theme: { type: Type.STRING },
                  papers: { 
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  },
                },
                required: ["theme", "papers"],
              },
            },
          },
          required: ["clusters"],
        },
      },
    });

    return JSON.parse(response.text) as AnalysisResult;

  } catch (error) {
    if (error instanceof SyntaxError) {
        console.error("Error parsing JSON for clustering analysis:", error);
        throw new ParsingError('The analysis data returned by the model was not valid JSON.');
    }
    handleApiError(error, 'performing cluster analysis');
  }
};

export const generateCitations = async (papers: ResearchPaper[]): Promise<string[]> => {
    const paperList = papers.map(p => `Title: ${p.title}\nAuthors: ${p.authors}`).join('\n---\n');

    const prompt = `
        You are an expert academic librarian. I will provide a list of papers with their titles and authors.
        Your task is to generate a full citation for each paper in APA 7th edition format. You will likely need to infer details like the publication year and journal based on the title and authors.

        For each citation, format it as a single HTML string.
        The citation text should be standard text. If the citation includes a URL (like a DOI link), that specific URL part MUST be wrapped in an \`<a>\` tag.
        The \`<a>\` tag MUST have \`target="_blank"\`, \`rel="noopener noreferrer"\`, and \`class="text-blue-600 hover:text-blue-800 hover:underline"\`.

        If the generated citation does not naturally include a URL, you MUST append a "View on Google Scholar" link at the end of the citation. This link must also be an \`<a>\` tag with the same attributes, and its \`href\` must be a URL-encoded Google Scholar search link for the paper's title.

        Example with a DOI:
        \`Author, A. A. (Year). Title of article. *Title of Periodical, volume*(issue), pages. <a href="https://doi.org/xxxx" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline">https://doi.org/xxxx</a>\`

        Example without a DOI (fallback to Google Scholar):
        \`Author, A. A., & Author, B. B. (Year). Title of book. Publisher. <a href="https://scholar.google.com/scholar?q=Title%20of%20book" target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:text-blue-800 hover:underline">View on Google Scholar</a>\`

        Return the result as a JSON object with a "citations" key containing an array of these HTML strings.

        Here are the papers:
        ${paperList}
    `;

    try {
        const response: GenerateContentResponse = await ai.models.generateContent({
            model: model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        citations: {
                            type: Type.ARRAY,
                            items: { type: Type.STRING }
                        }
                    },
                    required: ["citations"]
                }
            }
        });

        const result = JSON.parse(response.text);
        return result.citations as string[];

    } catch (error) {
        if (error instanceof SyntaxError) {
            console.error("Error parsing JSON for citations:", error);
            throw new ParsingError('The citation data returned by the model was not valid JSON.');
        }
        handleApiError(error, 'generating citations');
    }
};

export const generateSearchSuggestions = async (query: string): Promise<string[]> => {
    if (query.trim().length < 5) {
      return [];
    }
  
    const prompt = `
      Based on the academic research topic "${query}", generate 5 related search query suggestions that a doctoral student might find useful. 
      These suggestions should be concise and relevant for searching academic databases like Google Scholar.
      Return the result as a JSON object with a "suggestions" key containing an array of strings.
    `;
  
    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              suggestions: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["suggestions"]
          }
        }
      });
  
      const result = JSON.parse(response.text);
      return result.suggestions as string[] || [];
  
    } catch (error) {
      console.error("Error generating search suggestions:", error);
      // Return empty array on error to prevent UI breaking
      return [];
    }
  };