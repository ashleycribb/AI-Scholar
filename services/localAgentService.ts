import type { ResearchPaper } from '../types';
import { csrfFetch } from './csrf';
import { accessMessage } from './apiErrors';

export type VaultAccess = 'ok' | 'signed_out' | 'forbidden' | 'error';

/** Lists the vault. `access` says why the list is empty when the server refused (needs a signed-in researcher). */
export const getVaultFilesResult = async (): Promise<{ files: string[]; access: VaultAccess }> => {
    try {
        const response = await fetch('/api/local/vault', { credentials: 'same-origin' });
        if (response.status === 401) return { files: [], access: 'signed_out' };
        if (response.status === 403) return { files: [], access: 'forbidden' };
        if (!response.ok) return { files: [], access: 'error' };
        const files = await response.json();
        return { files: Array.isArray(files) ? files : [], access: 'ok' };
    } catch (e) {
        console.error("Failed to fetch vault files", e);
        return { files: [], access: 'error' };
    }
};

export const getVaultFiles = async (): Promise<string[]> => (await getVaultFilesResult()).files;

export const verifyPaperWithLogician = async (fileName: string): Promise<string> => {
    try {
        // Needs a signed-in researcher session (+ CSRF token); answers 401/403 otherwise.
        const response = await csrfFetch('/api/local/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath: fileName })
        });

        const refused = accessMessage(response.status, 'researcher');
        if (refused) return refused;
        if (!response.ok) throw new Error("Verification failed");
        const data = await response.json();
        return data.output;
    } catch (e) {
        console.error("Verification failed", e);
        return "Internal Error: Could not trigger Logician Nanobot.";
    }
};
