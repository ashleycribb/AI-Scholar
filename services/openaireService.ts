import type { OpenAireProject, ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const OPENAIRE_API_BASE = 'https://api.openaire.eu/search';
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Safely extracts a clean string from OpenAIRE XML-to-JSON structures.
 * OpenAIRE response fields are often objects with '$' or '#text', or arrays of such objects.
 */
function extractString(val: any, fallback = ''): string {
  if (!val) return fallback;
  if (typeof val === 'string') return val.trim();
  if (Array.isArray(val)) {
    for (const item of val) {
      const s = extractString(item);
      if (s) return s;
    }
    return fallback;
  }
  if (typeof val === 'object') {
    if (typeof val['$'] === 'string') return val['$'].trim();
    if (typeof val['#text'] === 'string') return val['#text'].trim();
    if (typeof val['_'] === 'string') return val['_'].trim();
    if (typeof val['value'] === 'string') return val['value'].trim();
    if (typeof val['name'] === 'string') return val['name'].trim();
    const vals = Object.values(val);
    for (const item of vals) {
      if (typeof item === 'string' && item.trim()) return item.trim();
    }
  }
  return fallback;
}

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

    const projects: OpenAireProject[] = items.map((item: any, idx: number) => {
      const metadata = item.metadata?.['oaf:entity']?.['oaf:project'] || {};
      const funderObj = metadata.fundingtree?.funder || {};
      
      const rawId = metadata.id || item.header?.['dri:objIdentifier'];
      const safeId = extractString(rawId) || `openaire-project-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
      const title = extractString(metadata.title, 'Untitled Grant Agreement');
      const code = extractString(metadata.code) || extractString(metadata.grantAgreementNumber) || 'N/A';
      const acronym = extractString(metadata.acronym) || undefined;
      const funder = extractString(funderObj.name) || extractString(funderObj.shortname) || 'European Commission / International Funder';
      const fundingStream = extractString(metadata.fundingtree?.funding_level_0?.name) || extractString(metadata.fundingStream) || 'Horizon Europe / FP';
      const startDate = extractString(metadata.startdate) || undefined;
      const endDate = extractString(metadata.enddate) || undefined;
      const websiteUrl = extractString(metadata.websiteurl) || undefined;

      return {
        id: safeId,
        code,
        title,
        acronym,
        funder,
        fundingStream,
        startDate,
        endDate,
        openAccessMandatePublications: String(extractString(metadata.openAccessMandatePublications)).toLowerCase() === 'true',
        openAccessMandateDatasets: String(extractString(metadata.openAccessMandateDatasets)).toLowerCase() === 'true',
        websiteUrl,
        publicationsCount: parseInt(extractString(metadata.totalPublications, '0'), 10) || 0,
        datasetsCount: parseInt(extractString(metadata.totalDatasets, '0'), 10) || 0
      };
    });

    const totalCount = parseInt(extractString(json.response?.header?.total, `${projects.length}`), 10) || projects.length;
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

    const papers: ResearchPaper[] = items.map((item: any, idx: number) => {
      const meta = item.metadata?.['oaf:entity']?.['oaf:result'] || {};
      const pids = meta.pid || [];
      const pidArr = Array.isArray(pids) ? pids : [pids];
      const doiObj = pidArr.find((p: any) => p?.['@classid'] === 'doi');
      const doi = doiObj ? extractString(doiObj['$'] || doiObj) : undefined;

      const authorsRaw = meta.creator || [];
      const authorsArr = Array.isArray(authorsRaw) ? authorsRaw : [authorsRaw];
      const authors = authorsArr.map((a: any) => extractString(a?.['$'] || a?.name || a)).filter(Boolean).join(', ') || 'OpenAIRE Contributor';

      const title = extractString(meta.title, 'Untitled OpenAIRE Work');
      const yearRaw = extractString(meta.dateofacceptance) || extractString(meta.publicationYear);
      let year = new Date().getFullYear();
      if (yearRaw) {
        const parsed = parseInt(yearRaw.slice(0, 4), 10);
        if (Number.isFinite(parsed) && parsed > 1800) {
          year = parsed;
        }
      }
      const description = extractString(meta.description, 'Open science publication indexed in European OpenAIRE Graph.');

      const rawObjId = item.header?.['dri:objIdentifier'];
      let safeObjId = extractString(rawObjId);
      if (!safeObjId || safeObjId === '[object Object]') {
        safeObjId = (typeof doi === 'string' && doi && doi !== '[object Object]')
          ? doi
          : `pub-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 7)}`;
      }

      return {
        id: `openaire:${safeObjId}`,
        title,
        authors,
        year,
        abstract: description,
        doi,
        sourceURL: doi ? `https://doi.org/${doi}` : undefined,
        isOpenAccess: extractString(meta.bestaccessright?.['@classid']) === 'OPEN',
        enrichmentSource: 'OpenAIRE Graph (EU Open Science)'
      };
    });

    const totalCount = parseInt(extractString(json.response?.header?.total, `${papers.length}`), 10) || papers.length;
    const result = { papers, totalCount };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  } catch (e) {
    console.warn('[OpenAIRE Service] Publications lookup error:', e);
    return { papers: [], totalCount: 0 };
  }
};
