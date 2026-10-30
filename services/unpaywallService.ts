
import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

/**
 * Unpaywall API Service
 * Uses backend proxy /api/registries/unpaywall/:doi and caches results per DOI.
 * A 404 for a DOI (for example Zenodo DOIs) means "no open-access copy":
 * treated as a normal result, never logged as an error, and cached so the same DOI isn't requested again.
 */

const UNPAYWALL_CACHE_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const inFlightUnpaywall = new Map<string, Promise<string | null>>();

export const fetchOALink = async (doi: string): Promise<string | null> => {
    if (!doi) return null;

    const cleanDoi = doi.replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim().toLowerCase();
    if (!cleanDoi) return null;

    const cacheKey = `unpaywall_oa_${cleanDoi}`;
    const cached = getCache<{ oaLink: string | null }>(cacheKey);
    if (cached !== null && typeof cached === 'object' && 'oaLink' in cached) {
        return cached.oaLink;
    }

    const existing = inFlightUnpaywall.get(cleanDoi);
    if (existing) return existing;

    const lookupPromise = (async (): Promise<string | null> => {
        try {
            const response = await fetch(`/api/registries/unpaywall/${encodeURIComponent(cleanDoi)}`);
            if (response.status === 404) {
                setCache(cacheKey, { oaLink: null }, UNPAYWALL_CACHE_TTL_MS);
                return null;
            }
            if (!response.ok) {
                setCache(cacheKey, { oaLink: null }, UNPAYWALL_CACHE_TTL_MS);
                return null;
            }

            const data = await response.json();
            const oaLink: string | null = data?.oaLink || null;
            setCache(cacheKey, { oaLink }, UNPAYWALL_CACHE_TTL_MS);
            return oaLink;
        } catch {
            // Cache null so repeated requests for unreachable or non-OA DOIs do not re-trigger
            setCache(cacheKey, { oaLink: null }, UNPAYWALL_CACHE_TTL_MS);
            return null;
        }
    })();

    inFlightUnpaywall.set(cleanDoi, lookupPromise);
    try {
        return await lookupPromise;
    } finally {
        inFlightUnpaywall.delete(cleanDoi);
    }
};

/**
 * Enriches a list of papers with Unpaywall OA data if they lack PDF links
 */
export const enrichWithUnpaywall = async (papers: ResearchPaper[]): Promise<ResearchPaper[]> => {
    const papersToEnrich = papers.filter(p => p.doi && !p.pdfURL);
    
    if (papersToEnrich.length === 0) return papers;
    
    const enrichedResults = await Promise.all(
        papersToEnrich.slice(0, 5).map(async (paper) => {
            const oaLink = await fetchOALink(paper.doi!);
            if (oaLink) {
                return { ...paper, pdfURL: oaLink, isOpenAccess: true };
            }
            return paper;
        })
    );
    
    // Merge back
    return papers.map(p => {
        const enriched = enrichedResults.find(ep => ep.id === p.id);
        return enriched || p;
    });
};

