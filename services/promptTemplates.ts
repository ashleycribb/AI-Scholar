import { Type } from "@google/genai";
import { ResearchPaper } from "../types";

export const paperBasedSuggestionsSchema = {
    type: Type.OBJECT,
    properties: {
        suggestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "An array of 5 distinct and insightful search queries."
        },
    },
    required: ["suggestions"],
};

export const generatePaperBasedSuggestionsPrompt = (paper: ResearchPaper): string => {
    return `You are a research expert. Based on the title and abstract of the following academic paper, generate 5 distinct and insightful search queries that would help a user find related or follow-up research.

    Seed Paper:
    Title: "${paper.title}"
    Abstract: "${paper.abstract}"

    Return your response as a single JSON object with a single key "suggestions", which is an array of strings.`;
};

export const paperAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        researchQuestion: { type: Type.STRING, description: "The primary research question or objective of the paper." },
        methodology: { type: Type.STRING, description: "A brief description of the methodology used." },
        keyFindings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of the key findings or results." },
        limitations: { type: Type.ARRAY, items: { type: Type.STRING }, description: "A list of potential limitations mentioned or implied." },
    },
    required: ["researchQuestion", "methodology", "keyFindings", "limitations"],
};

export const analyzeSinglePaperPrompt = (paper: ResearchPaper): string => {
    return `Perform a structured analysis of the following research paper based on its title and abstract.

    **Title:** ${paper.title}
    **Abstract:** ${paper.abstract}

    Extract the following information:
    1.  The primary research question or objective.
    2.  The methodology used.
    3.  A bulleted list of key findings.
    4.  A bulleted list of potential limitations mentioned or implied.

    Return the result as a JSON object.`;
};
