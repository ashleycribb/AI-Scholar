import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import type { Source, GroundingChunk, SummaryLength, ResearchPaper, AnalysisResult } from '../types';

if (!process.env.API_KEY) {
  throw new Error("API_KEY environment variable is not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const model = 'gemini-2.5-flash';

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

export const fetchResearchPapers = async (userQuery: string, summaryLength: SummaryLength): Promise<{ text: string; sources: Source[] } | null> => {
  const summaryInstruction = getSummaryInstruction(summaryLength);

  const prompt = `
    You are an expert academic research assistant for a doctoral student. 
    Your task is to find and summarize 5 highly relevant academic papers from sources like Google Scholar based on the user's query.

    USER QUERY: "${userQuery}"

    FORMATTING RULES:
    - For each paper, you MUST provide: Title, Authors, Year, SourceURL, and Summary.
    - The **SourceURL:** MUST be the direct URL to the paper's landing page (e.g., on arXiv, ACM Digital Library, publisher's site) from the search results.
    - Each field MUST start with a specific label in bold followed by a colon (e.g., "**Title:**", "**Authors:**", "**Year:**", "**SourceURL:**", "**Summary:**").
    - Each field MUST be on a new line.
    - ${summaryInstruction}
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
    console.error("Error fetching from Gemini API:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred while communicating with the Gemini API.");
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
    console.error("Error during clustering analysis:", error);
    if (error instanceof Error) {
        throw new Error(`Gemini API Error during analysis: ${error.message}`);
    }
    throw new Error("An unknown error occurred during the clustering analysis.");
  }
};

export const generateCitations = async (papers: ResearchPaper[]): Promise<string[]> => {
    const paperList = papers.map(p => `Title: ${p.title}\nAuthors: ${p.authors}`).join('\n---\n');

    const prompt = `
        You are an expert academic librarian. I will provide a list of papers with their titles and authors.
        Your task is to generate a full citation for each paper in APA 7th edition format. You will likely need to infer details like the publication year and journal, which you should do based on the title and authors.
        Each citation MUST be formatted as a single HTML string:
        1. The entire citation text must be wrapped in an \`<a>\` tag.
        2. The \`href\` attribute must be a URL-encoded Google Scholar search link for the paper's title. (e.g., href="https://scholar.google.com/scholar?q=...")
        3. The \`<a>\` tag MUST include target="_blank", rel="noopener noreferrer", and class="text-blue-600 hover:text-blue-800 hover:underline".
        
        Return the result as a JSON array of these HTML strings.

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
        console.error("Error generating citations:", error);
        if (error instanceof Error) {
            throw new Error(`Gemini API Error during citation generation: ${error.message}`);
        }
        throw new Error("An unknown error occurred while generating citations.");
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