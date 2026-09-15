import type { DataCiteWork, ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const DATACITE_GRAPHQL_ENDPOINT = 'https://api.datacite.org/graphql';
const DATACITE_REST_ENDPOINT = 'https://api.datacite.org/dois';
const CACHE_TTL_MS = 5 * 60 * 1000;

export const DEFAULT_DATACITE_GRAPHQL_QUERY = `
query SearchDataCiteWorks($query: String, $first: Int) {
  works(query: $query, first: $first) {
    totalCount
    nodes {
      id
      doi
      titles {
        title
      }
      descriptions {
        description
      }
      creators {
        name
        givenName
        familyName
        affiliation {
          name
        }
      }
      publicationYear
      types {
        resourceTypeGeneral
        resourceType
      }
      citationCount
      viewCount
      downloadCount
      fundingReferences {
        funderName
        funderIdentifier
        awardNumber
        awardTitle
      }
      rights {
        rights
        rightsUri
      }
      url
    }
  }
}
`;

/**
 * Execute raw GraphQL query against DataCite PID Graph API
 */
export const executeDataCiteGraphQL = async (
  query: string = DEFAULT_DATACITE_GRAPHQL_QUERY,
  variables: { query?: string; first?: number } = {}
): Promise<{ data: any; errors?: any }> => {
  try {
    // Try backend proxy first for caching/rate limits, then direct
    const res = await fetch('/api/registries/datacite/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables })
    }).catch(async () => {
      // Fallback direct request
      return fetch(DATACITE_GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables })
      });
    });

    if (res.ok) {
      return await res.json();
    }
    const errorText = await res.text();
    return { data: null, errors: [{ message: `DataCite HTTP ${res.status}: ${errorText}` }] };
  } catch (error: any) {
    return { data: null, errors: [{ message: error.message || 'DataCite GraphQL network error' }] };
  }
};

/**
 * Search DataCite PID Graph for datasets, software, preprints, and research outputs
 */
export const queryDataCiteGraphQL = async (
  searchQuery: string,
  limit: number = 10,
  resourceType?: string
): Promise<{ works: DataCiteWork[]; totalCount: number }> => {
  const cacheKey = `datacite_gql_${searchQuery}_${limit}_${resourceType || 'all'}`;
  const cached = getCache<{ works: DataCiteWork[]; totalCount: number }>(cacheKey);
  if (cached) return cached;

  const formattedQuery = resourceType 
    ? `${searchQuery} AND types.resourceTypeGeneral:${resourceType}` 
    : searchQuery;

  const res = await executeDataCiteGraphQL(DEFAULT_DATACITE_GRAPHQL_QUERY, {
    query: formattedQuery,
    first: limit
  });

  if (res.data?.works?.nodes) {
    const nodes = res.data.works.nodes;
    const works: DataCiteWork[] = nodes.map((node: any) => ({
      id: node.id || node.doi,
      doi: node.doi || (node.id?.startsWith('https://doi.org/') ? node.id.replace('https://doi.org/', '') : node.id),
      title: node.titles?.[0]?.title || 'Untitled DataCite Object',
      description: node.descriptions?.[0]?.description || '',
      creators: (node.creators || []).map((c: any) => ({
        name: c.name || `${c.givenName || ''} ${c.familyName || ''}`.trim() || 'Unknown Creator',
        orcid: c.nameIdentifiers?.find((id: any) => id.nameIdentifierScheme === 'ORCID')?.nameIdentifier
      })),
      publicationYear: node.publicationYear || new Date().getFullYear(),
      resourceTypeGeneral: node.types?.resourceTypeGeneral || 'Dataset',
      resourceType: node.types?.resourceType || '',
      citationsCount: node.citationCount || 0,
      viewsCount: node.viewCount || 0,
      downloadsCount: node.downloadCount || 0,
      fundingReferences: node.fundingReferences || [],
      license: node.rights?.[0]?.rights || node.rightsList?.[0]?.rights || 'Open Access / CC0',
      url: node.url || (node.doi ? `https://doi.org/${node.doi}` : undefined)
    }));

    const result = { works, totalCount: res.data.works.totalCount || works.length };
    setCache(cacheKey, result, CACHE_TTL_MS);
    return result;
  }

  // Fallback to DataCite REST API
  return searchDataCiteREST(searchQuery, limit);
};

/**
 * DataCite REST API Fallback
 */
export const searchDataCiteREST = async (
  query: string,
  limit: number = 10
): Promise<{ works: DataCiteWork[]; totalCount: number }> => {
  try {
    const url = `/api/registries/datacite/search?query=${encodeURIComponent(query)}&limit=${limit}`;
    const res = await fetch(url).catch(() => fetch(`${DATACITE_REST_ENDPOINT}?query=${encodeURIComponent(query)}&page[size]=${limit}`));
    
    if (!res.ok) return { works: [], totalCount: 0 };
    const json = await res.json();
    const dataItems = json.data || [];

    const works: DataCiteWork[] = dataItems.map((item: any) => {
      const attrs = item.attributes || {};
      return {
        id: item.id,
        doi: attrs.doi || item.id,
        title: attrs.titles?.[0]?.title || 'Untitled Object',
        description: attrs.descriptions?.[0]?.description || '',
        creators: (attrs.creators || []).map((c: any) => ({
          name: c.name || `${c.givenName || ''} ${c.familyName || ''}`.trim() || 'Unknown Creator',
          orcid: c.nameIdentifiers?.find((id: any) => id.nameIdentifierScheme === 'ORCID')?.nameIdentifier
        })),
        publicationYear: attrs.publicationYear || new Date().getFullYear(),
        resourceTypeGeneral: attrs.types?.resourceTypeGeneral || 'Dataset',
        resourceType: attrs.types?.resourceType || '',
        citationsCount: attrs.citationCount || 0,
        viewsCount: attrs.viewCount || 0,
        downloadsCount: attrs.downloadCount || 0,
        fundingReferences: attrs.fundingReferences || [],
        license: attrs.rightsList?.[0]?.rights || 'Open Access',
        url: attrs.url || `https://doi.org/${attrs.doi || item.id}`
      };
    });

    return { works, totalCount: json.meta?.total || works.length };
  } catch (e) {
    console.warn('[DataCite Service] Search error:', e);
    return { works: [], totalCount: 0 };
  }
};

/**
 * Maps DataCite records directly to Scholar Explorer's standard ResearchPaper interface
 */
export const searchDataCiteAsResearchPapers = async (
  query: string,
  limit: number = 10
): Promise<{ papers: ResearchPaper[]; hasMore: boolean }> => {
  const { works, totalCount } = await queryDataCiteGraphQL(query, limit);

  const papers: ResearchPaper[] = works.map(w => ({
    id: `datacite:${w.doi || w.id}`,
    title: `[${w.resourceTypeGeneral || 'Dataset'}] ${w.title}`,
    authors: w.creators.map(c => c.name).join(', ') || 'DataCite Contributor',
    year: w.publicationYear || 0,
    abstract: w.description || `DataCite registered ${w.resourceTypeGeneral || 'dataset/software'} artifact with DOI ${w.doi}.`,
    sourceURL: w.url || (w.doi ? `https://doi.org/${w.doi}` : undefined),
    doi: w.doi,
    citations: w.citationsCount || 0,
    isOpenAccess: true,
    enrichmentSource: `DataCite (${w.resourceTypeGeneral || 'PID Graph'})`
  }));

  return { papers, hasMore: totalCount > limit };
};
