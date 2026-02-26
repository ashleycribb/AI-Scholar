import type { CrossrefWork } from '../types';

export const CROSSREF_API_BASE = 'https://api.crossref.org/works';

/**
 * Normalizes a string for comparison by removing case and non-alphanumeric characters.
 * @param str The string to normalize.
 * @returns The normalized string.
 */
export const normalizeString = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Checks if the first author of the local paper matches any of the authors from the Crossref result.
 * @param paperAuthors The author string from the local ResearchPaper object.
 * @param crossrefAuthors The array of author objects from the Crossref API response.
 * @returns A boolean indicating if a likely match was found.
 */
export const checkAuthorMatch = (paperAuthors: string, crossrefAuthors: CrossrefWork['author']): boolean => {
    if (!crossrefAuthors || crossrefAuthors.length === 0) return false;

    // Get the last name of the first author from the local paper data.
    const firstPaperAuthorLastName = paperAuthors.split(',')[0].trim().split(' ').pop()?.toLowerCase();
    if (!firstPaperAuthorLastName) return false;

    // Check if any author in the Crossref data has a matching family name or a full name containing the last name.
    return crossrefAuthors.some(author => {
        const familyName = author.family?.toLowerCase();
        const fullName = author.name?.toLowerCase();
        return familyName === firstPaperAuthorLastName || fullName?.includes(firstPaperAuthorLastName);
    });
};

/**
 * Constructs the Crossref API URL for a bibliographic query.
 * @param title The title of the paper.
 * @param rows The number of rows to return (default 3).
 * @returns The constructed URL.
 */
export const getCrossrefBibliographicUrl = (title: string, rows: number = 3) => {
    return `${CROSSREF_API_BASE}?query.bibliographic=${encodeURIComponent(title)}&rows=${rows}`;
};

/**
 * Constructs the Crossref API URL for a specific title and author query.
 * @param title The title of the paper.
 * @param authorLastName The last name of the first author.
 * @param rows The number of rows to return (default 1).
 * @returns The constructed URL.
 */
export const getCrossrefTitleAuthorUrl = (title: string, authorLastName: string, rows: number = 1) => {
    return `${CROSSREF_API_BASE}?query.title=${encodeURIComponent(title)}&query.author=${encodeURIComponent(authorLastName)}&rows=${rows}&select=DOI,title,author`;
};

/**
 * Constructs the Crossref API URL for fetching CSL-JSON data.
 * @param doi The Digital Object Identifier of the paper.
 * @returns The constructed URL.
 */
export const getCrossrefCslUrl = (doi: string) => {
    return `${CROSSREF_API_BASE}/${encodeURIComponent(doi)}/transform/application/vnd.citationstyles.csl+json`;
};
