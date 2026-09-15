import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const ZENODO_API = 'https://zenodo.org/api/records';
const CACHE_TTL_MS = 5 * 60 * 1000;

export interface ZenodoRecord {
  id: number;
  doi?: string;
  metadata?: {
    title: string;
    description?: string;
    creators?: { name: string; orcid?: string }[];
    publication_date?: string;
    resource_type?: { type: string; title: string };
    keywords?: string[];
    access_right?: string;
    license?: { id: string };
  };
  links?: {
    html?: string;
    doi?: string;
    bucket?: string;
  };
}

export const searchZenodo = async (
  query: string,
  limit: number = 10
): Promise<{ records: ZenodoRecord[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `zenodo_${query}_${limit}`;
  const cached = getCache<{ records: ZenodoRecord[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/zenodo/search?q=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(url).catch(() =>
      fetch(`${ZENODO_API}?q=${encodeURIComponent(query)}&size=${limit}&sort=bestmatch`, {
        headers: { 'User-Agent': 'ScholarExplorer/1.0 (mailto:scholar-explorer@gmail.com)' }
      })
    );

    if (!res.ok) return { records: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const records: ZenodoRecord[] = data.hits?.hits || [];
    const totalCount: number = data.hits?.total || records.length;

    const papers: ResearchPaper[] = records.map(r => {
      const meta = r.metadata || ({} as any);
      const title = meta.title ? meta.title.replace(/<[^>]+>/g, '').trim() : 'Untitled Open Science Record';
      const authors = (meta.creators || []).map((c: any) => c.name).filter(Boolean).join(', ') || 'CERN / Zenodo Researcher';
      const year = meta.publication_date ? new Date(meta.publication_date).getFullYear() : new Date().getFullYear();
      const rawDesc = meta.description ? meta.description.replace(/<[^>]+>/g, '').trim() : '';
      const typeTitle = meta.resource_type?.title || meta.resource_type?.type || 'Open Science Artifact';

      return {
        id: `zenodo:${r.doi || r.id}`,
        title: `[${typeTitle}] ${title}`,
        authors,
        year,
        abstract: rawDesc || `Open science research object (${typeTitle}) hosted at CERN Zenodo repository with DOI ${r.doi}.`,
        doi: r.doi,
        sourceURL: r.links?.html || (r.doi ? `https://doi.org/${r.doi}` : undefined),
        isOpenAccess: meta.access_right === 'open',
        enrichmentSource: `Zenodo / CERN Open Science (${typeTitle})`
      };
    });

    const result = { records, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[Zenodo Service] Search error:', err);
    return { records: [], totalCount: 0, papers: [] };
  }
};
