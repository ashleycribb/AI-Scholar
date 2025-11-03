

import type { ResearchPaper, AdvancedSearchOptions } from '../types';
import { createPaperId } from './extensionService';

// Client-side cache for OpenAlex results
interface CacheEntry {
    papers: ResearchPaper[];
    timestamp: number;
}
const openAlexCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 * @param invertedAbstract - The inverted index object from the OpenAlex API.
 * @returns A string representing the paper's abstract.
 */
function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';
    
    const abstractArray: string[] = [];
    let maxIndex = -1;

    // First, determine the size of the array needed
    for (const word in invertedAbstract) {
        for (const pos of invertedAbstract[word]) {
            if (pos > maxIndex) {
                maxIndex = pos;
            }
        }
    }
    
    // Initialize the array with empty strings
    if(maxIndex > -1){
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }

    // Populate the array with words at their correct positions
    for (const word in invertedAbstract) {
        for (const pos of invertedAbstract[word]) {
            abstractArray[pos] = word;
        }
    }
    return abstractArray.join(' ').trim();
}


const mapOpenAlexWorkToResearchPaper = (work: any): ResearchPaper | null => {
    const abstract = work.abstract_inverted_index 
        ? deinvertAbstract(work.abstract_inverted_index) 
        : 'No abstract available for this paper.';
    
    // Filter out papers with no abstract for better summary quality
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
    // 1. Create a consistent cache key
    const cacheKey = JSON.stringify({ query, ...options });
    
    // 2. Check the cache
    const cachedEntry = openAlexCache.get(cacheKey);
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS)) {
        console.log("Serving from OpenAlex cache:", cacheKey);
        return cachedEntry.papers;
    }

    const BASE_URL = 'https://api.openalex.org/works';
    const params = new URLSearchParams({
        search: query,
        'per-page': '30',
        // Use a more specific, yet still example, email for the polite pool.
        mailto: 'contact@ai-research-explorer.com'
    });

    // Build the filter string for the OpenAlex API
    const filters: string[] = [];
    if (options.startYear || options.endYear) {
        const start = options.startYear || '';
        const end = options.endYear || '';
        // Only add the filter if at least one year is specified.
        // OpenAlex API supports open-ended ranges like "2020-" or "-2020".
        if (start || end) {
            filters.push(`publication_year:${start}-${end}`);
        }
    }
    if (options.authors) {
        // Use the .search field to find authors
        filters.push(`authorships.author.display_name.search:${options.authors}`);
    }
    
    if (filters.length > 0) {
        params.append('filter', filters.join(','));
    }

    const url = `${BASE_URL}?${params.toString()}`;
    let response: Response | null = null; // To access response in catch block

    try {
        response = await fetch(url);
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: `HTTP error! Status: ${response?.status}` }));
            throw new Error(`OpenAlex API error: ${errorData.message || response.statusText}`);
        }
        const data = await response.json();

        const papers = (data.results || []).map(mapOpenAlexWorkToResearchPaper).filter((p): p is ResearchPaper => p !== null);

        // 3. Store the result in the cache
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