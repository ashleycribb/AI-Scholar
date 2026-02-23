import type { ResearchPaper, ConnectedPaper, AdvancedSearchOptions } from '../types';
import { createPaperId } from './extensionService';

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1/paper/';
const S2_SEARCH_BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';

// Helper to map S2 paper data to our internal ConnectedPaper type
const mapS2Paper = (s2paper: any, connection: string): ConnectedPaper => {
    return {
        title: s2paper.title || 'Title not available',
        authors: (s2paper.authors || []).map((a: any) => a.name).join(', '),
        year: s2paper.year || 0,
        summary: s2paper.abstract || 'Abstract not available.',
        sourceURL: s2paper.url,
        connection: connection,
    };
};

export const getCitationGraph = async (doi: string): Promise<{ references: ConnectedPaper[], citations: ConnectedPaper[] }> => {
    // Request fields for both the papers referenced by the given DOI, and the papers that cite the DOI.
    const url = `${S2_API_BASE}DOI:${doi}?fields=references.title,references.authors,references.year,references.abstract,references.url,citations.title,citations.authors,citations.year,citations.abstract,citations.url`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Semantic Scholar API error: ${response.status}`);
        }
        const data = await response.json();
        
        const references = (data.references || []).map((p: any) => mapS2Paper(p, 'This paper cites'));
        const citations = (data.citations || []).map((p: any) => mapS2Paper(p, 'Cited by this paper'));

        return { references, citations };
    } catch (error) {
        console.error("Error fetching citation graph from Semantic Scholar:", error);
        // Return empty arrays to not break the UI in case of an API failure
        return { references: [], citations: [] };
    }
};

export const searchSemanticScholar = async (query: string, options: AdvancedSearchOptions, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    const offset = (page - 1) * 10;
    const searchParams = new URLSearchParams({
        query: query,
        offset: offset.toString(),
        limit: '10',
        fields: 'paperId,title,abstract,authors,year,citationCount,url,venue,externalIds'
    });

    if (options.startYear || options.endYear) {
        const start = options.startYear || '';
        const end = options.endYear || '';
        if (start || end) {
            // S2 uses year ranges like 2020-2024
            searchParams.append('year', `${start}-${end}`);
        }
    }

    // S2 doesn't have direct author/journal filters in free search API easily without structured query,
    // but the `query` param supports some operators.
    // For simplicity, we just use the main query.

    const url = `${S2_SEARCH_BASE}?${searchParams.toString()}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
             const errorData = await response.json().catch(() => ({}));
             throw new Error(`Semantic Scholar API error: ${response.status} ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const papers = (data.data || []).map((p: any) => {
            if (!p.abstract && !p.title) return null;

            const paperData: Omit<ResearchPaper, 'id'> = {
                title: p.title || 'Untitled',
                authors: (p.authors || []).map((a: any) => a.name).join(', '),
                year: p.year || new Date().getFullYear(),
                abstract: p.abstract || 'No abstract available.',
                sourceURL: p.url || `https://www.semanticscholar.org/paper/${p.paperId}`,
                pdfURL: undefined, // S2 might provide openAccessPdf in other endpoints but not simple search
                citations: p.citationCount || 0,
                doi: p.externalIds?.DOI,
                journal: p.venue || undefined,
                enrichmentSource: 'Semantic Scholar' as any // strictly typed
            };
            return {
                ...paperData,
                id: createPaperId(paperData)
            };
        }).filter((p: ResearchPaper | null) => p !== null);

        const total = data.total || 0;
        const hasMore = (offset + 10) < total;

        return { papers, hasMore };

    } catch (error) {
        console.error("Error searching Semantic Scholar:", error);
        return { papers: [], hasMore: false };
    }
};
