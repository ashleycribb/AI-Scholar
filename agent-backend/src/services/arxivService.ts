// agent-backend/src/services/arxivService.ts (Copy of frontend services/arxivService.ts)
import type { ResearchPaper } from '../types';
import { createPaperId } from './utils';

const ARXIV_ID_REGEX = /(?:abs|pdf)\/(\d{4}\.\d{4,5}(v\d+)?)/;

const extractArxivId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(ARXIV_ID_REGEX);
    return match ? match[1] : null;
};

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

        const enrichedData: Partial<ResearchPaper> = {};
        if (title) enrichedData.title = title;
        if (abstract) enrichedData.abstract = abstract;
        if (year) enrichedData.year = year;
        if (authors) enrichedData.authors = authors;
        if (pdfURL) enrichedData.pdfURL = pdfURL;
        if (sourceURL) enrichedData.sourceURL = sourceURL;
        enrichedData.enrichmentSource = 'arXiv';

        return enrichedData;

    } catch (error) {
        console.error(`Failed to fetch or parse arXiv data for ID ${arxivId}:`, error);
        return null;
    }
};

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
                citations: undefined,
                enrichmentSource: 'arXiv',
            };
            return { ...paperData, id: createPaperId(paperData) };
        });

        return papers;

    } catch (error) {
        console.error("Error searching arXiv:", error);
        return [];
    }
};