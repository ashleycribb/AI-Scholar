/**
 * One permanent id per scholarly work, plus its aliases (fix 4).
 *
 * Every identifier scheme is normalized here and nowhere else:
 *   doi      lower case, no resolver prefix            10.7717/peerj.4375
 *   openalex upper-case W id, no URL                  W2741809807
 *   arxiv    new or old style, no version, no URL      2101.00001 · hep-th/9901001
 *   pmid     digits                                    29456894
 *   pmcid    PMC + digits                              PMC5815332
 *
 * The work id is the highest-priority alias the record has: doi, then openalex, arxiv, pmid, pmcid, then a
 * stable id the source itself assigned (e.g. core:123), and only when there is none, a fingerprint of the
 * NFC-normalized title, first author and year. The same input always gives the same id; nothing is random.
 * Two records are the same work when they share any alias (sameWork), which also merges ids that differ
 * because one source knew a DOI and another did not.
 */
import type { ResearchPaper } from '../types';

export type AliasScheme = 'doi' | 'openalex' | 'arxiv' | 'pmid' | 'pmcid' | 'source' | 'fingerprint';

export interface WorkAlias {
  scheme: AliasScheme;
  value: string;
}

const SCHEME_PRIORITY: AliasScheme[] = ['doi', 'openalex', 'arxiv', 'pmid', 'pmcid', 'source', 'fingerprint'];

const nfc = (s: string) => s.normalize('NFC');

export function normalizeDoi(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let v = nfc(raw).trim();
  v = v.replace(/^doi:\s*/i, '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').replace(/^(dx\.)?doi\.org\//i, '');
  try { if (/%[0-9a-f]{2}/i.test(v)) v = decodeURIComponent(v); } catch { /* keep as is */ }
  v = v.trim().toLowerCase();
  return /^10\.\d{4,9}\/\S+$/.test(v) ? v : null;
}

export function normalizeOpenAlexId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(?:openalex:)?(?:https?:\/\/(?:api\.)?openalex\.org\/(?:works\/)?)?(W[1-9]\d*)$/i);
  return m ? m[1].toUpperCase() : null;
}

export function normalizeArxivId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  let v = raw.trim().replace(/^arxiv:\s*/i, '').replace(/^https?:\/\/(www\.|export\.)?arxiv\.org\/(abs|pdf)\//i, '').replace(/\.pdf$/i, '');
  v = v.replace(/v\d+$/i, '');
  if (/^\d{4}\.\d{4,5}$/.test(v)) return v;
  if (/^[a-z][a-z.-]+\/\d{7}$/i.test(v)) return v.toLowerCase();
  return null;
}

export function normalizePmid(raw: unknown): string | null {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const v = String(raw).trim().replace(/^pmid:\s*/i, '').replace(/^https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\//i, '').replace(/\/$/, '');
  return /^[1-9]\d{0,9}$/.test(v) ? v : null;
}

export function normalizePmcid(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const m = raw.trim().match(/^(?:pmcid:\s*)?(?:https?:\/\/[^\s]*?\/)?(PMC\d+)\/?$/i);
  return m ? m[1].toUpperCase() : null;
}

/** 53-bit string hash (cyrb53): deterministic and fast; used only for the last-resort fingerprint. */
function hash53(str: string): string {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Fingerprint of title + first author's last word + year, NFC, case- and punctuation-insensitive. */
export function fingerprint(title: unknown, authors: unknown, year: unknown): string | null {
  const t = typeof title === 'string' ? nfc(title).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim() : '';
  if (t.length < 5 || t === 'untitled' || t === 'untitled paper') return null;
  const first = typeof authors === 'string' ? nfc(authors).split(/[,;]| and /)[0]?.trim() ?? '' : '';
  const surname = first.toLowerCase().replace(/[^\p{L}\p{N} ]+/gu, '').trim().split(/\s+/).pop() ?? '';
  const y = typeof year === 'number' && Number.isFinite(year) ? String(year) : '';
  return hash53(`${t}|${surname}|${y}`);
}

/** Source prefixes whose native ids are stable (assigned by the source, not by this app). */
const STABLE_SOURCE_ID = /^(core|eric|dblp|zenodo|datacite|biorxiv|doaj|s2|pubmed|epmc|dissertation|openaire|gs|hf):(.+)$/i;

/** Every alias a paper record carries, normalized and de-duplicated, in priority order. */
export function extractAliases(paper: Partial<ResearchPaper> & Record<string, unknown>): WorkAlias[] {
  const out: WorkAlias[] = [];
  const add = (scheme: AliasScheme, value: string | null) => {
    if (value && !out.some(a => a.scheme === scheme && a.value === value)) out.push({ scheme, value });
  };
  const id = typeof paper.id === 'string' ? paper.id : '';
  const sourceId = typeof paper.sourceId === 'string' ? paper.sourceId : '';
  for (const existing of Array.isArray(paper.aliases) ? paper.aliases as WorkAlias[] : []) {
    if (existing && typeof existing.value === 'string') add(existing.scheme, existing.value);
  }
  const prefixed = (raw: string, scheme: string) => raw.toLowerCase().startsWith(`${scheme}:`) ? raw.slice(scheme.length + 1) : null;
  for (const raw of [id, sourceId]) {
    if (!raw) continue;
    add('doi', normalizeDoi(prefixed(raw, 'doi') ?? prefixed(raw, 'crossref') ?? prefixed(raw, 'biorxiv') ?? prefixed(raw, 'datacite') ?? prefixed(raw, 'dissertation') ?? (raw.startsWith('10.') || /doi\.org\//i.test(raw) ? raw : null)));
    add('openalex', normalizeOpenAlexId(raw));
    add('arxiv', normalizeArxivId(prefixed(raw, 'arxiv')));
    add('pmid', normalizePmid(prefixed(raw, 'pmid') ?? prefixed(raw, 'pubmed')));
    add('pmcid', normalizePmcid(prefixed(raw, 'pmcid')));
  }
  add('doi', normalizeDoi(paper.doi));
  add('openalex', normalizeOpenAlexId(paper.openalex_id));
  add('arxiv', normalizeArxivId(paper.arxivId));
  for (const url of [paper.pdfURL, paper.sourceURL]) {
    if (typeof url === 'string' && /arxiv\.org\/(abs|pdf)\//i.test(url)) add('arxiv', normalizeArxivId(url));
    if (typeof url === 'string' && /doi\.org\//i.test(url)) add('doi', normalizeDoi(url));
  }
  add('pmid', normalizePmid(paper.pmid as string | undefined));
  add('pmcid', normalizePmcid(paper.pmcid as string | undefined));
  for (const raw of [id, sourceId]) {
    const m = raw.match(STABLE_SOURCE_ID);
    if (m && !/^(doi|crossref)$/i.test(m[1])) add('source', `${m[1].toLowerCase()}:${nfc(m[2]).trim()}`);
  }
  if (!out.some(a => a.scheme !== 'fingerprint')) add('fingerprint', fingerprint(paper.title, paper.authors, paper.year));
  return out.sort((a, b) => SCHEME_PRIORITY.indexOf(a.scheme) - SCHEME_PRIORITY.indexOf(b.scheme));
}

/** `scheme:value`, e.g. doi:10.7717/peerj.4375. */
export const aliasKey = (a: WorkAlias) => `${a.scheme === 'fingerprint' ? 'fp' : a.scheme}:${a.value}`;

/** The permanent work id: the highest-priority alias. Throws when a record has nothing to identify it by. */
export function canonicalWorkId(paper: Partial<ResearchPaper> & Record<string, unknown>): string {
  const aliases = extractAliases(paper);
  if (aliases.length === 0) throw new Error(`Cannot identify work "${String(paper.title ?? '').slice(0, 60)}": no id, DOI, or title`);
  const best = aliases[0];
  return best.scheme === 'source' ? best.value : aliasKey(best);
}

/**
 * The paper with its permanent id, its aliases, and the source's own id kept as sourceId. Idempotent.
 * Records that cannot be identified at all are returned unchanged.
 */
export function withWorkId<T extends ResearchPaper>(paper: T): T {
  const aliases = extractAliases(paper as T & Record<string, unknown>);
  if (aliases.length === 0) return paper;
  const best = aliases[0];
  const workId = best.scheme === 'source' ? best.value : aliasKey(best);
  const sourceId = paper.sourceId ?? (paper.id && paper.id !== workId ? paper.id : undefined);
  const doi = aliases.find(a => a.scheme === 'doi')?.value;
  const openalex = aliases.find(a => a.scheme === 'openalex')?.value;
  return {
    ...paper,
    id: workId,
    ...(sourceId ? { sourceId } : {}),
    ...(doi ? { doi } : {}),
    ...(openalex ? { openalex_id: openalex } : {}),
    aliases,
  };
}

/** Same work when the two records share any alias. */
export function sameWork(a: Partial<ResearchPaper>, b: Partial<ResearchPaper>): boolean {
  if (a.id && b.id && a.id === b.id) return true;
  const ka = new Set(extractAliases(a as Record<string, unknown>).map(aliasKey));
  return extractAliases(b as Record<string, unknown>).some(x => ka.has(aliasKey(x)));
}

/** Rows for an alias table (aliases.csv in the export bundle): one per (work_id, scheme, value). */
export function aliasRows(papers: ResearchPaper[]): Array<{ work_id: string; scheme: AliasScheme; value: string }> {
  return papers.flatMap(p => {
    const w = withWorkId(p);
    return (w.aliases ?? []).map(a => ({ work_id: w.id, scheme: a.scheme, value: a.value }));
  });
}

/**
 * Id for a record from `source`: its own native id when it has one, else its DOI, else a fingerprint of title,
 * first author and year, else a hash of the raw record. Deterministic (replaces Math.random fallbacks), so the
 * same record gets the same id in every search; withWorkId later swaps in the best alias.
 */
export function stableRecordId(
  source: string,
  nativeId: unknown,
  fields: { doi?: unknown; title?: unknown; authors?: unknown; year?: unknown; raw?: unknown },
): string {
  const native = typeof nativeId === 'string' || typeof nativeId === 'number' ? nfc(String(nativeId)).trim() : '';
  if (native) return `${source}:${native}`;
  const doi = normalizeDoi(fields.doi);
  if (doi) return `doi:${doi}`;
  const fp = fingerprint(fields.title, fields.authors, fields.year);
  if (fp) return `fp:${fp}`;
  return `${source}:record-${hash53(JSON.stringify(fields.raw ?? fields) ?? '')}`;
}
