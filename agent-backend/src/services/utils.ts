// agent-backend/src/services/utils.ts
import { ResearchPaper, CrossrefWork } from "../types/index.js";

// Function to create a stable ID for a paper, identical to the one in extensionService.ts
export const createPaperId = (paper: Partial<ResearchPaper>): string => {
    if (paper.doi) return `doi:${paper.doi}`;
    if (paper.sourceURL) {
        const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${paper.sourceURL}`;
    }
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || Math.random().toString()}`;
};

/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
export function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';
    
    const abstractArray: string[] = [];
    let maxIndex = -1;

    for (const word in invertedAbstract) {
        // Iterate over positions directly, assuming values are numbers
        for (const pos of invertedAbstract[word]) {
            if (pos > maxIndex) {
                maxIndex = pos;
            }
        }
    }
    
    if(maxIndex > -1){
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }

    for (const word in invertedAbstract) {
        // Iterate over positions directly, assuming values are numbers
        for (const pos of invertedAbstract[word]) {
            abstractArray[pos] = word;
        }
    }
    return abstractArray.join(' ').trim();
}

// Helper to normalize strings for comparison by removing case and non-alphanumeric characters.
export const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Checks if the first author of the local paper matches any of the authors from the Crossref result.
 * @param paperAuthors The author string from the local ResearchPaper object.
 * @param crossrefAuthors The array of author objects from the Crossref API response.
 * @returns A boolean indicating if a likely match was found.
 */
export const checkAuthorMatch = (paperAuthors: string, crossrefAuthors: CrossrefWork['author']): boolean => {
    if (!crossrefAuthors || crossrefAuthors.length === 0) return false;
    
    const firstPaperAuthorLastName = paperAuthors.split(',')[0].trim().split(' ').pop()?.toLowerCase();
    if (!firstPaperAuthorLastName) return false;

    return crossrefAuthors.some(author => {
        const familyName = author.family?.toLowerCase();
        const fullName = author.name?.toLowerCase();
        return familyName === firstPaperAuthorLastName || fullName?.includes(firstPaperAuthorLastName);
    });

};

// A simple title similarity check.
export const checkTitleSimilarity = (title1: string, title2: string): boolean => {
    const s1 = title1.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    const s2 = title2.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    return s1.includes(s2) || s2.includes(s1);
};