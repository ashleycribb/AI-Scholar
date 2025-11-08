// agent-backend/src/services/openAlexService.ts (Copy of frontend services/openalexService.ts)
import type { ResearchPaper, AdvancedSearchOptions } from '../types/index.js';
import { createPaperId, deinvertAbstract } from './utils.js';

// Client-side cache for OpenAlex results (keep for now, might be moved to a proper cache later)
interface CacheEntry {
    papers: ResearchPaper[];
    timestamp: number;
}
const openAlexCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes


const mapOpenAlexWorkToResearchPaper = (work: any): ResearchPaper | null => {
    const abstract = work.abstract_inverted_index 
        ? deinvertAbstract(work.abstract_inverted_index) 
        : 'No abstract available for this paper.';
    
    if (!abstract || abstract.length < 50) {
        return null;
    }

    const doi = work.doi ? work.doi.replace('https://doi.org/', '') : undefined;
    const paperData: Omit<ResearchPaper, 'id'> = {
        title: work.title || work.display_name,
        authors: (work.authorships || []).map((a: any) => a.author?.display_name || 'Unknown Author').join(', '),
        year: work.publication_year,
        abstract,
        sourceURL: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : work.id,
        pdfURL: work.primary_location?.pdf_url || undefined,
        citations: work.cited_by_count,
        doi,
        journal: work.host_venue?.display_name || undefined,
    };

    return {
        ...paperData,
        id: createPaperId(paperData),
    };
};

/**
 * Searches the OpenAlex database for research papers.
 * @param query - The user's search query string.
 * @param options - Advanced search options including year range and authors.
 * @returns A promise that resolves to an array of ResearchPaper objects.
 */
export const searchOpenAlex = async (query: string, options: AdvancedSearchOptions): Promise<ResearchPaper[]> => {
    const cacheKey = JSON.stringify({ query, ...options });
    
    const cachedEntry = openAlexCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
        console.log("Serving from OpenAlex cache:", cacheKey);
        return cachedEntry.papers;
    }

    const BASE_URL = 'https://api.openalex.org/works';
    const params = new URLSearchParams({
        search: query,
        'per-page': '30',
        mailto: 'contact@ai-research-explorer.com'
    });

    const filters: string[] = [];
    if (options.startYear || options.endYear) {
        const start = options.startYear || '';
        const end = options.endYear || '';
        if (start || end) {
            filters.push(`publication_year:${start}-${end}`);
        }
    }
    if (options.authors) {
        filters.push(`authorships.author.display_name.search:${options.authors}`);
    }
    
    if (filters.length > 0) {
        params.append('filter', filters.join(','));
    }

    const url = `${BASE_URL}?${params.toString()}`;
    let response: Response | null = null;

    try {
        response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! Status: ${response?.status}` }));
            throw new Error(`OpenAlex API error: ${errorData.message || response.statusText}`);
        }
        const data = await response.json();

        const papers = (data.results || []).map(mapOpenAlexWorkToResearchPaper).filter((p): p is ResearchPaper => p !== null);

        console.log("Caching OpenAlex result:", cacheKey);
        openAlexCache.set(cacheKey, { papers, timestamp: Date.now() });

        return papers;
    } catch (error) {
        console.error("Error searching OpenAlex. Request URL:", url);
        if (response) {
            console.error("Response Status:", response.status, response.statusText);
        }
        if (error instanceof Error) {
            console.error("Original Error Message:", error.message);
        }

        throw new Error("Failed to fetch results from OpenAlex. Please check your network connection and try again later.");
    }
};

/**
 * Fetches a single paper from OpenAlex using its DOI.
 * @param doi The Digital Object Identifier of the paper.
 * @returns A promise that resolves to a ResearchPaper object or null if not found.
 */
export const searchOpenAlexByDoi = async (doi: string): Promise<ResearchPaper | null> => {
    const url = `https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`;
    try {
        const response = await fetch(url);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`OpenAlex API error! Status: ${response.status}`);
        }
        const work = await response.json();
        return mapOpenAlexWorkToResearchPaper(work);
    } catch (error) {
        console.error(`Error fetching from OpenAlex by DOI (${doi}):`, error);
        throw new Error(`Failed to fetch metadata for DOI ${doi} from OpenAlex.`);
    }
};