
import type { ResearchPaper, SciteTally } from '../types';

export interface SciteNotice {
    doi: string;
    type: 'retraction' | 'correction' | 'expression_of_concern' | 'withdrawal';
    url: string;
}

function readCount(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Only return a tally when supporting and contrasting are real numbers (0 is allowed; missing is not filled in as 0). */
function tallyFromPayload(doi: string, data: any): SciteTally | null {
    const supporting = readCount(data?.supporting);
    const contrasting = readCount(data?.contrasting);
    if (supporting === null || contrasting === null) return null;
    const mentioning = readCount(data?.mentioning);
    const total = readCount(data?.total);
    return {
        doi: typeof data?.doi === 'string' && data.doi ? data.doi : doi,
        supporting,
        contrasting,
        mentioning: mentioning ?? 0,
        total: total ?? (supporting + contrasting + (mentioning ?? 0)),
    };
}

class SciteService {
    private baseUrl = 'https://api.scite.ai';

    /**
     * Fetches citation tallies for a given DOI.
     */
    public async getTally(doi: string): Promise<SciteTally | null> {
        if (!doi) return null;
        
        try {
            const response = await fetch(`${this.baseUrl}/tallies/${doi}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error(`Scite API error: ${response.statusText}`);
            }
            
            const data = await response.json();
            return tallyFromPayload(doi, data);
        } catch (error) {
            console.error(`[Scite] Failed to fetch tally for ${doi}:`, error);
            return null;
        }
    }

    /**
     * Fetches tallies for multiple DOIs in a single request.
     */
    public async getTallies(dois: string[]): Promise<Record<string, SciteTally>> {
        if (!dois || dois.length === 0) return {};
        
        // Filter and clean DOIs
        const validDois = dois
            .filter(d => typeof d === 'string' && d.trim().length > 0)
            .map(d => d.trim());

        if (validDois.length === 0) return {};

        try {
            const response = await fetch(`${this.baseUrl}/tallies`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(validDois)
            });

            if (!response.ok) {
                const errorText = await response.text().catch(() => 'No error details');
                console.warn(`[Scite] API error (${response.status}): ${errorText}`);
                return {};
            }
            
            const data = await response.json();
            const results: Record<string, SciteTally> = {};
            
            if (data.tallies) {
                Object.entries(data.tallies).forEach(([doi, tally]: [string, any]) => {
                    const parsed = tallyFromPayload(doi, tally);
                    if (parsed) results[doi] = parsed;
                });
            }
            
            return results;
        } catch (error) {
            console.error(`[Scite] Failed to fetch bulk tallies:`, error);
            return {};
        }
    }

    /**
     * Checks for editorial notices (retractions, etc.) via Scite.
     */
    public async getNotice(doi: string): Promise<SciteNotice | null> {
        // Scite API often includes notices in the tally or a separate endpoint
        // For this implementation, we'll focus on tallies as they are most common
        return null;
    }
}

export const sciteService = new SciteService();
