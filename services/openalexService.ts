
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

const mapOpenAlexWorkToResearchPaper = (work: any, allowShortAbstract = false): ResearchPaper | null => {
    const abstract = work.abstract_inverted_index 
        ? deinvertAbstract(work.abstract_inverted_index) 
        : 'No abstract available for this paper.';
    
    if (!allowShortAbstract && (!abstract || abstract.length < 50)) return null;

    const authorList: AuthorProfile[] = (work.authorships || []).map((a: any) => ({
        id: a.author?.id?.replace('https://openalex.org/', '') || undefined,
        name: a.author?.display_name || 'Unknown Author',
        orcid: a.author?.orcid?.replace('https://orcid.org/', '') || undefined
    }));

    const doi = work.doi ? work.doi.replace('https://doi.org/', '') : undefined;
    const journal = work.primary_location?.source?.display_name || undefined;
    const openalexId = work.id ? String(work.id).replace('https://openalex.org/', '') : undefined;
    const rawConcepts = [
        ...(work.topics || []).map((t: any) => t.display_name),
        ...(work.concepts || []).map((c: any) => c.display_name),
        ...(work.keywords || []).map((k: any) => k.display_name || k.keyword)
    ].filter(Boolean);
    const uniqueConcepts = Array.from(new Set(rawConcepts)).slice(0, 8);

    const paperData: Omit<ResearchPaper, 'id'> = {
        title: work.title || work.display_name || 'Untitled Scholarly Work',
        authors: authorList.length > 0 ? authorList.map(a => a.name).join(', ') : 'Unknown Author',
        authorList,
        year: work.publication_year || 0,
        abstract,
        openalex_id: openalexId,
        sourceURL: work.doi ? `https://doi.org/${work.doi.replace('https://doi.org/', '')}` : work.id,
        pdfURL: work.primary_location?.pdf_url || undefined,
        citations: work.cited_by_count ?? 0,
        doi,
        journal,
        isOpenAccess: work.open_access?.is_oa || false,
        isInDoaj: work.primary_location?.source?.is_in_doaj || false,
        isRetracted: Boolean(work.is_retracted),
        ...(uniqueConcepts.length > 0 ? { keyConcepts: uniqueConcepts, keyConceptsState: 'loaded' as const } : {})
    };

    return { ...paperData, id: openalexId || createPaperId(paperData) };
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
        'select': 'id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,cited_by_count,primary_location,open_access,type,is_retracted,concepts,topics',
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
        if (!response.ok) throw new Error(`OpenAlex error (${response.status}): ${response.statusText}`);
        const data = await response.json();
        const papers = (data.results || []).map((w: any) => mapOpenAlexWorkToResearchPaper(w, false)).filter((p): p is ResearchPaper => p !== null);
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
    const cleanDoi = doi.replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim();
    const cacheKey = `single_paper_doi_${cleanDoi}`;
    const cached = getCache<ResearchPaper>(cacheKey);
    if (cached) return cached;

    const url = `/api/openalex/work/https://doi.org/${encodeURIComponent(cleanDoi)}?select=id,doi,title,display_name,publication_year,abstract_inverted_index,authorships,cited_by_count,primary_location,open_access,type,is_retracted,concepts,topics`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const work = await response.json();
        const result = mapOpenAlexWorkToResearchPaper(work, true);
        if (result) setCache(cacheKey, result, METADATA_TTL_MS);
        return result;
    } catch (error) {
        console.error(`DOI Fetch Error (${cleanDoi}):`, error);
        return null;
    }
};

export interface OpenAlexCitationGraphResult {
    openalexId?: string;
    citedByCount: number;
    referencedWorksCount: number;
    citingWorks: Array<{
        id: string;
        doi?: string;
        title: string;
        authors: string;
        year: number;
        citations: number;
        sourceURL?: string;
    }>;
    referencedWorks: Array<{
        id: string;
        doi?: string;
        title: string;
        authors: string;
        year: number;
        citations: number;
        sourceURL?: string;
    }>;
    rawReferencedIds: string[];
    concepts: string[];
    isRetracted: boolean;
    error?: string;
}

/**
 * Primary citation and reference lookup using OpenAlex referenced_works and cited_by_count / filter=cites:<id>.
 * Returns explicit error messages on failure or rate-limiting rather than a silent 0.
 */
export const fetchOpenAlexCitationGraph = async (paper: {
    doi?: string;
    openalex_id?: string;
    id?: string;
    title?: string;
}): Promise<OpenAlexCitationGraphResult> => {
    const cleanDoi = paper.doi ? paper.doi.replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim() : '';
    const candidateOaId = (paper.openalex_id || paper.id || '').replace(/^https?:\/\/openalex\.org\//i, '').trim();
    const validOaId = /^W[1-9][0-9]*$/i.test(candidateOaId) ? candidateOaId.toUpperCase() : '';

    const cacheKey = `oa_cit_graph_${validOaId || cleanDoi || paper.title || 'unknown'}`;
    const cached = getCache<OpenAlexCitationGraphResult>(cacheKey);
    if (cached) return cached;

    try {
        let work: any = null;
        const selectFields = 'id,doi,title,display_name,publication_year,cited_by_count,referenced_works,authorships,is_retracted,concepts,topics';

        if (validOaId) {
            const res = await fetch(`/api/openalex/work/${encodeURIComponent(validOaId)}?select=${selectFields}`);
            if (res.status === 429) {
                throw new Error('OpenAlex rate limit exceeded (HTTP 429)');
            }
            if (res.ok) {
                work = await res.json();
            }
        }

        if (!work && cleanDoi) {
            const res = await fetch(`/api/openalex/work/https://doi.org/${encodeURIComponent(cleanDoi)}?select=${selectFields}`);
            if (res.status === 429) {
                throw new Error('OpenAlex rate limit exceeded (HTTP 429)');
            }
            if (res.ok) {
                work = await res.json();
            } else if (res.status !== 404) {
                throw new Error(`OpenAlex DOI lookup failed (HTTP ${res.status})`);
            }
        }

        if (!work && paper.title) {
            const res = await fetch(`/api/openalex/search?search=${encodeURIComponent(paper.title)}&per-page=3&select=${selectFields}`);
            if (res.status === 429) {
                throw new Error('OpenAlex rate limit exceeded (HTTP 429)');
            }
            if (res.ok) {
                const searchData = await res.json();
                work = searchData?.results?.[0] || null;
            }
        }

        if (!work || !work.id) {
            return {
                citedByCount: 0,
                referencedWorksCount: 0,
                citingWorks: [],
                referencedWorks: [],
                rawReferencedIds: [],
                concepts: [],
                isRetracted: false,
                error: cleanDoi
                    ? `Work not found in OpenAlex for DOI ${cleanDoi}`
                    : 'Work could not be resolved in OpenAlex'
            };
        }

        const resolvedOaId = String(work.id).replace(/^https?:\/\/openalex\.org\//i, '');
        const citedByCount = typeof work.cited_by_count === 'number' ? work.cited_by_count : 0;
        const rawRefUrls: string[] = Array.isArray(work.referenced_works) ? work.referenced_works : [];
        const rawReferencedIds = rawRefUrls
            .map(u => String(u).replace(/^https?:\/\/openalex\.org\//i, '').trim())
            .filter(Boolean);

        const concepts = Array.from(new Set([
            ...(work.topics || []).map((t: any) => t.display_name),
            ...(work.concepts || []).map((c: any) => c.display_name)
        ].filter(Boolean))).slice(0, 8);

        // Fetch citing works via filter=cites:<id> and referenced works metadata concurrently
        const citingPromise = citedByCount > 0
            ? fetch(`/api/openalex/search?filter=cites:${encodeURIComponent(resolvedOaId)}&per-page=20&select=id,doi,title,display_name,publication_year,authorships,cited_by_count`)
                .then(async r => {
                    if (!r.ok) throw new Error(`OpenAlex citing works lookup HTTP ${r.status}`);
                    return r.json();
                })
            : Promise.resolve({ results: [] });

        const batchRefIds = rawReferencedIds.slice(0, 25);
        const referencedPromise = batchRefIds.length > 0
            ? fetch(`/api/openalex/search?filter=openalex:${encodeURIComponent(batchRefIds.join('|'))}&per-page=25&select=id,doi,title,display_name,publication_year,authorships,cited_by_count`)
                .then(async r => {
                    if (!r.ok) throw new Error(`OpenAlex referenced works lookup HTTP ${r.status}`);
                    return r.json();
                })
            : Promise.resolve({ results: [] });

        const [citingSettled, refSettled] = await Promise.allSettled([citingPromise, referencedPromise]);

        const mapShortWork = (w: any) => {
            const wDoi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//i, '') : undefined;
            const wId = String(w.id || '').replace(/^https?:\/\/openalex\.org\//i, '');
            const authors = (w.authorships || []).map((a: any) => a.author?.display_name).filter(Boolean).join(', ') || 'Unknown Author';
            return {
                id: wId,
                doi: wDoi,
                title: w.title || w.display_name || 'Untitled Work',
                authors,
                year: w.publication_year || 0,
                citations: w.cited_by_count ?? 0,
                sourceURL: wDoi ? `https://doi.org/${wDoi}` : (w.id || undefined)
            };
        };

        const citingWorks = citingSettled.status === 'fulfilled'
            ? (citingSettled.value?.results || []).map(mapShortWork)
            : [];

        const referencedWorks = refSettled.status === 'fulfilled'
            ? (refSettled.value?.results || []).map(mapShortWork)
            : [];

        const subErrors: string[] = [];
        if (citingSettled.status === 'rejected') {
            subErrors.push(citingSettled.reason?.message || 'Citing works query failed');
        }
        if (refSettled.status === 'rejected') {
            subErrors.push(refSettled.reason?.message || 'Referenced works query failed');
        }

        const result: OpenAlexCitationGraphResult = {
            openalexId: resolvedOaId,
            citedByCount,
            referencedWorksCount: rawReferencedIds.length,
            citingWorks,
            referencedWorks,
            rawReferencedIds,
            concepts,
            isRetracted: Boolean(work.is_retracted),
            ...(subErrors.length > 0 ? { error: subErrors.join('; ') } : {})
        };

        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (err: any) {
        return {
            citedByCount: 0,
            referencedWorksCount: 0,
            citingWorks: [],
            referencedWorks: [],
            rawReferencedIds: [],
            concepts: [],
            isRetracted: false,
            error: err?.message || 'OpenAlex citation lookup failed'
        };
    }
};

