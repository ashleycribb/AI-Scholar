
import type { ResearchPaper } from '../types';

// A simple regex to extract arXiv IDs from various URL formats (e.g., /abs/..., /pdf/...).
const ARXIV_ID_REGEX = /(?:abs|pdf)\/(\d{4}\.\d{4,5}(v\d+)?)/;

/**
 * Extracts a clean arXiv ID from a given URL.
 * @param url The URL of the arXiv paper.
 * @returns The arXiv ID string if found, otherwise null.
 */
const extractArxivId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(ARXIV_ID_REGEX);
    return match ? match[1] : null;
};

/**
 * Fetches and parses paper metadata from the official arXiv API.
 * @param paper The initial ResearchPaper object, used to check for an arXiv source URL.
 * @returns A promise that resolves to a `Partial<ResearchPaper>` object with high-quality data if found, otherwise null.
 */
export const enrichFromArxiv = async (paper: ResearchPaper): Promise<Partial<ResearchPaper> | null> => {
    const arxivId = extractArxivId(paper.sourceURL);
    if (!arxivId) {
        return null;
    }

    const apiUrl = `https://export.arxiv.org/api/query?id_list=${arxivId}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            console.warn(`arXiv API returned status ${response.status} for ID ${arxivId}`);
            return null;
        }

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        
        const entry = xmlDoc.querySelector("entry");
        if (!entry) {
            return null;
        }

        const title = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, ' ') || undefined;
        const abstract = entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, ' ') || undefined;
        const publishedDate = entry.querySelector("published")?.textContent;
        const year = publishedDate ? new Date(publishedDate).getFullYear() : undefined;
        
        const authors = Array.from(entry.querySelectorAll("author > name")).map(node => node.textContent?.trim()).filter(Boolean).join(', ');
        
        const pdfLinkNode = Array.from(entry.querySelectorAll("link")).find(link => link.getAttribute('title') === 'pdf');
        const pdfURL = pdfLinkNode?.getAttribute('href') || undefined;
        
        const sourceURL = entry.querySelector("id")?.textContent?.trim() || undefined;

        // Construct the enriched data object, only including fields that were successfully parsed.
        const enrichedData: Partial<ResearchPaper> = {};
        if (title) enrichedData.title = title;
        if (abstract) enrichedData.abstract = abstract;
        if (year) enrichedData.year = year;
        if (authors) enrichedData.authors = authors;
        if (pdfURL) enrichedData.pdfURL = pdfURL;
        if (sourceURL) enrichedData.sourceURL = sourceURL;
        enrichedData.enrichmentSource = 'arXiv'; // Mark the source of enrichment

        return enrichedData;

    } catch (error) {
        console.error(`Failed to fetch or parse arXiv data for ID ${arxivId}:`, error);
        return null; // Fail gracefully, allowing the app to use the original data.
    }
};

/**
 * Searches the arXiv API for papers matching a query.
 * @param query The search query string.
 * @returns A promise that resolves to an array of ResearchPaper objects.
 */
export const searchArxiv = async (query: string): Promise<ResearchPaper[]> => {
    const apiUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=20`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`arXiv API error: ${response.status}`);
        }
        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");

        const entries = Array.from(xmlDoc.querySelectorAll("entry"));
        const papers: ResearchPaper[] = entries.map(entry => {
            const title = entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, ' ') || 'Untitled';
            const abstract = entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, ' ') || 'No abstract available.';
            const publishedDate = entry.querySelector("published")?.textContent;
            const year = publishedDate ? new Date(publishedDate).getFullYear() : new Date().getFullYear();
            const authors = Array.from(entry.querySelectorAll("author > name")).map(node => node.textContent?.trim()).filter(Boolean).join(', ');
            const pdfLinkNode = Array.from(entry.querySelectorAll("link")).find(link => link.getAttribute('title') === 'pdf');
            const sourceURL = entry.querySelector("id")?.textContent?.trim();
            
            const paperData: Omit<ResearchPaper, 'id'> = {
                title,
                authors,
                year,
                abstract,
                sourceURL: sourceURL,
                pdfURL: pdfLinkNode?.getAttribute('href') || undefined,
                citations: undefined, // arXiv API doesn't provide this directly
                enrichmentSource: 'arXiv',
            };
            // ID will be created later in apiService after de-duplication
            return { ...paperData, id: '' };
        });

        return papers;

    } catch (error) {
        console.error("Error searching arXiv:", error);
        // Return empty array on error to not break the entire search process
        return [];
    }
};
