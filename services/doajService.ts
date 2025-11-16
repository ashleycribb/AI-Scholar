
export interface DoajArticle {
    bibjson: {
        title: string;
        identifier: { type: string; id: string }[];
        journal: {
            in_doaj: boolean;
            title: string;
        };
    };
}

/**
 * Searches the DOAJ API for an article by its DOI.
 * A successful find indicates the article is published in a vetted open access journal.
 * @param doi The Digital Object Identifier of the paper.
 * @returns A promise that resolves to the DOAJ article object if found, otherwise null.
 */
export const searchByDoi = async (doi: string): Promise<DoajArticle | null> => {
    // The DOAJ API is public and doesn't require an API key.
    const url = `https://doaj.org/api/v4/articles/doi/${encodeURIComponent(doi)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) {
                // This is expected if the DOI is not in DOAJ.
                return null;
            }
            // For other errors, log it but don't fail the entire validation process.
            console.warn(`DOAJ API returned status ${response.status} for DOI ${doi}`);
            return null;
        }
        
        const data = await response.json();
        
        // Check if the journal is actually in DOAJ, as a sanity check.
        if (data?.bibjson?.journal?.in_doaj) {
            return data as DoajArticle;
        }

        return null;

    } catch (error) {
        console.error(`Error querying DOAJ for DOI ${doi}:`, error);
        return null;
    }
};