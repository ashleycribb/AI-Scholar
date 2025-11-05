// agent-backend/src/services/crossrefService.ts (Copy of frontend services/crossrefService.ts)
import type { ResearchPaper, CrossrefWork } from '../types';
import { normalizeString, checkAuthorMatch } from './utils';

/**
 * Fetches paper metadata from the Crossref API to find a high-confidence match.
 * @param paper The `ResearchPaper` object to verify.
 * @returns A promise that resolves to a `CrossrefWork` object if a match is found, otherwise null.
 */
export const fetchPaperFromCrossref = async (paper: ResearchPaper): Promise<CrossrefWork | null> => {
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(paper.title)}&rows=3`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.error(`Crossref API error: ${response.status}`);
            return null;
        }
        const data = await response.json();
        const items = data.message?.items;

        if (!items || items.length === 0) {
            return null;
        }

        const normalizedPaperTitle = normalizeString(paper.title);
        
        for (const item of items) {
            const apiTitle = item.title?.[0];
            if (!apiTitle) continue;

            const normalizedApiTitle = normalizeString(apiTitle);
            
            const titleIsSimilar = normalizedApiTitle.includes(normalizedPaperTitle) || normalizedPaperTitle.includes(normalizedApiTitle);

            if (titleIsSimilar && checkAuthorMatch(paper.authors, item.author)) {
                return item as CrossrefWork;
            }
        }

        return null;
    } catch (error) {
        console.error("Error fetching from Crossref:", error);
        return null;
    }
};

/**
 * Finds the DOI for a given paper using the Crossref API.
 * @param paper The `ResearchPaper` object to search for.
 * @returns A promise that resolves to the DOI string if found, otherwise null.
 */
export const findDoiForPaper = async (paper: ResearchPaper): Promise<string | null> => {
    try {
        const firstAuthorLastName = paper.authors.split(',')[0].trim().split(' ').pop();

        if (firstAuthorLastName) {
            const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(paper.title)}&query.author=${encodeURIComponent(firstAuthorLastName)}&rows=1&select=DOI,title,author`;
            
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const item = data.message?.items?.[0];

                if (item) {
                    const apiTitle = item.title?.[0];
                    if (apiTitle) {
                        const normalizedPaperTitle = normalizeString(paper.title);
                        const normalizedApiTitle = normalizeString(apiTitle);
                        const titleIsSimilar = normalizedApiTitle.includes(normalizedPaperTitle) || normalizedPaperTitle.includes(normalizedApiTitle);

                        if (titleIsSimilar && checkAuthorMatch(paper.authors, item.author) && item.DOI) {
                            return item.DOI;
                        }
                    }
                }
            }
        }
        
        const crossrefResult = await fetchPaperFromCrossref(paper);
        if (crossrefResult && crossrefResult.DOI) {
            return crossrefResult.DOI;
        }

        return null;
    } catch (error) {
        console.error("Error finding DOI:", error);
        throw new Error("Failed to communicate with Crossref API to find DOI.");
    }
};