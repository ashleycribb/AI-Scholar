import { ResearchPaper } from '../types';

/**
 * Creates a stable ID for a paper.
 * If the paper has a DOI, it returns `doi:${doi}`.
 * If the paper has a source URL, it attempts to extract the arXiv ID or returns `url:${sourceURL}`.
 * If neither is present, it returns `title:${title}` with whitespace replaced by dashes.
 * As a fallback if title is missing, it generates a random UUID using crypto.randomUUID().
 *
 * @param paper - The paper object (partial).
 * @returns A unique string ID for the paper.
 */
export const createPaperId = (paper: Partial<ResearchPaper>): string => {
    if (paper.doi) return `doi:${paper.doi}`;
    if (paper.sourceURL) {
        const arxivIdMatch = paper.sourceURL.match(/arxiv\.org\/(?:abs|pdf)\/([^/]+)/);
        if (arxivIdMatch) return `arxiv:${arxivIdMatch[1].replace(/v\d+$/, '')}`;
        return `url:${paper.sourceURL}`;
    }
    return `title:${paper.title?.toLowerCase().replace(/\s+/g, '-') || crypto.randomUUID()}`;
};
