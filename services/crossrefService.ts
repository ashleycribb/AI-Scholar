import type { ResearchPaper, CrossrefWork } from '../types';
import {
    normalizeString,
    checkAuthorMatch,
    getCrossrefBibliographicUrl,
    getCrossrefTitleAuthorUrl,
    getCrossrefCslUrl
} from './crossrefUtils';

/**
 * Fetches paper metadata from the Crossref API to find a high-confidence match.
 * @param paper The `ResearchPaper` object to verify.
 * @returns A promise that resolves to a `CrossrefWork` object if a match is found, otherwise null.
 */
export const fetchPaperFromCrossref = async (paper: ResearchPaper): Promise<CrossrefWork | null> => {
    // Construct the API URL. Querying by title is generally effective. We fetch 3 results to increase our chances of a match.
    const url = getCrossrefBibliographicUrl(paper.title);

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Crossref API error: ${response.status}`);
            return null;
        }
        const data = await response.json();
        const items = data.message?.items;

        if (!items || items.length === 0) {
            return null; // No results from Crossref.
        }

        // Iterate through the top results to find the best match.
        const normalizedPaperTitle = normalizeString(paper.title);
        
        for (const item of items) {
            const apiTitle = item.title?.[0];
            if (!apiTitle) continue;

            const normalizedApiTitle = normalizeString(apiTitle);
            
            // A match is considered high-confidence if the titles are very similar AND an author name matches.
            const titleIsSimilar = normalizedApiTitle.includes(normalizedPaperTitle) || normalizedPaperTitle.includes(normalizedApiTitle);

            if (titleIsSimilar && checkAuthorMatch(paper.authors, item.author)) {
                return item as CrossrefWork; // Found a confident match.
            }
        }

        return null; // No confident match was found in the top results.
    } catch (error) {
        console.error("Error fetching from Crossref:", error);
        return null;
    }
};

/**
 * Finds the DOI for a given paper using the Crossref API.
 * It first attempts a highly specific query with title and author, and falls back to a broader search if needed.
 * @param paper The `ResearchPaper` object to search for.
 * @returns A promise that resolves to the DOI string if found, otherwise null.
 */
export const findDoiForPaper = async (paper: ResearchPaper): Promise<string | null> => {
    try {
        // Attempt 1: Highly specific query using title and first author's last name.
        const firstAuthorLastName = paper.authors.split(',')[0].trim().split(' ').pop();

        if (firstAuthorLastName) {
            const url = getCrossrefTitleAuthorUrl(paper.title, firstAuthorLastName);
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const item = data.message?.items?.[0];

                if (item) {
                    // Perform a confidence check on the result.
                    const apiTitle = item.title?.[0];
                    if (apiTitle) {
                        const normalizedPaperTitle = normalizeString(paper.title);
                        const normalizedApiTitle = normalizeString(apiTitle);
                        const titleIsSimilar = normalizedApiTitle.includes(normalizedPaperTitle) || normalizedPaperTitle.includes(normalizedApiTitle);

                        if (titleIsSimilar && checkAuthorMatch(paper.authors, item.author) && item.DOI) {
                            return item.DOI; // High-confidence match from specific query.
                        }
                    }
                }
            }
        }
        
        // Attempt 2: Fallback to the broader verification-style search if the specific query fails or yields no confident match.
        const crossrefResult = await fetchPaperFromCrossref(paper);
        if (crossrefResult && crossrefResult.DOI) {
            return crossrefResult.DOI;
        }

        return null; // No DOI found through either method.
    } catch (error) {
        console.error("Error finding DOI:", error);
        throw new Error("Failed to communicate with Crossref API to find DOI.");
    }
};

/**
 * Fetches a perfectly formatted CSL-JSON object directly from the Crossref API.
 * This is the most reliable way to get citation data for a paper with a DOI.
 * @param doi The Digital Object Identifier of the paper.
 * @returns A promise that resolves to a CSL-JSON object or null if not found.
 */
export const fetchCslFromCrossref = async (doi: string): Promise<object | null> => {
    const url = getCrossrefCslUrl(doi);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Crossref CSL fetch failed for DOI ${doi}: Status ${response.status}`);
            return null;
        }
        const cslData = await response.json();
        return cslData;
    } catch (error) {
        console.error(`Error fetching CSL from Crossref for DOI ${doi}:`, error);
        return null;
    }
};
