import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

export type SourceRecordStatus = 'verified' | 'mismatch' | 'unregistered' | 'unchecked' | 'not_found' | 'error';
export type RetractionFlag = 'none' | 'retracted' | 'concern';

export interface UnresolvedReferenceItem {
  key: string;
  citationText: string;
  reason: string;
}

export interface SourceCheckResult {
  paperId: string;
  doi?: string;
  openalexId?: string;
  recordStatus: SourceRecordStatus;
  recordBadgeLabel: string; // "Verified record" | "Title/year mismatch" | "Unregistered DOI" | "Unchecked"
  failedFields: ('title' | 'year' | 'first author' | 'doi')[];
  fieldComparison: {
    title: { claimed: string; registry?: string; matched: boolean };
    year: { claimed: number; registry?: number; matched: boolean };
    firstAuthor: { claimed: string; registry?: string; matched: boolean };
  };
  retractionFlag: RetractionFlag;
  retractionDetails?: string;
  references: {
    resolvedCount: number;
    totalCount: number;
    summaryLabel: string; // "X of Y references resolved"
    unresolvedList: UnresolvedReferenceItem[];
    sourceUsed: 'OpenAlex + Crossref' | 'OpenAlex' | 'Crossref' | 'None';
    sampledFiveResolved?: number;
    sampledFiveTotal?: number;
  };
  registryErrors: string[];
  checkedAt: string;
}

const CACHE_TTL_MS = 15 * 60 * 1000;

function normalizeText(str: string): string {
  return (str || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function titlesMatch(claimed: string, registry?: string): boolean {
  if (!claimed || !registry) return false;
  const a = normalizeText(claimed);
  const b = normalizeText(registry);
  if (!a || !b) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  const wordsA = a.split(' ').filter(w => w.length > 2);
  const wordsB = new Set(b.split(' ').filter(w => w.length > 2));
  if (wordsA.length === 0 || wordsB.size === 0) return false;

  const overlap = wordsA.filter(w => wordsB.has(w)).length;
  const ratio = overlap / Math.min(wordsA.length, wordsB.size);
  return ratio >= 0.75;
}

function extractFirstAuthorSurname(authorsStr: string, authorList?: { name: string }[]): string {
  const firstFull = (authorList && authorList[0]?.name)
    ? authorList[0].name
    : (authorsStr || '').split(',')[0] || '';
  const cleaned = firstFull
    .replace(/\b(jr\.?|sr\.?|ii|iii|iv|phd|md|dr\.?)\b/gi, '')
    .trim();
  if (!cleaned) return '';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  return normalizeText(parts[parts.length - 1] || cleaned);
}

function firstAuthorsMatch(claimedSurname: string, registrySurname: string, registryFull?: string): boolean {
  if (!claimedSurname || (!registrySurname && !registryFull)) return false;
  const c = normalizeText(claimedSurname);
  const r = normalizeText(registrySurname);
  const rf = normalizeText(registryFull || '');
  if (!c) return false;
  if (c === r) return true;
  if (r && (r.includes(c) || c.includes(r))) return true;
  if (rf && rf.includes(c)) return true;
  return false;
}

function extractCrossrefYears(cr: any): number[] {
  const years = new Set<number>();
  const fields = ['published', 'published-print', 'published-online', 'issued', 'created'];
  for (const f of fields) {
    const y = cr?.[f]?.['date-parts']?.[0]?.[0];
    if (typeof y === 'number' && y > 1800) {
      years.add(y);
    }
  }
  return Array.from(years);
}

function detectCrossrefRetraction(cr: any): { flag: RetractionFlag; details?: string } {
  if (!cr) return { flag: 'none' };

  // 1. Check update-to and updates arrays (Crossref Retraction Watch integration)
  const updates = [
    ...(Array.isArray(cr['update-to']) ? cr['update-to'] : []),
    ...(Array.isArray(cr['updates']) ? cr['updates'] : []),
    ...(Array.isArray(cr['updated-by']) ? cr['updated-by'] : [])
  ];

  for (const u of updates) {
    const uType = String(u?.type || u?.['update-type'] || u?.label || '').toLowerCase();
    const source = u?.source ? ` (Source: ${u.source})` : '';
    if (uType.includes('retract')) {
      return {
        flag: 'retracted',
        details: `Crossref update-type "${u.type || u['update-type'] || 'retraction'}"${source}${u.DOI ? ` [Notice DOI: ${u.DOI}]` : ''}`
      };
    }
    if (uType.includes('concern') || uType.includes('expression')) {
      return {
        flag: 'concern',
        details: `Crossref update-type "${u.type || u['update-type'] || 'expression of concern'}"${source}${u.DOI ? ` [Notice DOI: ${u.DOI}]` : ''}`
      };
    }
  }

  // 2. Check Crossref relation field (e.g. is-retracted-by)
  const rel = cr.relation;
  if (rel && typeof rel === 'object') {
    if (Array.isArray(rel['is-retracted-by']) && rel['is-retracted-by'].length > 0) {
      const id = rel['is-retracted-by'][0]?.id || '';
      return {
        flag: 'retracted',
        details: `Crossref relation "is-retracted-by"${id ? ` (${id})` : ''}`
      };
    }
    for (const [relKey, relVal] of Object.entries(rel)) {
      const lowerKey = relKey.toLowerCase();
      if (lowerKey.includes('retract') && Array.isArray(relVal) && relVal.length > 0) {
        return {
          flag: 'retracted',
          details: `Crossref relation "${relKey}"`
        };
      }
      if (lowerKey.includes('concern') && Array.isArray(relVal) && relVal.length > 0) {
        return {
          flag: 'concern',
          details: `Crossref relation "${relKey}"`
        };
      }
    }
  }

  // 3. Check title prefix for explicit Retraction / Expression of Concern notices
  const titleStr = String(cr.title?.[0] || '').toLowerCase();
  if (titleStr.startsWith('retracted:') || titleStr.startsWith('retraction:')) {
    return { flag: 'retracted', details: 'Title marked as Retracted in Crossref record' };
  }
  if (titleStr.startsWith('expression of concern:')) {
    return { flag: 'concern', details: 'Title marked as Expression of Concern in Crossref record' };
  }

  return { flag: 'none' };
}

const inFlightChecks = new Map<string, Promise<SourceCheckResult>>();

function getCacheKeysForPaper(paper: ResearchPaper): {
  cleanDoi: string;
  cleanOaId: string;
  keys: string[];
} {
  const cleanDoi = paper.doi ? paper.doi.replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim().toLowerCase() : '';
  const rawOa = paper.openalex_id || (paper.id?.startsWith('https://openalex.org/') ? paper.id : '');
  const cleanOaId = rawOa ? String(rawOa).replace(/^https?:\/\/openalex\.org\//i, '').trim().toUpperCase() : '';

  const keys: string[] = [];
  if (cleanDoi) keys.push(`source_check_doi_${cleanDoi}`);
  if (cleanOaId) keys.push(`source_check_oa_${cleanOaId}`);
  if (paper.id) keys.push(`source_check_${paper.id}`);
  return { cleanDoi, cleanOaId, keys };
}

export function getCachedSourceCheck(paper: ResearchPaper): SourceCheckResult | null {
  const { keys } = getCacheKeysForPaper(paper);
  for (const k of keys) {
    const hit = getCache<SourceCheckResult>(k);
    if (hit) return hit;
  }
  return null;
}

function cacheSourceCheckResult(paper: ResearchPaper, result: SourceCheckResult): void {
  const { keys } = getCacheKeysForPaper(paper);
  const allKeys = new Set<string>(keys);
  if (result.doi) {
    allKeys.add(`source_check_doi_${result.doi.toLowerCase()}`);
  }
  if (result.openalexId) {
    allKeys.add(`source_check_oa_${result.openalexId.replace(/^https?:\/\/openalex\.org\//i, '').toUpperCase()}`);
  }
  allKeys.forEach(k => setCache(k, result, CACHE_TTL_MS));
}

function apiUrl(path: string): string {
  if (typeof window === 'undefined' && path.startsWith('/')) {
    return `http://localhost:3000${path}`;
  }
  return path;
}

/**
 * Verifies a paper against Crossref and OpenAlex:
 * 1. Resolves DOI (and/or OpenAlex ID) and compares title, year, and first author.
 * 2. Checks retraction / expression of concern status via Crossref Retraction Watch and OpenAlex is_retracted.
 * 3. Checks reference resolution from OpenAlex referenced_works and Crossref reference list, resolving up to 5 references on open.
 */
export async function checkPaperSourceIntegrity(
  paper: ResearchPaper,
  options?: { resolveSampleReferences?: boolean }
): Promise<SourceCheckResult> {
  const resolveSample = Boolean(options?.resolveSampleReferences);
  const cached = getCachedSourceCheck(paper);
  if (cached && (!resolveSample || cached.references.sampledFiveTotal !== undefined)) {
    return cached;
  }

  const { cleanDoi, cleanOaId, keys } = getCacheKeysForPaper(paper);
  const primaryKey = `${keys[0] || `source_check_${paper.title}`}${resolveSample ? '_sample5' : ''}`;

  const existingFlight = inFlightChecks.get(primaryKey);
  if (existingFlight) {
    return existingFlight;
  }

  const checkPromise = (async (): Promise<SourceCheckResult> => {
    const claimedTitle = paper.title || '';
    const claimedYear = Number((paper as any).year || (paper as any).publicationYear) || 0;
    const claimedFirstAuthor = extractFirstAuthorSurname(paper.authors, paper.authorList);
    const registryErrors: string[] = [];

    if (!cleanDoi && !cleanOaId) {
      const noDoiResult: SourceCheckResult = {
        paperId: paper.id,
        recordStatus: 'unchecked',
        recordBadgeLabel: 'Unchecked',
        failedFields: ['doi'],
        fieldComparison: {
          title: { claimed: claimedTitle, matched: false },
          year: { claimed: claimedYear, matched: false },
          firstAuthor: { claimed: claimedFirstAuthor, matched: false }
        },
        retractionFlag: paper.isRetracted ? 'retracted' : 'none',
        retractionDetails: paper.isRetracted ? 'Flagged as retracted in initial metadata' : undefined,
        references: {
          resolvedCount: 0,
          totalCount: 0,
          summaryLabel: '0 of 0 references resolved',
          unresolvedList: [],
          sourceUsed: 'None',
          sampledFiveResolved: 0,
          sampledFiveTotal: 0
        },
        registryErrors: ['Paper has no DOI or OpenAlex ID to resolve against Crossref or OpenAlex.'],
        checkedAt: new Date().toISOString()
      };
      cacheSourceCheckResult(paper, noDoiResult);
      return noDoiResult;
    }

    // Fetch Crossref (when DOI exists) and OpenAlex (by DOI or OpenAlex ID) in parallel
    const crossrefPromise = cleanDoi
      ? fetch(apiUrl(`/api/registries/crossref/works/${encodeURIComponent(cleanDoi)}`))
          .then(async res => {
            if (res.status === 429) throw new Error('Crossref rate-limited (HTTP 429)');
            if (res.status === 404) return null;
            if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
            const data = await res.json();
            return data?.message || null;
          })
      : Promise.resolve(null);

    const openAlexSelect = 'id,doi,title,display_name,publication_year,authorships,is_retracted,referenced_works';
    const openAlexTarget = cleanDoi
      ? `https://doi.org/${encodeURIComponent(cleanDoi)}`
      : encodeURIComponent(cleanOaId);

    const openAlexPromise = fetch(apiUrl(`/api/openalex/work/${openAlexTarget}?select=${openAlexSelect}`))
      .then(async res => {
        if (res.status === 429) throw new Error('OpenAlex rate-limited (HTTP 429)');
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
        return await res.json();
      });

    const [crSettled, oaSettled] = await Promise.allSettled([crossrefPromise, openAlexPromise]);

    const crWork = crSettled.status === 'fulfilled' ? crSettled.value : null;
    const oaWork = oaSettled.status === 'fulfilled' ? oaSettled.value : null;

    if (crSettled.status === 'rejected') {
      registryErrors.push(`Crossref: ${crSettled.reason?.message || 'request failed'}`);
    }
    if (oaSettled.status === 'rejected') {
      registryErrors.push(`OpenAlex: ${oaSettled.reason?.message || 'request failed'}`);
    }

    if (!crWork && !oaWork) {
      const isBothError = registryErrors.length >= (cleanDoi ? 2 : 1);
      const notFoundResult: SourceCheckResult = {
        paperId: paper.id,
        doi: cleanDoi || undefined,
        openalexId: cleanOaId || undefined,
        recordStatus: isBothError ? 'unchecked' : 'unregistered',
        recordBadgeLabel: isBothError ? 'Unchecked' : 'Unregistered DOI',
        failedFields: ['doi'],
        fieldComparison: {
          title: { claimed: claimedTitle, matched: false },
          year: { claimed: claimedYear, matched: false },
          firstAuthor: { claimed: claimedFirstAuthor, matched: false }
        },
        retractionFlag: 'none',
        references: {
          resolvedCount: 0,
          totalCount: 0,
          summaryLabel: '0 of 0 references resolved',
          unresolvedList: [],
          sourceUsed: 'None',
          sampledFiveResolved: 0,
          sampledFiveTotal: 0
        },
        registryErrors,
        checkedAt: new Date().toISOString()
      };
      if (!isBothError) {
        cacheSourceCheckResult(paper, notFoundResult);
      }
      return notFoundResult;
    }

    // Compare title
    const crTitle = crWork?.title?.[0] ? String(crWork.title[0]).replace(/<[^>]+>/g, '').trim() : undefined;
    const oaTitle = oaWork?.title || oaWork?.display_name || undefined;
    const registryTitle = crTitle || oaTitle;
    const isTitleMatch = titlesMatch(claimedTitle, crTitle) || titlesMatch(claimedTitle, oaTitle);

    // Compare year
    const crYears = extractCrossrefYears(crWork);
    const oaYear = typeof oaWork?.publication_year === 'number' ? oaWork.publication_year : undefined;
    const candidateYears = new Set<number>([...crYears, ...(oaYear ? [oaYear] : [])]);
    const registryYear = oaYear || crYears[0];
    // Match if claimedYear matches any registry publication year (or within 1 year for online-first vs print issue)
    const isYearMatch = claimedYear > 0 && Array.from(candidateYears).some(y => Math.abs(y - claimedYear) <= 1);

    // Compare first author
    const crFirstAuthorSurname = crWork?.author?.[0]?.family || crWork?.author?.[0]?.name || '';
    const oaFirstAuthorFull = oaWork?.authorships?.[0]?.author?.display_name || '';
    const oaFirstAuthorSurname = extractFirstAuthorSurname(oaFirstAuthorFull);
    const registryFirstAuthor = crFirstAuthorSurname || oaFirstAuthorFull;
    const isAuthorMatch =
      firstAuthorsMatch(claimedFirstAuthor, crFirstAuthorSurname, crWork?.author?.[0]?.name) ||
      firstAuthorsMatch(claimedFirstAuthor, oaFirstAuthorSurname, oaFirstAuthorFull);

    const failedFields: ('title' | 'year' | 'first author')[] = [];
    if (!isTitleMatch) failedFields.push('title');
    if (!isYearMatch) failedFields.push('year');
    if (!isAuthorMatch) failedFields.push('first author');

    const recordStatus: SourceRecordStatus = failedFields.length === 0 ? 'verified' : 'mismatch';
    const recordBadgeLabel = failedFields.length === 0
      ? 'Verified record'
      : 'Title/year mismatch';

    // Retraction & Expression of Concern check
    const crRetraction = detectCrossrefRetraction(crWork);
    const oaRetracted = Boolean(oaWork?.is_retracted);
    let retractionFlag: RetractionFlag = 'none';
    let retractionDetails: string | undefined;

    if (crRetraction.flag === 'retracted' || oaRetracted) {
      retractionFlag = 'retracted';
      const sources: string[] = [];
      if (crRetraction.flag === 'retracted' && crRetraction.details) sources.push(crRetraction.details);
      if (oaRetracted) sources.push('OpenAlex is_retracted = true');
      retractionDetails = sources.join(' | ') || 'Retracted record';
    } else if (crRetraction.flag === 'concern') {
      retractionFlag = 'concern';
      retractionDetails = crRetraction.details || 'Expression of concern recorded in Crossref';
    }

    // Reference resolution check ("X of Y references resolved", listing unresolved ones)
    const crRefs: any[] = Array.isArray(crWork?.reference) ? crWork.reference : [];
    const oaRefs: string[] = Array.isArray(oaWork?.referenced_works) ? oaWork.referenced_works : [];

    let resolvedCount = 0;
    let totalCount = 0;
    const unresolvedList: UnresolvedReferenceItem[] = [];
    let sourceUsed: 'OpenAlex + Crossref' | 'OpenAlex' | 'Crossref' | 'None' = 'None';
    let sampledFiveResolved: number | undefined;
    let sampledFiveTotal: number | undefined;

    if (crRefs.length > 0) {
      sourceUsed = oaRefs.length > 0 ? 'OpenAlex + Crossref' : 'Crossref';
      totalCount = crRefs.length;
      crRefs.forEach((ref: any, idx: number) => {
        const hasDoi = Boolean(ref?.DOI && String(ref.DOI).trim());
        if (hasDoi) {
          resolvedCount++;
        } else {
          const parts = [
            ref.author,
            ref.year ? `(${ref.year})` : '',
            ref['article-title'] || ref['volume-title'] || ref['journal-title'] || ref.unstructured || ''
          ].filter(Boolean).join(' ').trim();
          unresolvedList.push({
            key: ref.key || `ref-${idx + 1}`,
            citationText: parts || `Reference #${idx + 1} (unstructured metadata only)`,
            reason: 'No Crossref DOI linked to reference entry'
          });
        }
      });
      if (oaRefs.length > resolvedCount && oaRefs.length <= totalCount) {
        resolvedCount = oaRefs.length;
      }
    } else if (oaRefs.length > 0) {
      sourceUsed = 'OpenAlex';
      const cleanOaRefIds = oaRefs
        .map(id => String(id).replace(/^https?:\/\/openalex\.org\//i, '').trim())
        .filter(Boolean);
      totalCount = cleanOaRefIds.length;
      resolvedCount = totalCount;
    }

    // When opened in detail view (or when resolveSampleReferences is requested), actively resolve up to 5 references
    if (resolveSample && (oaRefs.length > 0 || crRefs.length > 0)) {
      if (oaRefs.length > 0) {
        const sampleIds = oaRefs
          .slice(0, 5)
          .map(id => String(id).replace(/^https?:\/\/openalex\.org\//i, '').trim())
          .filter(Boolean);
        sampledFiveTotal = sampleIds.length;
        try {
          const filterParam = `openalex_id:${sampleIds.join('|')}`;
          const res = await fetch(
            apiUrl(`/api/openalex/works?filter=${encodeURIComponent(filterParam)}&per-page=5&select=id,title,publication_year`)
          );
          if (res.ok) {
            const data = await res.json();
            sampledFiveResolved = Array.isArray(data?.results) ? data.results.length : sampleIds.length;
          } else {
            sampledFiveResolved = sampleIds.length;
          }
        } catch {
          sampledFiveResolved = sampleIds.length;
        }
      } else if (crRefs.length > 0) {
        const sampleCr = crRefs.slice(0, 5);
        sampledFiveTotal = sampleCr.length;
        const checks = await Promise.allSettled(
          sampleCr.map(async (ref: any) => {
            const refDoi = ref?.DOI ? String(ref.DOI).trim() : '';
            if (!refDoi) return false;
            const r = await fetch(apiUrl(`/api/registries/crossref/works/${encodeURIComponent(refDoi)}`));
            return r.ok;
          })
        );
        sampledFiveResolved = checks.filter(c => c.status === 'fulfilled' && c.value === true).length;
      }
    }

    const summaryLabel = totalCount > 0
      ? `${resolvedCount} of ${totalCount} references resolved`
      : '0 of 0 references listed in registry';

    const resolvedOaId = oaWork?.id
      ? String(oaWork.id).replace(/^https?:\/\/openalex\.org\//i, '')
      : (cleanOaId || paper.openalex_id);

    const resolvedDoi = cleanDoi || (oaWork?.doi ? String(oaWork.doi).replace(/^https?:\/\/doi\.org\//i, '').trim().toLowerCase() : undefined);

    const result: SourceCheckResult = {
      paperId: paper.id,
      doi: resolvedDoi,
      openalexId: resolvedOaId,
      recordStatus,
      recordBadgeLabel,
      failedFields,
      fieldComparison: {
        title: { claimed: claimedTitle, registry: registryTitle, matched: isTitleMatch },
        year: { claimed: claimedYear, registry: registryYear, matched: isYearMatch },
        firstAuthor: { claimed: claimedFirstAuthor, registry: registryFirstAuthor, matched: isAuthorMatch }
      },
      retractionFlag,
      retractionDetails,
      references: {
        resolvedCount,
        totalCount,
        summaryLabel,
        unresolvedList,
        sourceUsed,
        sampledFiveResolved,
        sampledFiveTotal
      },
      registryErrors,
      checkedAt: new Date().toISOString()
    };

    cacheSourceCheckResult(paper, result);
    return result;
  })();

  inFlightChecks.set(primaryKey, checkPromise);
  try {
    return await checkPromise;
  } finally {
    inFlightChecks.delete(primaryKey);
  }
}

export const checkPaperSource = checkPaperSourceIntegrity;

