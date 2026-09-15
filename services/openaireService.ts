import type { OpenAireProject, ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const OPENAIRE_API_BASE = 'https://api.openaire.eu/search';
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Search European & global research grants (Horizon Europe, ERC, NIH, NSF, Wellcome Trust) via OpenAIRE Graph
 */
export const searchOpenAireProjects = async (
  query: string,
  limit: number = 10
): Promise<{ projects: OpenAireProject[]; totalCount: number }> => {
  const cacheKey = `openaire_projects_${query}_${limit}`;
  const cached = getCache<{ projects: OpenAireProject[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/openaire/projects?keywords=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(url).catch(() => 
      fetch(`${OPENAIRE_API_BASE}/projects?keywords=${encodeURIComponent(query)}&size=${limit}&format=json`)
    );

    if (!res.ok) return { projects: [], totalCount: 0 };
    const json = await res.json();
    
    // Parse OpenAIRE standard response structure
    const results = json.response?.results?.result || [];
    const items = Array.isArray(results) ? results : [results].filter(Boolean);

    const projects: OpenAireProject[] = items.map((item: any) => {
      const metadata = item.metadata?.['oaf:entity']?.['oaf:project'] || {};
      const funderObj = metadata.fundingtree?.funder || {};
      
      return {
        id: metadata.id || item.header?.['dri:objIdentifier'] || `openaire-${Math.random().toString(36).substring(2, 9)}`,
        code: metadata.code || metadata.grantAgreementNumber || 'N/A',
        title: metadata.title?.['$'] || metadata.title || 'Untitled Grant Agreement',
        acronym: metadata.acronym || undefined,
        funder: funderObj.name || funderObj.shortname || 'European Commission / International Funder',
        fundingStream: metadata.fundingtree?.funding_level_0?.name || metadata.fundingStream || 'Horizon Europe / FP',
        startDate: metadata.startdate || undefined,
        endDate: metadata.enddate || undefined,
        openAccessMandatePublications: metadata.openAccessMandatePublications === 'true',
        openAccessMandateDatasets: metadata.openAccessMandateDatasets === 'true',
        websiteUrl: metadata.websiteurl || undefined,
        publicationsCount: parseInt(metadata.totalPublications || '0', 10),
        datasetsCount: parseInt(metadata.totalDatasets || '0', 10)
      };
    });

    const totalCount = parseInt(json.response?.header?.total?.['$'] || json.response?.header?.total || `${projects.length}`, 10);
    const result = { projects, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (err) {
    console.warn('[OpenAIRE Service] Projects lookup error:', err);
    return { projects: [], totalCount: 0 };
  }
};

/**
 * Search publications indexed in OpenAIRE Graph
 */
export const searchOpenAirePublications = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
  const cacheKey = `openaire_pubs_${query}_${limit}`;
  const cached = getCache<{ papers: ResearchPaper[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/openaire/publications?keywords=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(url).catch(() =>
      fetch(`${OPENAIRE_API_BASE}/publications?keywords=${encodeURIComponent(query)}&size=${limit}&format=json`)
    );

    if (!res.ok) return { papers: [], totalCount: 0 };
    const json = await res.json();

    const results = json.response?.results?.result || [];
    const items = Array.isArray(results) ? results : [results].filter(Boolean);

    const papers: ResearchPaper[] = items.map((item: any) => {
      const meta = item.metadata?.['oaf:entity']?.['oaf:result'] || {};
      const pids = meta.pid || [];
      const pidArr = Array.isArray(pids) ? pids : [pids];
      const doiObj = pidArr.find((p: any) => p?.['@classid'] === 'doi');
      const doi = doiObj ? doiObj['$'] : undefined;

      const authorsRaw = meta.creator || [];
      const authorsArr = Array.isArray(authorsRaw) ? authorsRaw : [authorsRaw];
      const authors = authorsArr.map((a: any) => a?.['$'] || a?.name || '').filter(Boolean).join(', ') || 'OpenAIRE Contributor';

      const title = meta.title?.['$'] || meta.title || 'Untitled OpenAIRE Work';
      const year = meta.dateofacceptance ? new Date(meta.dateofacceptance).getFullYear() : (meta.publicationYear || new Date().getFullYear());
      const description = meta.description?.['$'] || meta.description || 'Open science publication indexed in European OpenAIRE Graph.';

      return {
        id: `openaire:${item.header?.['dri:objIdentifier'] || doi || Math.random().toString(36).substring(2, 9)}`,
        title,
        authors,
        year,
        abstract: description,
        doi,
        sourceURL: doi ? `https://doi.org/${doi}` : undefined,
        isOpenAccess: meta.bestaccessright?.['@classid'] === 'OPEN',
        enrichmentSource: 'OpenAIRE Graph (EU Open Science)'
      };
    });

    const totalCount = parseInt(json.response?.header?.total?.['$'] || json.response?.header?.total || `${papers.length}`, 10);
    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (e) {
    console.warn('[OpenAIRE Service] Publications lookup error:', e);
    return { papers: [], totalCount: 0 };
  }
};
