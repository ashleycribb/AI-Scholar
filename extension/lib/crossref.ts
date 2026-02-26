// extension/lib/crossref.ts
import type { ResearchPaper, CrossrefWork } from '../../types';
import {
    normalizeString,
    checkAuthorMatch,
    getCrossrefBibliographicUrl,
    getCrossrefTitleAuthorUrl
} from '../../services/crossrefUtils';

export const fetchPaperFromCrossref = async (paper: ResearchPaper): Promise<CrossrefWork | null> => {
    const url = getCrossrefBibliographicUrl(paper.title);

    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        const items = data.message?.items;
        if (!items || items.length === 0) return null;

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

export const findDoiForPaper = async (paper: ResearchPaper): Promise<string | null> => {
    try {
        const firstAuthorLastName = paper.authors.split(',')[0].trim().split(' ').pop();
        if (firstAuthorLastName) {
            const url = getCrossrefTitleAuthorUrl(paper.title, firstAuthorLastName);
            const response = await fetch(url);
            if (response.ok) {
                const data = await response.json();
                const item = data.message?.items?.[0];
                if (item && item.DOI) {
                   return item.DOI;
                }
            }
        }
        
        const crossrefResult = await fetchPaperFromCrossref(paper);
        return crossrefResult?.DOI || null;
    } catch (error) {
        console.error("Error finding DOI:", error);
        throw new Error("Failed to communicate with Crossref API to find DOI.");
    }
};
