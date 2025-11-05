// agent-backend/src/services/unpaywallService.ts (Copy of frontend services/unpaywallService.ts)

/**
 * Finds a direct URL to a legal, open-access PDF version of a paper using the Unpaywall API.
 * @param doi The Digital Object Identifier of the paper.
 * @returns A promise that resolves to the PDF URL string if found, otherwise null.
 */
export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    const email = 'contact@ai-research-explorer.com';
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${email}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.log(`Unpaywall: No record found for DOI ${doi}. Status: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        const pdfLocation = data?.best_oa_location;
        if (pdfLocation && pdfLocation.url_for_pdf) {
            return pdfLocation.url_for_pdf;
        }

        return null;

    } catch (error) {
        console.error(`Error querying Unpaywall for DOI ${doi}:`, error);
        return null;
    }
};