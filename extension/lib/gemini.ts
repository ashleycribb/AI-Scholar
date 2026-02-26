// extension/lib/gemini.ts
import { GoogleGenAI, Type } from "@google/genai";
import type { PaperAnalysis, ResearchPaper } from '../../types';
import { findDoiForPaper } from './crossref';
import { findOpenAccessPdf } from './unpaywall';
import {
  paperBasedSuggestionsSchema,
  generatePaperBasedSuggestionsPrompt,
  paperAnalysisSchema,
  analyzeSinglePaperPrompt
} from "../../services/promptTemplates";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

export const analyzeSinglePaper = async (paper: ResearchPaper): Promise<PaperAnalysis> => {
    const prompt = analyzeSinglePaperPrompt(paper);
    
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

export const generatePaperBasedSuggestions = async (paper: ResearchPaper): Promise<string[]> => {
    const prompt = generatePaperBasedSuggestionsPrompt(paper);

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
