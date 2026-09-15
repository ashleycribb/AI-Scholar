
import type { ResearchPaper } from '../types';

export const getVaultFiles = async (): Promise<string[]> => {
    try {
        const response = await fetch('/api/local/vault');
        if (!response.ok) return [];
        return await response.json();
    } catch (e) {
        console.error("Failed to fetch vault files", e);
        return [];
    }
};

export const verifyPaperWithLogician = async (fileName: string): Promise<string> => {
    try {
        const response = await fetch('/api/local/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: fileName })
        });
        
        if (!response.ok) throw new Error("Verification failed");
        const data = await response.json();
        return data.output;
    } catch (e) {
        console.error("Verification failed", e);
        return "Internal Error: Could not trigger Logician Nanobot.";
    }
};
