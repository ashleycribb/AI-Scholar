import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CROSSREF_API = 'https://api.crossref.org/works';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface CrossrefItem {
  DOI: string;
  title?: string[];
  author?: { given?: string; family?: string; name?: string }[];
  published?: { 'date-parts'?: number[][] };
  'published-print'?: { 'date-parts'?: number[][] };
  'published-online'?: { 'date-parts'?: number[][] };
  created?: { 'date-parts'?: number[][] };
  abstract?: string;
  'container-title'?: string[];
  'is-referenced-by-count'?: number;
  URL?: string;
  type?: string;
  publisher?: string;
  funder?: { name?: string; award?: string[] }[];
  license?: { URL?: string }[];
}

export const searchCrossref = async (
  query: string,
  limit: number = 10
): Promise<{ items: CrossrefItem[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `crossref_${query}_${limit}`;
  const cached = getCache<{ items: CrossrefItem[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/crossref/search?query=${encodeURIComponent(query)}&rows=${limit}&sort=relevance`;
    const res = await fetch(url).catch(() =>
      fetch(`${CROSSREF_API}?query=${encodeURIComponent(query)}&rows=${limit}&sort=relevance`, {
        headers: { 'User-Agent': 'ScholarExplorer/1.0 (mailto:scholar-explorer@gmail.com)' }
      })
    );

    if (!res.ok) return { items: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const items: CrossrefItem[] = data.message?.items || [];
    const totalCount: number = data.message?.['total-results'] || items.length;

    const papers: ResearchPaper[] = items.map(item => {
      const title = item.title?.[0] ? item.title[0].replace(/<[^>]+>/g, '').trim() : 'Untitled Scholarly Work';
      const authors = (item.author || []).map(a => `${a.given || ''} ${a.family || a.name || ''}`.trim()).filter(Boolean).join(', ') || 'Scholarly Contributor';
      
      const dateParts = item.published?.['date-parts']?.[0] || 
                        item['published-online']?.['date-parts']?.[0] || 
                        item['published-print']?.['date-parts']?.[0] || 
                        item.created?.['date-parts']?.[0];
      const year = dateParts?.[0] || new Date().getFullYear();

      const abstract = item.abstract 
        ? item.abstract.replace(/<[^>]+>/g, '').trim() 
        : `Peer-reviewed publication registered with Crossref DOI: ${item.DOI}.`;

      return {
        id: `crossref:${item.DOI}`,
        title,
        authors,
        year,
        abstract,
        doi: item.DOI,
        sourceURL: item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : undefined),
        journal: item['container-title']?.[0],
        citations: item['is-referenced-by-count'] || 0,
        isOpenAccess: !!item.license?.length,
        enrichmentSource: `Crossref Metadata Registry (${item.type || 'Journal Article'})`
      };
    });

    const result = { items, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[Crossref Service] Search error:', err);
    return { items: [], totalCount: 0, papers: [] };
  }
};

export type CrossrefWork = CrossrefItem;

export const fetchWorkByDoi = async (doi: string): Promise<CrossrefWork | null> => {
  const cleanDoi = doi.trim();
  const cacheKey = `crossref_doi_${cleanDoi}`;
  const cached = getCache<CrossrefWork>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/crossref/works/${encodeURIComponent(cleanDoi)}`;
    const res = await fetch(url).catch(() =>
      fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}`, {
        headers: { 'User-Agent': 'ScholarExplorer/1.0 (mailto:scholar-explorer@gmail.com)' }
      })
    );
    if (!res.ok) return null;
    const data = await res.json();
    const item = data.message;
    if (item) {
      setCache(cacheKey, item, CACHE_TTL_MS);
      return item;
    }
    return null;
  } catch (err) {
    console.warn('[Crossref Service] fetchWorkByDoi error:', err);
    return null;
  }
};

export const fetchPaperFromCrossref = async (paper: Partial<ResearchPaper>): Promise<CrossrefWork | null> => {
  if (paper.doi) {
    const work = await fetchWorkByDoi(paper.doi);
    if (work) return work;
  }
  if (!paper.title) return null;
  const searchRes = await searchCrossref(paper.title, 3);
  return searchRes.items[0] || null;
};

export const fetchCslFromCrossref = async (doi: string): Promise<any> => {
  const cleanDoi = doi.trim();
  const cacheKey = `crossref_csl_${cleanDoi}`;
  const cached = getCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(cleanDoi)}/transform/application/vnd.citationstyles.csl+json`, {
      headers: {
        'Accept': 'application/vnd.citationstyles.csl+json',
        'User-Agent': 'ScholarExplorer/1.0 (mailto:scholar-explorer@gmail.com)'
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data) {
      setCache(cacheKey, data, CACHE_TTL_MS);
      return data;
    }
    return null;
  } catch (err) {
    console.warn('[Crossref Service] fetchCslFromCrossref error:', err);
    return null;
  }
};
