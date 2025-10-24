// extension/lib/crossref.ts
import type { ResearchPaper } from '../../types';

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string; 
}

interface CrossrefWork {
  title: string[];
  author: CrossrefAuthor[];
  URL: string;
  DOI: string;
}

const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const checkAuthorMatch = (paperAuthors: string, crossrefAuthors: CrossrefWork['author']): boolean => {
    if (!crossrefAuthors || crossrefAuthors.length === 0) return false;
    
    const firstPaperAuthorLastName = paperAuthors.split(',')[0].trim().split(' ').pop()?.toLowerCase();
    if (!firstPaperAuthorLastName) return false;

    return crossrefAuthors.some(author => {
        const familyName = author.family?.toLowerCase();
        const fullName = author.name?.toLowerCase();
        return familyName === firstPaperAuthorLastName || fullName?.includes(firstPaperAuthorLastName);
    });
};

export const fetchPaperFromCrossref = async (paper: ResearchPaper): Promise<CrossrefWork | null> => {
    const url = `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(paper.title)}&rows=3`;

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
            const url = `https://api.crossref.org/works?query.title=${encodeURIComponent(paper.title)}&query.author=${encodeURIComponent(firstAuthorLastName)}&rows=1&select=DOI,title,author`;
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
