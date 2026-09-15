import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000;

export interface PubMedArticle {
  uid: string;
  title: string;
  authors?: { name: string }[];
  source?: string;
  pubdate?: string;
  articleids?: { idtype: string; value: string }[];
  sortpubdate?: string;
}

export const searchPubMed = async (
  query: string,
  limit: number = 10
): Promise<{ articles: PubMedArticle[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `pubmed_${query}_${limit}`;
  const cached = getCache<{ articles: PubMedArticle[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/pubmed/search?term=${encodeURIComponent(query)}&retmax=${limit}`;
    const res = await fetch(url);

    if (!res.ok) return { articles: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const idList: string[] = data.idList || [];
    const rawResult: Record<string, any> = data.result || {};
    const totalCount: number = data.count || idList.length;

    const articles: PubMedArticle[] = idList.map(uid => rawResult[uid]).filter(Boolean);

    const papers: ResearchPaper[] = articles.map(item => {
      const doiObj = item.articleids?.find(id => id.idtype === 'doi');
      const doi = doiObj ? doiObj.value : undefined;
      const pmcidObj = item.articleids?.find(id => id.idtype === 'pmc');
      const pmcid = pmcidObj ? pmcidObj.value : undefined;

      const authors = (item.authors || []).map(a => a.name).filter(Boolean).join(', ') || 'Biomedical Researcher';
      const year = item.pubdate ? parseInt(item.pubdate.substring(0, 4), 10) : new Date().getFullYear();

      return {
        id: `pubmed:${item.uid}`,
        title: item.title?.replace(/<[^>]+>/g, '').trim() || 'Untitled Biomedical Work',
        authors,
        year: isNaN(year) ? new Date().getFullYear() : year,
        abstract: `Biomedical article indexed in National Library of Medicine (NLM) PubMed / MEDLINE under PMID ${item.uid}.`,
        doi,
        sourceURL: `https://pubmed.ncbi.nlm.nih.gov/${item.uid}/`,
        pdfURL: pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/pdf/` : undefined,
        journal: item.source,
        citations: 0,
        isOpenAccess: !!pmcid,
        enrichmentSource: 'PubMed / NCBI MEDLINE'
      };
    });

    const result = { articles, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[PubMed Service] Search error:', err);
    return { articles: [], totalCount: 0, papers: [] };
  }
};
