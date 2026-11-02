import type { ResearchPaper, PaperReference } from '../types';

export interface CitingPaperInfo {
  id: string;
  title: string;
  year?: number;
  doi?: string;
}

export interface FrequentlyCitedItem {
  id: string;
  title: string;
  authors: string;
  year?: number;
  doi?: string;
  openalex_id?: string;
  sourceURL?: string;
  count: number;
  citedBy: CitingPaperInfo[];
}

export interface FrequentlyCitedOptions {
  topN?: number;
}

/**
 * Normalizes a DOI by stripping protocol and URL prefixes and lowercasing.
 */
export function normalizeDoi(doi?: string): string {
  if (!doi || typeof doi !== 'string') return '';
  return doi
    .trim()
    .toLowerCase()
    .replace(/^(https?:\/\/doi\.org\/|doi:)/i, '')
    .trim();
}

/**
 * Normalizes an OpenAlex ID (e.g. "https://openalex.org/W1234" -> "w1234").
 */
export function normalizeOpenAlexId(id?: string): string {
  if (!id || typeof id !== 'string') return '';
  return id
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/openalex\.org\//i, '')
    .trim();
}

/**
 * Normalizes a title for loose matching (lowercase, alphanumeric only, trimmed).
 */
export function normalizeTitle(title?: string): string {
  if (!title || typeof title !== 'string') return '';
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts a normalized list of references from a ResearchPaper.
 * Handles string references, PaperReference objects, and ResearchPaper objects.
 */
export function extractReferencesFromPaper(paper: ResearchPaper): PaperReference[] {
  const rawList: any[] = [];

  if (Array.isArray(paper.references)) {
    rawList.push(...paper.references);
  }
  if (Array.isArray((paper as any).referenceList)) {
    rawList.push(...(paper as any).referenceList);
  }
  if (Array.isArray((paper as any).referenced_works)) {
    rawList.push(...(paper as any).referenced_works);
  }
  if (Array.isArray((paper as any).referencedWorks)) {
    rawList.push(...(paper as any).referencedWorks);
  }

  const results: PaperReference[] = [];

  for (const item of rawList) {
    if (!item) continue;

    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (!trimmed) continue;

      if (/^10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+$/i.test(trimmed) || /^https?:\/\/doi\.org\//i.test(trimmed) || /^doi:/i.test(trimmed)) {
        results.push({
          doi: normalizeDoi(trimmed),
          title: `Paper (DOI: ${normalizeDoi(trimmed)})`
        });
      } else if (/^https?:\/\/openalex\.org\/[Ww]\d+/i.test(trimmed) || /^[Ww]\d+$/.test(trimmed)) {
        results.push({
          openalex_id: normalizeOpenAlexId(trimmed),
          title: `Paper (OpenAlex: ${normalizeOpenAlexId(trimmed).toUpperCase()})`
        });
      } else {
        results.push({
          title: trimmed
        });
      }
    } else if (typeof item === 'object') {
      const title =
        item.title ||
        item.display_name ||
        item['article-title'] ||
        item['volume-title'] ||
        item.unstructured ||
        (item.doi ? `Paper (DOI: ${normalizeDoi(item.doi)})` : '') ||
        (item.id ? `Work ${item.id}` : 'Untitled Reference');

      let authors = '';
      if (typeof item.authors === 'string') {
        authors = item.authors;
      } else if (Array.isArray(item.authors)) {
        authors = item.authors
          .map((a: any) => (typeof a === 'string' ? a : a?.name || a?.display_name || ''))
          .filter(Boolean)
          .join(', ');
      } else if (Array.isArray(item.authorList)) {
        authors = item.authorList.map((a: any) => a?.name || '').filter(Boolean).join(', ');
      }

      const year =
        typeof item.year === 'number'
          ? item.year
          : item.year
          ? parseInt(String(item.year), 10) || undefined
          : typeof item.publication_year === 'number'
          ? item.publication_year
          : undefined;

      const doi = normalizeDoi(item.doi || item.DOI);
      const openalexId = normalizeOpenAlexId(item.openalex_id || item.openalexId || (item.id && /^[Ww]\d+$/.test(item.id) ? item.id : undefined));

      results.push({
        id: item.id ? String(item.id) : undefined,
        doi: doi || undefined,
        openalex_id: openalexId || undefined,
        title: String(title).trim(),
        authors: authors || undefined,
        year,
        sourceURL: item.sourceURL || item.url || item.URL || (doi ? `https://doi.org/${doi}` : undefined)
      });
    }
  }

  return results;
}

/**
 * Checks if a reference matches an already-selected paper in the researcher's corpus.
 */
function isReferenceAlreadySelected(
  ref: PaperReference,
  selectedDoiSet: Set<string>,
  selectedOaSet: Set<string>,
  selectedIdSet: Set<string>,
  selectedTitleSet: Set<string>
): boolean {
  if (ref.doi && selectedDoiSet.has(ref.doi)) return true;
  if (ref.openalex_id && selectedOaSet.has(ref.openalex_id)) return true;
  if (ref.id && selectedIdSet.has(ref.id.toLowerCase())) return true;

  const normTitle = normalizeTitle(ref.title);
  if (normTitle && normTitle.length >= 4 && selectedTitleSet.has(normTitle)) {
    return true;
  }

  return false;
}

interface ReferenceAccumulator {
  canonicalId: string;
  doi?: string;
  openalex_id?: string;
  title: string;
  authors: string;
  year?: number;
  sourceURL?: string;
  citingPapers: Map<string, CitingPaperInfo>;
}

/**
 * Pure counting function: counts how often each reference appears across the
 * reference lists of the researcher's selected papers.
 *
 * Rules:
 * 1. Counts frequency strictly across selected papers' reference lists.
 * 2. Filters out any paper already present in the researcher's selected corpus.
 * 3. Shows which selected papers cite each candidate.
 * 4. Deduplicates multiple occurrences within a single citing paper (each selected
 *    paper contributes at most 1 count to a cited reference).
 * 5. Returns top N not-yet-selected papers sorted by citation count descending.
 * 6. NO AI judgment or relevance scoring is used; it only counts.
 */
export function countFrequentlyCitedReferences(
  selectedPapers: ResearchPaper[],
  options?: FrequentlyCitedOptions
): FrequentlyCitedItem[] {
  if (!Array.isArray(selectedPapers) || selectedPapers.length === 0) {
    return [];
  }

  const topN = options?.topN ?? 10;

  // Build lookup sets for selected papers to exclude them from suggestions
  const selectedDoiSet = new Set<string>();
  const selectedOaSet = new Set<string>();
  const selectedIdSet = new Set<string>();
  const selectedTitleSet = new Set<string>();

  for (const p of selectedPapers) {
    const doi = normalizeDoi(p.doi);
    if (doi) selectedDoiSet.add(doi);

    const oa = normalizeOpenAlexId(p.openalex_id);
    if (oa) selectedOaSet.add(oa);

    if (p.id) selectedIdSet.add(p.id.toLowerCase());

    const titleNorm = normalizeTitle(p.title);
    if (titleNorm && titleNorm.length >= 4) {
      selectedTitleSet.add(titleNorm);
    }
  }

  // Canonical index mappings for references
  const doiToKey = new Map<string, string>();
  const oaToKey = new Map<string, string>();
  const idToKey = new Map<string, string>();
  const titleToKey = new Map<string, string>();

  const accumulators = new Map<string, ReferenceAccumulator>();
  let nextKeyId = 1;

  for (const paper of selectedPapers) {
    const citingInfo: CitingPaperInfo = {
      id: paper.id,
      title: paper.title || 'Untitled Selected Paper',
      year: paper.year,
      doi: normalizeDoi(paper.doi) || undefined
    };

    const paperRefs = extractReferencesFromPaper(paper);

    // Track which canonical references were already cited by THIS paper (to prevent duplicate counts)
    const citedInThisPaper = new Set<string>();

    for (const ref of paperRefs) {
      // 1. Skip if reference is already selected in the researcher's corpus
      if (isReferenceAlreadySelected(ref, selectedDoiSet, selectedOaSet, selectedIdSet, selectedTitleSet)) {
        continue;
      }

      // 2. Resolve canonical key across all candidate references
      const normDoi = ref.doi ? normalizeDoi(ref.doi) : '';
      const normOa = ref.openalex_id ? normalizeOpenAlexId(ref.openalex_id) : '';
      const normId = ref.id ? ref.id.toLowerCase() : '';
      const normTitle = normalizeTitle(ref.title);

      let canonicalKey =
        (normDoi && doiToKey.get(normDoi)) ||
        (normOa && oaToKey.get(normOa)) ||
        (normId && idToKey.get(normId)) ||
        (normTitle && normTitle.length >= 4 && titleToKey.get(normTitle));

      if (!canonicalKey) {
        canonicalKey = `ref_${nextKeyId++}`;
        if (normDoi) doiToKey.set(normDoi, canonicalKey);
        if (normOa) oaToKey.set(normOa, canonicalKey);
        if (normId) idToKey.set(normId, canonicalKey);
        if (normTitle && normTitle.length >= 4) titleToKey.set(normTitle, canonicalKey);

        accumulators.set(canonicalKey, {
          canonicalId: canonicalKey,
          doi: normDoi || undefined,
          openalex_id: normOa || undefined,
          title: ref.title || (normDoi ? `Paper (DOI: ${normDoi})` : 'Untitled Reference'),
          authors: ref.authors || 'Unknown Author',
          year: ref.year,
          sourceURL: ref.sourceURL,
          citingPapers: new Map()
        });
      } else {
        // Link any newly discovered identifiers to the canonical key
        if (normDoi && !doiToKey.has(normDoi)) doiToKey.set(normDoi, canonicalKey);
        if (normOa && !oaToKey.has(normOa)) oaToKey.set(normOa, canonicalKey);
        if (normId && !idToKey.has(normId)) idToKey.set(normId, canonicalKey);
        if (normTitle && normTitle.length >= 4 && !titleToKey.has(normTitle)) titleToKey.set(normTitle, canonicalKey);

        // Update accumulator with richer metadata if previously missing
        const acc = accumulators.get(canonicalKey)!;
        if (!acc.doi && normDoi) acc.doi = normDoi;
        if (!acc.openalex_id && normOa) acc.openalex_id = normOa;
        if ((!acc.authors || acc.authors === 'Unknown Author') && ref.authors) acc.authors = ref.authors;
        if (!acc.year && ref.year) acc.year = ref.year;
        if (!acc.sourceURL && ref.sourceURL) acc.sourceURL = ref.sourceURL;
        if ((acc.title.startsWith('Paper (DOI:') || acc.title.startsWith('Work ')) && ref.title && !ref.title.startsWith('Paper (')) {
          acc.title = ref.title;
        }
      }

      // 3. Count this citing paper once
      if (!citedInThisPaper.has(canonicalKey)) {
        citedInThisPaper.add(canonicalKey);
        accumulators.get(canonicalKey)!.citingPapers.set(citingInfo.id, citingInfo);
      }
    }
  }

  // Convert accumulators to list
  const results: FrequentlyCitedItem[] = [];

  for (const acc of accumulators.values()) {
    const citedByList = Array.from(acc.citingPapers.values());
    if (citedByList.length === 0) continue;

    results.push({
      id: acc.doi ? `doi:${acc.doi}` : (acc.openalex_id || acc.canonicalId),
      title: acc.title,
      authors: acc.authors,
      year: acc.year,
      doi: acc.doi,
      openalex_id: acc.openalex_id,
      sourceURL: acc.sourceURL,
      count: citedByList.length,
      citedBy: citedByList
    });
  }

  // Sort strictly by citation count descending
  // Deterministic tie-breaker: year descending, title ascending
  results.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    if ((b.year || 0) !== (a.year || 0)) return (b.year || 0) - (a.year || 0);
    return a.title.localeCompare(b.title);
  });

  return topN > 0 ? results.slice(0, topN) : results;
}

/**
 * Converts a FrequentlyCitedItem suggestion into a standard ResearchPaper
 * ready for addition to the selection queue (which records pass 1 with consent).
 */
export function suggestionToResearchPaper(item: FrequentlyCitedItem): ResearchPaper {
  const cleanDoi = item.doi ? normalizeDoi(item.doi) : undefined;
  return {
    id: item.doi ? `doi:${cleanDoi}` : (item.openalex_id || item.id || `freq_${Date.now()}`),
    title: item.title,
    authors: item.authors || 'Unknown Author',
    year: item.year || 0,
    abstract: `Referenced work frequently cited across your selection queue (${item.count} ${item.count === 1 ? 'citation' : 'citations'}).`,
    doi: cleanDoi,
    openalex_id: item.openalex_id,
    sourceURL: item.sourceURL || (cleanDoi ? `https://doi.org/${cleanDoi}` : undefined),
    citations: item.count
  };
}
