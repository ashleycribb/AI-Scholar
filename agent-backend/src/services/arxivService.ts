// agent-backend/src/services/arxivService.ts
import type { ResearchPaper } from '../types/index.js';
import { createPaperId } from './utils.js';

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

// --- Server-Safe XML Parsers ---

/**
 * A simple regex to extract content from a specific tag within a larger XML string.
 * @param xml The XML string to search within.
 * @param tag The name of the tag to extract content from.
 * @returns The trimmed content of the tag, or null if not found.
 */
const extractContent = (xml: string, tag: string): string | null => {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`));
    return match ? match[1].trim().replace(/\s+/g, ' ') : null;
};

/**
 * Extracts all instances of a tag's content, e.g., for multiple authors.
 * This is designed for simple, flat tags like `<name>Author Name</name>`.
 * @param xml The XML string to search within.
 * @param tag The name of the tag (e.g., 'author > name').
 * @returns An array of content strings.
 */
const extractAllContents = (xml: string, tag: string): string[] => {
    // Handle simple nested tags like 'author > name'
    const tags = tag.split(' > ');
    const outerTag = tags[0];
    const innerTag = tags[1];

    const outerRegex = new RegExp(`<${outerTag}[^>]*>([\\s\\S]*?)<\/${outerTag}>`, 'g');
    const outerMatches = xml.match(outerRegex);
    if (!outerMatches) return [];

    if (innerTag) {
        return outerMatches.map(outerMatch => extractContent(outerMatch, innerTag) || '').filter(Boolean);
    } else {
        return outerMatches.map(match => match.replace(new RegExp(`^<${tag}[^>]*>`), '').replace(new RegExp(`<\/${tag}>$`), '').trim());
    }
};


/**
 * Extracts the href attribute from a <link> tag that has a specific title attribute.
 * @param xml The XML string to search within.
 * @param title The value of the 'title' attribute to match (e.g., "pdf").
 * @returns The URL from the href attribute, or null if not found.
 */
const extractLink = (xml: string, title: string): string | null => {
    const regex = new RegExp(`<link[^>]*title="${title}"[^>]*href="([^"]+)"`);
    const match = xml.match(regex);
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
        
        // Find the <entry> block for parsing
        const entry = extractContent(xmlText, "entry");
        if (!entry) {
            return null;
        }

        const title = extractContent(entry, "title") || undefined;
        const abstract = extractContent(entry, "summary") || undefined;
        const publishedDate = extractContent(entry, "published");
        const year = publishedDate ? new Date(publishedDate).getFullYear() : undefined;
        
        const authors = extractAllContents(entry, "author > name").join(', ');
        
        const pdfURL = extractLink(entry, 'pdf') || undefined;
        const sourceURL = extractContent(entry, "id")?.trim() || undefined;

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

        // Split the response by <entry> tags. We add the opening tag back for parsing.
        const entryStrings = xmlText.split('</entry>').slice(0, -1);
        
        const papers: ResearchPaper[] = entryStrings.map(entryXml => {
            const title = extractContent(entryXml, "title") || 'Untitled';
            const abstract = extractContent(entryXml, "summary") || 'No abstract available.';
            const publishedDate = extractContent(entryXml, "published");
            const year = publishedDate ? new Date(publishedDate).getFullYear() : new Date().getFullYear();
            const authors = extractAllContents(entryXml, 'author > name').join(', ');
            const pdfURL = extractLink(entryXml, 'pdf') || undefined;
            const sourceURL = extractContent(entryXml, "id")?.trim();
            
            const paperData: Omit<ResearchPaper, 'id'> = {
                title,
                authors,
                year,
                abstract,
                sourceURL: sourceURL,
                pdfURL: pdfURL,
                citations: undefined, // arXiv API doesn't provide this directly
                enrichmentSource: 'arXiv',
            };
            return { ...paperData, id: createPaperId(paperData) };
        });

        return papers;

    } catch (error) {
        console.error("Error searching arXiv:", error);
        // Return empty array on error to not break the entire search process
        return [];
    }
};