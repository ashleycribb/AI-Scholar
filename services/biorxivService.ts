import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchBioRxiv = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
  const cacheKey = `biorxiv_${query}_${limit}`;
  const cached = getCache<{ papers: ResearchPaper[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/biorxiv/search?query=${encodeURIComponent(query)}&rows=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { papers: [], totalCount: 0 };
    const data = await res.json();
    const items: any[] = data.message?.items || [];
    const totalCount = data.message?.['total-results'] || items.length;

    const papers: ResearchPaper[] = items.map(item => {
      const title = item.title?.[0] ? item.title[0].replace(/<[^>]+>/g, '').trim() : 'Untitled Life Sciences Preprint';
      const authors = (item.author || []).map((a: any) => `${a.given || ''} ${a.family || ''}`.trim()).filter(Boolean).join(', ') || 'Cold Spring Harbor Preprint Author';
      
      const dateParts = item.published?.['date-parts']?.[0] || item.created?.['date-parts']?.[0];
      const year = dateParts?.[0] || new Date().getFullYear();

      const abstract = item.abstract 
        ? item.abstract.replace(/<[^>]+>/g, '').trim() 
        : `Preprint in biology/medicine hosted on bioRxiv/medRxiv with DOI ${item.DOI}.`;

      return {
        id: `biorxiv:${item.DOI}`,
        title: `[Preprint] ${title}`,
        authors,
        year,
        abstract,
        doi: item.DOI,
        sourceURL: item.URL || `https://doi.org/${item.DOI}`,
        pdfURL: item.DOI ? `https://www.biorxiv.org/content/${item.DOI}v1.full.pdf` : undefined,
        citations: item['is-referenced-by-count'] || 0,
        isOpenAccess: true,
        enrichmentSource: 'bioRxiv / medRxiv (Cold Spring Harbor)'
      };
    });

    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[bioRxiv Service] Search error:', err);
    return { papers: [], totalCount: 0 };
  }
};
