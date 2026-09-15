import type { DblpPublication, ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const DBLP_API_BASE = 'https://dblp.org/search/publ/api';
const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchDBLP = async (
  query: string,
  limit: number = 10
): Promise<{ publications: DblpPublication[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `dblp_${query}_${limit}`;
  const cached = getCache<{ publications: DblpPublication[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/dblp/search?q=${encodeURIComponent(query)}&h=${limit}`;
    const res = await fetch(url).catch(() =>
      fetch(`${DBLP_API_BASE}?q=${encodeURIComponent(query)}&h=${limit}&format=json`)
    );

    if (!res.ok) return { publications: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const hits = data.result?.hits?.hit || [];
    const hitArr = Array.isArray(hits) ? hits : [hits].filter(Boolean);

    const publications: DblpPublication[] = hitArr.map((hit: any) => {
      const info = hit.info || {};
      const authorsRaw = info.authors?.author || [];
      const authorsArr = Array.isArray(authorsRaw) ? authorsRaw : [authorsRaw];
      const authors = authorsArr.map((a: any) => (typeof a === 'string' ? a : a?.text || '')).filter(Boolean);

      return {
        id: hit['@id'] || info.key || `dblp-${Math.random().toString(36).substring(2, 9)}`,
        key: info.key || '',
        title: info.title?.replace(/\.$/, '') || 'Untitled CS Publication',
        authors: authors.length > 0 ? authors : ['Computer Science Contributor'],
        year: parseInt(info.year || '0', 10),
        venue: info.venue || info.journal || info.booktitle,
        type: info.type || 'Publication',
        doi: info.doi,
        ee: info.ee,
        url: info.url
      };
    });

    const papers: ResearchPaper[] = publications.map(p => ({
      id: `dblp:${p.key || p.id}`,
      title: p.title,
      authors: p.authors.join(', '),
      year: p.year,
      abstract: `Computer Science publication indexed in DBLP. Venue: ${p.venue || 'Peer-Reviewed CS Proceedings'}.`,
      doi: p.doi,
      sourceURL: p.ee || p.url,
      journal: p.venue,
      isOpenAccess: true,
      enrichmentSource: `DBLP (${p.venue || 'CS Venue'})`
    }));

    const totalCount = parseInt(data.result?.hits?.['@total'] || `${publications.length}`, 10);
    const result = { publications, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (e) {
    console.warn('[DBLP Service] Error:', e);
    return { publications: [], totalCount: 0, papers: [] };
  }
};
