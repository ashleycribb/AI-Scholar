
/**
 * Finds a direct URL to a legal, open-access PDF version of a paper using the Unpaywall API.
 * Unpaywall is an open database of open access content.
 * @param doi The Digital Object Identifier of the paper.
 * @returns A promise that resolves to the PDF URL string if found, otherwise null.
 */
import { UNPAYWALL_EMAIL } from './config';

export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    // Unpaywall requires an email for their "polite pool" of users.
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${UNPAYWALL_EMAIL}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            // This is expected for DOIs not in their database, so we don't throw an error.
            console.log(`Unpaywall: No record found for DOI ${doi}. Status: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        // The 'best_oa_location' provides the direct link to the best available Open Access version.
        // We specifically check for 'application/pdf' to ensure it's a direct PDF link.
        const pdfLocation = data?.best_oa_location;
        if (pdfLocation && pdfLocation.url_for_pdf) {
            return pdfLocation.url_for_pdf;
        }

        return null; // Open Access version exists, but not a direct PDF link we can use.

    } catch (error) {
        console.error(`Error querying Unpaywall for DOI ${doi}:`, error);
        // We don't throw an error here to allow the verification process to continue to other methods.
        return null;
    }
};
