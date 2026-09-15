import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchERIC = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
  const cacheKey = `eric_${query}_${limit}`;
  const cached = getCache<{ papers: ResearchPaper[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/eric/search?search=${encodeURIComponent(query)}&rows=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { papers: [], totalCount: 0 };
    const data = await res.json();
    const docs: any[] = data.response?.docs || [];
    const totalCount = data.response?.numFound || docs.length;

    const papers: ResearchPaper[] = docs.map(doc => {
      const title = doc.title || 'Untitled Education Research Paper';
      const authors = (doc.author || []).join(', ') || 'Education Researcher';
      const year = doc.publicationdateyear ? parseInt(doc.publicationdateyear, 10) : new Date().getFullYear();
      const abstract = doc.description || `Education research study cataloged in the Institute of Education Sciences (IES) ERIC registry (${doc.id}).`;
      const isPeerReviewed = doc.peerreviewed === 'T';

      return {
        id: `eric:${doc.id}`,
        title: isPeerReviewed ? `[Peer-Reviewed Education] ${title}` : `[Education Research] ${title}`,
        authors,
        year: isNaN(year) ? new Date().getFullYear() : year,
        abstract,
        sourceURL: doc.url || `https://eric.ed.gov/?id=${doc.id}`,
        journal: doc.source,
        citations: 0,
        isOpenAccess: doc.ies_funded === 'T' || doc.e_direct === 'T',
        enrichmentSource: 'ERIC (Institute of Education Sciences)'
      };
    });

    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[ERIC Service] Search error:', err);
    return { papers: [], totalCount: 0 };
  }
};
