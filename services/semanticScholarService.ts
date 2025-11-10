import type { ResearchPaper, ConnectedPaper } from '../types';

const S2_API_BASE = 'https://api.semanticscholar.org/graph/v1/paper/';

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
