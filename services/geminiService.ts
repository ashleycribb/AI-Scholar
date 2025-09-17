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
    - For each paper, you MUST provide: Title, Authors, Year, and Summary.
    - Each field MUST start with a specific label in bold followed by a colon (e.g., "**Title:**", "**Authors:**", "**Year:**", "**Summary:**").
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

export const generateCitations = async (sources: Source[]): Promise<string[]> => {
    const sourceList = sources.map(s => `Title: ${s.title}\nURL: ${s.uri}`).join('\n---\n');

    const prompt = `
        You are an expert academic librarian. I will provide a list of web sources, each with a title and a URL.
        Your task is to generate a full citation for each source in APA 7th edition format.
        If a source appears to be a PDF of a research paper, format it as a journal article citation. If it's a webpage, format it as a webpage citation.
        You must retrieve any missing information (like authors, publication date, journal name) from the URL to create a complete citation.
        Return the result as a JSON array of strings, where each string is a complete, formatted citation.
        
        Here are the sources:
        ${sourceList}
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