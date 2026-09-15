import type { EuropePmcArticle, ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const EUROPE_PMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const CACHE_TTL_MS = 5 * 60 * 1000;

export const searchEuropePMC = async (
  query: string,
  limit: number = 10,
  page: number = 1
): Promise<{ articles: EuropePmcArticle[]; totalCount: number; papers: ResearchPaper[] }> => {
  const cacheKey = `epmc_${query}_${limit}_${page}`;
  const cached = getCache<{ articles: EuropePmcArticle[]; totalCount: number; papers: ResearchPaper[] }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/europepmc/search?query=${encodeURIComponent(query)}&pageSize=${limit}&page=${page}`;
    const res = await fetch(url).catch(() =>
      fetch(`${EUROPE_PMC_API}?query=${encodeURIComponent(query)}&pageSize=${limit}&page=${page}&format=json&resultType=core`)
    );

    if (!res.ok) return { articles: [], totalCount: 0, papers: [] };
    const data = await res.json();
    const resultList = data.resultList?.result || [];

    const articles: EuropePmcArticle[] = resultList.map((item: any) => ({
      id: item.id || item.pmid || `epmc-${Math.random().toString(36).substring(2, 9)}`,
      pmid: item.pmid,
      pmcid: item.pmcid,
      doi: item.doi,
      title: item.title?.replace(/<[^>]+>/g, '') || 'Untitled Article',
      authorString: item.authorString || 'Unknown Biomedical Authors',
      journalTitle: item.journalTitle || item.journalInfo?.journal?.title,
      pubYear: parseInt(item.pubYear || '0', 10),
      abstractText: item.abstractText?.replace(/<[^>]+>/g, '') || '',
      isOpenAccess: item.isOpenAccess === 'Y',
      inEpmc: item.inEPMC === 'Y',
      hasPDF: item.hasPDF === 'Y',
      citedByCount: parseInt(item.citedByCount || '0', 10),
      meshTerms: (item.meshHeadingList?.meshHeading || []).map((m: any) => m.descriptorName),
      grants: (item.grantsList?.grant || []).map((g: any) => ({ grantId: g.grantId, agency: g.agency })),
      fullTextUrl: item.pmcid ? `https://europepmc.org/articles/${item.pmcid}` : (item.doi ? `https://doi.org/${item.doi}` : undefined)
    }));

    const papers: ResearchPaper[] = articles.map(a => ({
      id: `epmc:${a.pmid || a.pmcid || a.id}`,
      title: a.title,
      authors: a.authorString || 'Biomedical Researcher',
      year: a.pubYear,
      abstract: a.abstractText || 'Biomedical publication indexed in Europe PMC / PubMed Central.',
      doi: a.doi,
      sourceURL: a.fullTextUrl,
      pdfURL: a.hasPDF && a.pmcid ? `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${a.pmcid}&blobtype=pdf` : undefined,
      journal: a.journalTitle,
      citations: a.citedByCount || 0,
      isOpenAccess: a.isOpenAccess,
      enrichmentSource: 'Europe PMC / PubMed Central'
    }));

    const totalCount = data.hitCount || articles.length;
    const result = { articles, totalCount, papers };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[Europe PMC Service] Error:', err);
    return { articles: [], totalCount: 0, papers: [] };
  }
};
