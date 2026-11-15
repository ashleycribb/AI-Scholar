import type { ResearchPaper } from '../types';
import { stableRecordId } from '../utils/workIds';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchCORE = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
  const cacheKey = `core_${query}_${limit}`;
  const cached = getCache<{ papers: ResearchPaper[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/core/search?q=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { papers: [], totalCount: 0 };
    const data = await res.json();
    const results: any[] = data.results || [];
    const totalCount: number = data.totalHits || results.length;

    const papers: ResearchPaper[] = results.map(r => {
      const title = r.title || 'Untitled Open Access Manuscript';
      const authors = (r.authors || []).map((a: any) => typeof a === 'string' ? a : a.name).filter(Boolean).join(', ') || '';
      const year = r.yearPublished ? parseInt(r.yearPublished, 10) : undefined;
      const abstract = r.abstract || '';
      const doi = r.doi;

      return {
        id: stableRecordId('core', r.id, { doi, title: r.title, authors, year: r.yearPublished ? parseInt(r.yearPublished, 10) : undefined, raw: r }),
        title,
        authors,
        year: year !== undefined && Number.isFinite(year) ? year : undefined,
        abstract,
        doi,
        sourceURL: r.downloadUrl || (doi ? `https://doi.org/${doi}` : undefined),
        pdfURL: r.downloadUrl,
        citations: r.citationCount || 0,
        isOpenAccess: true,
        enrichmentSource: 'CORE (Global Institutional Repositories)'
      };
    });

    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[CORE Service] Search error:', err);
    return { papers: [], totalCount: 0 };
  }
};
