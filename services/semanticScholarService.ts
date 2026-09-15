
import type { ResearchPaper, AdvancedSearchOptions, ConnectedPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const S2_API_BASE = '/api/s2';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for graph/search data (Standardized)

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, delay = 2000): Promise<Response> {
    try {
        const response = await fetch(url, options);
        if (response.status === 429) {
            if (retries > 0) {
                const jitter = Math.random() * 1000;
                const nextDelay = delay + jitter;
                console.warn(`S2 API Rate Limited (429). Retrying in ${nextDelay.toFixed(0)}ms... (${retries} attempts left)`);
                await wait(nextDelay);
                return fetchWithRetry(url, options, retries - 1, delay * 2);
            }
            console.warn(`S2 API Rate Limited (429). Skipping S2 results after exhausted retries.`);
            // Return a mock response that indicates failure but doesn't throw
            return new Response(JSON.stringify({ data: [] }), { status: 429, statusText: "Too Many Requests" });
        }
        return response;
    } catch (error) {
        if (retries > 0) {
            const jitter = Math.random() * 1000;
            await wait(delay + jitter);
            return fetchWithRetry(url, options, retries - 1, delay * 2);
        }
        throw error;
    }
}

export const searchSemanticScholar = async (query: string, options: AdvancedSearchOptions, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    const cacheKey = `s2_search_${query}_${page}`;
    const cached = getCache<any>(cacheKey);
    if (cached) return cached;

    const limit = 15;
    const offset = (page - 1) * limit;
    // Simplified fields to avoid potential API issues with newer/restricted fields
    const fields = 'title,authors,year,abstract,url,citationCount,openAccessPdf,venue,externalIds';
    
    const url = `${S2_API_BASE}/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}&fields=${fields}`;

    try {
        const response = await fetchWithRetry(url, {
            headers: {
                'Accept': 'application/json'
            }
        });
        
        if (response.status === 429) {
            console.warn("S2 Rate Limit, returning empty results.");
            return { papers: [], hasMore: false };
        }

        if (!response.ok) {
            console.warn(`S2 API Notice (${response.status}): Upstream service unavailable.`);
            return { papers: [], hasMore: false };
        }
        const data = await response.json();
        
        if (!data || !Array.isArray(data.data)) {
            return { papers: [], hasMore: false };
        }
        
        const papers: ResearchPaper[] = (data.data || []).map((p: any) => ({
            id: `s2:${p.paperId}`,
            title: p.title || 'Untitled Paper',
            authors: (p.authors || []).map((a: any) => a.name).join(', '),
            year: p.year,
            abstract: p.abstract || 'No abstract available.',
            sourceURL: p.url,
            pdfURL: p.openAccessPdf?.url || undefined,
            citations: p.citationCount,
            influentialCitationCount: p.influentialCitationCount,
            doi: p.externalIds?.DOI,
            journal: p.venue,
            isOpenAccess: !!p.openAccessPdf,
            enrichmentSource: 'Semantic Scholar',
            highlights: p.tldr?.text ? [{ category: 'TLDR', text: p.tldr.text }] : []
        }));

        const result = { papers, hasMore: !!data.next };
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (e) {
        console.error("Semantic Scholar search failed:", e);
        return { papers: [], hasMore: false };
    }
};

/**
 * Fetches real-time citation data and connections for a specific DOI.
 */
export const getPaperGraphData = async (doi: string): Promise<{ 
    influence: Partial<ResearchPaper>, 
    connections: ConnectedPaper[] 
} | null> => {
    const cacheKey = `s2_graph_${doi}`;
    const cached = getCache<any>(cacheKey);
    if (cached) return cached;

    // Simplified fields for graph data
    const fields = 'citationCount,influentialCitationCount,tldr,citations.title,citations.authors,citations.year,citations.url,references.title,references.authors,references.year,references.url';
    const url = `${S2_API_BASE}/paper/DOI:${doi}?fields=${fields}`;

    try {
        const response = await fetchWithRetry(url, {
            headers: { 'Accept': 'application/json' }
        });
        if (!response.ok) {
            console.warn(`S2 Graph API Error (${response.status}) for DOI: ${doi}`);
            return null;
        }
        const p = await response.json();

        const influence: Partial<ResearchPaper> = {
            citations: p.citationCount,
            influentialCitationCount: p.influentialCitationCount,
            highlights: p.tldr?.text ? [{ category: 'TLDR', text: p.tldr.text }] : []
        };

        const connections: ConnectedPaper[] = [];

        // Add Top 5 Influential Citations
        if (p.citations) {
            const topCitations = p.citations
                .filter((c: any) => c.title)
                .sort((a: any, b: any) => (b.influentialCitationCount || 0) - (a.influentialCitationCount || 0))
                .slice(0, 5);

            topCitations.forEach((c: any) => {
                connections.push({
                    title: c.title,
                    authors: (c.authors || []).map((a: any) => a.name).join(', '),
                    year: c.year,
                    connection: 'Cited by this paper', // Semantic Scholar context: "this paper" is the result, "citing paper" is the input
                    summary: 'Highly influential citation found via Semantic Scholar.',
                    sourceURL: c.url
                });
            });
        }

        // Add Top 5 References
        if (p.references) {
            const topRefs = p.references
                .filter((r: any) => r.title)
                .slice(0, 5);

            topRefs.forEach((r: any) => {
                connections.push({
                    title: r.title,
                    authors: (r.authors || []).map((a: any) => a.name).join(', '),
                    year: r.year,
                    connection: 'This paper cites',
                    summary: 'Key reference identified in the original text.',
                    sourceURL: r.url
                });
            });
        }

        const result = { influence, connections };
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (e) {
        console.error("S2 Graph Fetch Failed:", e);
        return null;
    }
};
