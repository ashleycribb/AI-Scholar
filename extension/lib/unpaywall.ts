// extension/lib/unpaywall.ts

export const findOpenAccessPdf = async (doi: string): Promise<string | null> => {
    const email = 'contact@ai-research-explorer.com';
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${email}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
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
