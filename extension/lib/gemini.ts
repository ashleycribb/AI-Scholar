// extension/lib/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";
import type { PaperAnalysis, ResearchPaper } from '../../types';
import { findDoiForPaper } from './crossref';
import { findOpenAccessPdf } from './unpaywall';

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const safeJsonParse = (jsonString: string) => {
  try {
    const cleanedString = jsonString.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanedString);
  } catch (e) {
    console.error("Failed to parse JSON:", jsonString, e);
    return null;
  }
};

const summarySchema = {
    type: Type.OBJECT,
    properties: {
        summary: { type: Type.STRING, description: "A concise, one-paragraph summary of the abstract." },
    },
    required: ["summary"],
};

export const summarizeAbstract = async (paper: ResearchPaper): Promise<string> => {
    const prompt = `Based on the following title and abstract, generate a concise, one-paragraph summary suitable for a researcher quickly assessing the paper's relevance.

    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return a single JSON object with a "summary" key.`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: summarySchema,
            },
        });
        const result = safeJsonParse(response.text ?? '');
        return result?.summary || "Could not generate summary.";
    } catch (error) {
        console.error("Error summarizing abstract:", error);
        return "Error generating summary.";
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

export const findOpenAccessVersion = async (paper: ResearchPaper): Promise<string | null> => {
    try {
        const doi = paper.doi || await findDoiForPaper(paper);
        if (doi) {
            const openAccessUrl = await findOpenAccessPdf(doi);
            return openAccessUrl;
        }
        return null;
    } catch (error) {
        console.error("Error finding open access version:", error);
        return null;
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
    const prompt = `You are a research expert. Based on the title and abstract of the following academic paper, generate 5 distinct and insightful search queries that would help a user find related or follow-up research.

    Seed Paper:
    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return your response as a single JSON object with a single key "suggestions", which is an array of strings.`;

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
