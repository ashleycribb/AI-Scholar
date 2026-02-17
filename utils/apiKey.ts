
import { GoogleGenAI } from "@google/genai";

export const getApiKey = (): string | null => {
    return localStorage.getItem('GEMINI_API_KEY');
};

export const setApiKey = (key: string) => {
    localStorage.setItem('GEMINI_API_KEY', key);
};

export const clearApiKey = () => {
    localStorage.removeItem('GEMINI_API_KEY');
};

export const getAiClient = (): GoogleGenAI => {
    const apiKey = getApiKey();
    if (!apiKey) {
        throw new Error("Gemini API Key is missing. Please provide it in settings.");
    }
    return new GoogleGenAI({ apiKey });
};
