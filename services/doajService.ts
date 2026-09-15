import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchDOAJ = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
  const cacheKey = `doaj_${query}_${limit}`;
  const cached = getCache<{ papers: ResearchPaper[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/doaj/search?query=${encodeURIComponent(query)}&pageSize=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { papers: [], totalCount: 0 };
    const data = await res.json();
    const results: any[] = data.results || [];
    const totalCount: number = data.total || results.length;

    const papers: ResearchPaper[] = results.map(r => {
      const bibjson = r.bibjson || {};
      const title = bibjson.title || 'Untitled Open Access Article';
      const authors = (bibjson.author || []).map((a: any) => a.name).filter(Boolean).join(', ') || 'DOAJ Open Researcher';
      const year = parseInt(bibjson.year || `${new Date().getFullYear()}`, 10);
      const abstract = bibjson.abstract || `Peer-reviewed article indexed in Directory of Open Access Journals (DOAJ).`;
      
      const identifierDoi = (bibjson.identifier || []).find((id: any) => id.type === 'doi');
      const doi = identifierDoi ? identifierDoi.id : undefined;

      const linkFulltext = (bibjson.link || []).find((l: any) => l.type === 'fulltext');
      const sourceURL = linkFulltext ? linkFulltext.url : (doi ? `https://doi.org/${doi}` : undefined);

      return {
        id: `doaj:${r.id || doi || Math.random().toString(36).substring(2, 9)}`,
        title,
        authors,
        year: isNaN(year) ? new Date().getFullYear() : year,
        abstract,
        doi,
        sourceURL,
        journal: bibjson.journal?.title,
        isOpenAccess: true,
        citations: 0,
        enrichmentSource: 'DOAJ (Directory of Open Access Journals)'
      };
    });

    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[DOAJ Service] Search error:', err);
    return { papers: [], totalCount: 0 };
  }
};

export const searchByDoi = async (doi: string): Promise<any | null> => {
  const cleanDoi = doi.trim();
  const cacheKey = `doaj_doi_${cleanDoi}`;
  const cached = getCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/doaj/search?query=doi%3A%22${encodeURIComponent(cleanDoi)}%22&pageSize=1`;
    const res = await fetch(url).catch(() =>
      fetch(`https://doaj.org/api/v3/search/articles/doi%3A%22${encodeURIComponent(cleanDoi)}%22?pageSize=1`)
    );
    if (!res.ok) return null;
    const data = await res.json();
    const result = data.results?.[0] || null;
    if (result) {
      setCache(cacheKey, result, CACHE_TTL_MS);
      return result;
    }
    return null;
  } catch (err) {
    console.warn('[DOAJ Service] searchByDoi error:', err);
    return null;
  }
};
