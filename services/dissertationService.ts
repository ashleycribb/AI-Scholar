import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface DissertationItem {
  id: string;
  title: string;
  author: string;
  year: number;
  institution?: string;
  doi?: string;
  degreeType?: string;
  url?: string;
  abstract?: string;
}

export const searchDissertations = async (
  query: string,
  limit: number = 10
): Promise<{ dissertations: DissertationItem[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `dissertations_${query}_${limit}`;
  const cached = getCache<{ dissertations: DissertationItem[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/dissertations/search?query=${encodeURIComponent(query)}&rows=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { dissertations: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const items: any[] = data.message?.items || [];
    const totalCount: number = data.message?.['total-results'] || items.length;

    const dissertations: DissertationItem[] = items.map(item => {
      const title = item.title?.[0] ? item.title[0].replace(/<[^>]+>/g, '').trim() : 'Doctoral Dissertation';
      const author = (item.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ') || 'Doctoral Candidate';
      const dateParts = item.published?.['date-parts']?.[0] || item.created?.['date-parts']?.[0];
      const year = dateParts?.[0] || new Date().getFullYear();
      const institution = item.publisher || item['container-title']?.[0] || 'University Archive';

      return {
        id: `dissertation:${item.DOI || Math.random().toString(36).substring(2, 9)}`,
        title,
        author,
        year,
        institution,
        doi: item.DOI,
        degreeType: item.subtype || 'Ph.D. Dissertation',
        url: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : undefined),
        abstract: item.abstract?.replace(/<[^>]+>/g, '').trim() || `Doctoral dissertation / thesis completed at ${institution}.`
      };
    });

    const papers: ResearchPaper[] = dissertations.map(d => ({
      id: d.id,
      title: `[Dissertation / Thesis] ${d.title}`,
      authors: d.author,
      year: d.year,
      abstract: d.abstract || `Doctoral dissertation or graduate thesis cataloged at ${d.institution}.`,
      doi: d.doi,
      sourceURL: d.url,
      journal: d.institution,
      isOpenAccess: true,
      citations: 0,
      enrichmentSource: `Global Theses & Dissertations Registry (${d.institution})`
    }));

    const result = { dissertations, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[Dissertation Service] Search error:', err);
    return { dissertations: [], totalCount: 0, papers: [] };
  }
};
