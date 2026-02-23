import { GoogleGenAI, Type } from "@google/genai";
import type { ModelDefinition, ResearchPaper } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export interface ImplementationPlan {
    overview: string;
    fileStructure: {
        path: string;
        description: string;
    }[];
    dependencies: string[];
    steps: {
        stepNumber: number;
        title: string;
        instruction: string;
    }[];
}

const implementationPlanSchema = {
    type: Type.OBJECT,
    properties: {
        overview: { type: Type.STRING, description: "A high-level summary of the proposed implementation strategy." },
        fileStructure: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    path: { type: Type.STRING, description: "The file path (e.g., 'src/model.py')." },
                    description: { type: Type.STRING, description: "What this file should contain." }
                },
                required: ["path", "description"]
            }
        },
        dependencies: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "List of libraries or packages required (e.g., 'torch', 'transformers')."
        },
        steps: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    stepNumber: { type: Type.NUMBER },
                    title: { type: Type.STRING },
                    instruction: { type: Type.STRING, description: "Detailed instruction for this step." }
                },
                required: ["stepNumber", "title", "instruction"]
            }
        }
    },
    required: ["overview", "fileStructure", "dependencies", "steps"]
};

export const generateImplementationPlan = async (paper: ResearchPaper, modelDef: ModelDefinition): Promise<ImplementationPlan> => {
    const prompt = `You are an expert Research Engineer. Your goal is to plan a code implementation for the following research paper based on its abstract and title.

    **Paper Title:** ${paper.title}
    **Abstract:** ${paper.abstract}

    **Task:**
    Create a practical, step-by-step plan to reproduce the key results or implement the core methodology described.
    1.  Propose a clean, modular file structure.
    2.  List necessary dependencies (Python/PyTorch preferred unless context implies otherwise).
    3.  Outline the logical steps to build the system (e.g., Data Prep -> Model Arch -> Training -> Eval).

    Return a structured JSON object.`;

    try {
        const response = await ai.models.generateContent({
            model: modelDef.id,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: implementationPlanSchema,
            },
        });

        const text = response.text;
        if (!text) throw new Error("No response generated");

        return JSON.parse(text) as ImplementationPlan;

    } catch (error) {
        console.error("Error generating implementation plan:", error);
        throw new Error("Failed to generate implementation plan.");
    }
};
