
import type { ResearchPaper } from '../types';

/**
 * Unpaywall API Service
 * Endpoint: https://api.unpaywall.org/v2/{doi}?email={email}
 */

const EMAIL = 'contact@scholar-explorer.com';

interface UnpaywallResponse {
    doi: string;
    is_oa: boolean;
    best_oa_location?: {
        url_for_pdf: string;
        url_for_landing_page: string;
        version: string;
        license: string;
    };
    oa_locations: Array<{
        url_for_pdf: string;
        url_for_landing_page: string;
        version: string;
        license: string;
    }>;
}

export const fetchOALink = async (doi: string): Promise<string | null> => {
    if (!doi) return null;
    
    // Clean DOI
    const cleanDoi = doi.startsWith('http') ? doi.split('doi.org/')[1] : doi;
    
    try {
        const response = await fetch(`https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}?email=${EMAIL}`);
        if (!response.ok) return null;
        
        const data: UnpaywallResponse = await response.json();
        
        if (data.is_oa && data.best_oa_location?.url_for_pdf) {
            return data.best_oa_location.url_for_pdf;
        }
        
        // Fallback to landing page if no PDF
        if (data.is_oa && data.best_oa_location?.url_for_landing_page) {
            return data.best_oa_location.url_for_landing_page;
        }
        
        return null;
    } catch (error) {
        console.error("[Unpaywall] Error fetching DOI:", doi, error);
        return null;
    }
};

/**
 * Enriches a list of papers with Unpaywall OA data if they lack PDF links
 */
export const enrichWithUnpaywall = async (papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    const papersToEnrich = papers.filter(p => p.doi && !p.pdfURL);
    
    if (papersToEnrich.length === 0) return papers;
    
    const enrichedResults = await Promise.all(
        papersToEnrich.slice(0, 5).map(async (paper) => {
            const oaLink = await fetchOALink(paper.doi!);
            if (oaLink) {
                return { ...paper, pdfURL: oaLink, isOpenAccess: true };
            }
            return paper;
        })
    );
    
    // Merge back
    return papers.map(p => {
        const enriched = enrichedResults.find(ep => ep.id === p.id);
        return enriched || p;
    });
};
