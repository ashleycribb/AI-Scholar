import type { OpenCitationsLink } from '../types';
import { getCache, setCache } from '../utils/cache';

const OPENCITATIONS_COCI_BASE = 'https://opencitations.net/index/coci/api/v1';
const OPENCITATIONS_SPARQL_ENDPOINT = 'https://opencitations.net/sparql';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

/**
 * Standard SPARQL query template for OpenCitations linked data graph
 */
export const buildSparqlForDoiCitations = (doi: string, limit: number = 25): string => {
  const cleanDoi = doi.toLowerCase().replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim();
  return `PREFIX cito: <http://purl.org/spar/cito/>
PREFIX dcterms: <http://purl.org/dc/terms/>
PREFIX datacite: <http://purl.org/spar/datacite/>

SELECT ?citingDoi ?creationDate ?timespan WHERE {
  ?citation cito:hasCitedEntity <https://doi.org/${cleanDoi}> ;
            cito:hasCitingEntity ?citing ;
            cito:hasCitationCreationDate ?creationDate .
  BIND(STRAFTER(STR(?citing), "https://doi.org/") AS ?citingDoi)
  OPTIONAL { ?citation cito:hasCitationTimeSpan ?timespan . }
}
ORDER BY DESC(?creationDate)
LIMIT ${limit}`;
};

export const DEFAULT_OPENCITATIONS_SPARQL_QUERY = `PREFIX cito: <http://purl.org/spar/cito/>
PREFIX dcterms: <http://purl.org/dc/terms/>

SELECT ?citing ?cited ?date WHERE {
  ?citation cito:hasCitedEntity ?cited ;
            cito:hasCitingEntity ?citing ;
            cito:hasCitationCreationDate ?date .
}
ORDER BY DESC(?date)
LIMIT 15`;

/**
 * Fetch works that cite a given DOI using OpenCitations COCI
 */
export const fetchCitationsByDoi = async (doi: string): Promise<OpenCitationsLink[]> => {
  if (!doi) return [];
  const cleanDoi = doi.toLowerCase().replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim();
  const cacheKey = `oc_citations_${cleanDoi}`;
  const cached = getCache<OpenCitationsLink[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/opencitations/citations/${encodeURIComponent(cleanDoi)}`;
    const res = await fetch(url).catch(() => fetch(`${OPENCITATIONS_COCI_BASE}/citations/${encodeURIComponent(cleanDoi)}`));
    
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const links: OpenCitationsLink[] = data.map((item: any) => ({
      citingDoi: item.citing || '',
      citedDoi: item.cited || cleanDoi,
      creationDate: item.creation || '',
      timespan: item.timespan || '',
      journalScind: item.journal_sc === 'yes',
      authorScind: item.author_sc === 'yes'
    }));

    setCache(cacheKey, links, CACHE_TTL_MS);
    return links;
  } catch (err) {
    console.warn('[OpenCitations Service] Citations lookup error:', err);
    return [];
  }
};

/**
 * Fetch reference list (works cited by this DOI) using OpenCitations COCI
 */
export const fetchReferencesByDoi = async (doi: string): Promise<OpenCitationsLink[]> => {
  if (!doi) return [];
  const cleanDoi = doi.toLowerCase().replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim();
  const cacheKey = `oc_references_${cleanDoi}`;
  const cached = getCache<OpenCitationsLink[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `/api/registries/opencitations/references/${encodeURIComponent(cleanDoi)}`;
    const res = await fetch(url).catch(() => fetch(`${OPENCITATIONS_COCI_BASE}/references/${encodeURIComponent(cleanDoi)}`));
    
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data)) return [];

    const links: OpenCitationsLink[] = data.map((item: any) => ({
      citingDoi: item.citing || cleanDoi,
      citedDoi: item.cited || '',
      creationDate: item.creation || '',
      timespan: item.timespan || '',
      journalScind: item.journal_sc === 'yes',
      authorScind: item.author_sc === 'yes'
    }));

    setCache(cacheKey, links, CACHE_TTL_MS);
    return links;
  } catch (err) {
    console.warn('[OpenCitations Service] References lookup error:', err);
    return [];
  }
};

/**
 * Execute raw SPARQL query against OpenCitations SPARQL endpoint
 */
export const executeOpenCitationsSparql = async (
  sparqlQuery: string
): Promise<{ bindings: any[]; headers: string[]; error?: string }> => {
  try {
    const res = await fetch('/api/registries/opencitations/sparql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sparqlQuery })
    }).catch(async () => {
      const encoded = encodeURIComponent(sparqlQuery);
      return fetch(`${OPENCITATIONS_SPARQL_ENDPOINT}?query=${encoded}&format=json`, {
        headers: { 'Accept': 'application/sparql-results+json' }
      });
    });

    if (!res.ok) {
      const errText = await res.text();
      return { bindings: [], headers: [], error: `SPARQL endpoint returned ${res.status}: ${errText}` };
    }

    const json = await res.json();
    const headers = json.head?.vars || [];
    const rawBindings = json.results?.bindings || [];

    const bindings = rawBindings.map((row: any) => {
      const formatted: Record<string, string> = {};
      headers.forEach((h: string) => {
        formatted[h] = row[h]?.value || '';
      });
      return formatted;
    });

    return { bindings, headers };
  } catch (e: any) {
    return { bindings: [], headers: [], error: e.message || 'Failed to query SPARQL endpoint' };
  }
};
