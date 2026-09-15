
import type { Organization } from '../types';

const ROR_API_URL = 'https://api.ror.org/organizations';

/**
 * Searches the Research Organization Registry (ROR) for institutions.
 * @param query The search query string (e.g., "Stanford", "CERN").
 * @returns A promise resolving to a list of Organization objects.
 */
export const searchOrganizations = async (query: string): Promise<Organization[]> => {
    if (!query.trim()) return [];

    try {
        const response = await fetch(`${ROR_API_URL}?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`ROR API returned status: ${response.status}`);
        }

        const data = await response.json();
        const items = data.items || [];

        return items.map((item: any) => ({
            id: item.id, // e.g., "https://ror.org/03vek6s52"
            name: item.name,
            country: item.country?.country_name || 'Unknown',
            types: item.types || [],
        }));

    } catch (error) {
        console.error("Error searching ROR:", error);
        return [];
    }
};
