/**
 * Paper facts vs AI output (20-year data design, fix 5).
 *
 * What is kept permanently about a paper is only what a source said about it (bibliographic facts) plus the
 * researcher's own actions, which live in their own records. Everything a model produced (match scores, score
 * explanations, highlights, plain-language summaries, key concepts, knowledge graphs, validations) and every
 * transient UI flag is left out: those are rebuildable from the facts and belong in the derived cache
 * (services/derivedCache.ts), tagged with the model that produced them.
 *
 * A whitelist, not a blacklist: a new field is not saved until someone decides it is a fact.
 */
import type { ResearchPaper } from '../types';
import { nfcDeep } from '../utils/nfc';

/** Version of the saved paper-fact shape. History in docs/data/MIGRATIONS.md. */
export const PAPER_FACTS_SCHEMA_VERSION = 1 as const;

export const PAPER_FACT_FIELDS = [
    'id', 'sourceId', 'aliases', 'arxivId', 'pmid', 'pmcid',
    'title', 'authors', 'authorList', 'year', 'abstract', 'journal', 'doi', 'openalex_id',
    'sourceURL', 'pdfURL', 'openAccessPdfUrl', 'repositoryURL', 'coreId', 'enrichmentSource',
    'citations', 'influentialCitationCount', 'isOpenAccess', 'isRetracted', 'isInDoaj',
    'references', 'referenceList', 'referenced_works', 'sections', 'figures', 'tables',
] as const satisfies readonly (keyof ResearchPaper)[];

export type PaperFacts = Pick<ResearchPaper, (typeof PAPER_FACT_FIELDS)[number]>;

const FACT_SET = new Set<string>(PAPER_FACT_FIELDS);

/** Field names on a paper that are not facts (AI output, check results, UI state, sync status). */
export function nonFactFields(paper: object): string[] {
    return Object.keys(paper).filter(k => !FACT_SET.has(k));
}

/**
 * JSON-compatible copy of a paper with only its facts, all text NFC. Empty values are dropped rather than
 * replaced: a missing year stays missing.
 */
export function paperFacts(paper: ResearchPaper | Record<string, unknown>): PaperFacts {
    const src = paper as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of PAPER_FACT_FIELDS) {
        const v = src[key];
        if (v === undefined || v === null) continue;
        if (key === 'year' && !(typeof v === 'number' && Number.isInteger(v) && v > 0)) continue;
        out[key] = nfcDeep(JSON.parse(JSON.stringify(v)));
    }
    return out as PaperFacts;
}
