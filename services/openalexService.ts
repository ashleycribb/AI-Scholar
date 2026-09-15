
import type { ResearchPaper, AdvancedSearchOptions, AuthorProfile } from '../types';
import { createPaperId } from './extensionService';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for search
const METADATA_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for specific DOI lookups

/**
 * Reconstructs a readable abstract string from OpenAlex's inverted index format.
 */
function deinvertAbstract(invertedAbstract: { [key: string]: number[] }): string {
    if (!invertedAbstract) return '';
    const abstractArray: string[] = [];
    let maxIndex = -1;
    for (const word in invertedAbstract) {
        for (const pos of invertedAbstract[word]) {
            if (pos > maxIndex) maxIndex = pos;
        }
    }
    if (maxIndex > -1) {
        abstractArray.length = maxIndex + 1;
        abstractArray.fill('');
    }
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
    
    if (!abstract || abstract.length < 50) return null;

    const authorList: AuthorProfile[] = (work.authorships || []).map((a: any) => ({
        id: a.author?.id?.replace('https://openalex.org/', '') || undefined,
        name: a.author?.display_name || 'Unknown Author',
        orcid: a.author?.orcid?.replace('https://orcid.org/', '') || undefined
    }));

    const doi = work.doi ? work.doi.replace('https://doi.org/', '') : undefined;
    const journal = work.primary_location?.source?.display_name || undefined;

    const paperData: Omit<ResearchPaper, 'id'> = {
        title: work.title || work.display_name,
        authors: authorList.map(a => a.name).join(', '),
        authorList,
        year: work.publication_year,
        abstract,
        sourceURL: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : work.id,
        pdfURL: work.primary_location?.pdf_url || undefined,
        citations: work.cited_by_count,
        doi,
        journal,
        isOpenAccess: work.open_access?.is_oa || false,
        isInDoaj: work.primary_location?.source?.is_in_doaj || false,
        isRetracted: work.is_retracted,
    };

    return { ...paperData, id: createPaperId(paperData) };
};

export const searchOpenAlex = async (query: string, options: AdvancedSearchOptions, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    const cacheKey = `openalex_search_${JSON.stringify({ query, ...options, page })}`;
    const cached = getCache<{ papers: ResearchPaper[], hasMore: boolean }>(cacheKey);
    if (cached) return cached;

    const PER_PAGE = 15;
    const BASE_URL = '/api/openalex/search';
    const params = new URLSearchParams({
        search: query,
        'per-page': PER_PAGE.toString(),
        'page': page.toString(),
        'select': 'id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,cited_by_count,primary_location,open_access,type,is_retracted',
    });

    const filters: string[] = [];
    if (options.startYear || options.endYear) {
        filters.push(`publication_year:${options.startYear || ''}-${options.endYear || ''}`);
    }
    if (options.authorId) filters.push(`authorships.author.id:${options.authorId}`);
    else if (options.authors) filters.push(`authorships.author.display_name.search:${options.authors}`);
    if (options.institutionId) filters.push(`authorships.institutions.ror:${options.institutionId}`);
    if (options.journal) filters.push(`primary_location.source.display_name.search:${options.journal}`);
    if (options.minCitations && parseInt(options.minCitations, 10) > 0) filters.push(`cited_by_count:>${options.minCitations}`);
    if (options.isOpenAccess) filters.push(`open_access.is_oa:true`);
    
    if (filters.length > 0) params.append('filter', filters.join(','));

    try {
        const response = await fetch(`${BASE_URL}?${params.toString()}`);
        if (!response.ok) throw new Error(`OpenAlex error: ${response.statusText}`);
        const data = await response.json();
        const papers = (data.results || []).map(mapOpenAlexWorkToResearchPaper).filter((p): p is ResearchPaper => p !== null);
        const hasMore = (page * PER_PAGE) < (data.meta?.count || 0);

        const result = { papers, hasMore };
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (error) {
        console.error("OpenAlex Fetch Error:", error);
        throw error;
    }
};

export const searchOpenAlexByDoi = async (doi: string): Promise<ResearchPaper | null> => {
    const cacheKey = `single_paper_doi_${doi}`;
    const cached = getCache<ResearchPaper>(cacheKey);
    if (cached) return cached;

    const url = `/api/openalex/work/https://doi.org/${encodeURIComponent(doi)}?select=id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,cited_by_count,primary_location,open_access,type,is_retracted`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const work = await response.json();
        const result = mapOpenAlexWorkToResearchPaper(work);
        if (result) setCache(cacheKey, result, METADATA_TTL_MS);
        return result;
    } catch (error) {
        console.error(`DOI Fetch Error (${doi}):`, error);
        return null;
    }
};
