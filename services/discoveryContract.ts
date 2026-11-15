/**
 * The "Discovery Snapshot" JSON the researcher can copy or download (data fix 5).
 *
 * Papers are written from their facts only (services/paperFacts.ts) with identifiers taken from the aliases the
 * record really has: no id from one source is relabelled as another's, a missing year stays missing (null), and no
 * source is assumed. Provenance names only models that actually produced something the researcher saw in this
 * session (match scores, plain-language summaries), as reported by the server, and makes no claim of approval.
 */
import type { ResearchPaper } from '../types';
import { withWorkId } from '../utils/workIds';
import { authorNames } from '../utils/sourceExport';
import { paperFacts, PAPER_FACTS_SCHEMA_VERSION } from './paperFacts';

export const DISCOVERY_CONTRACT_SCHEMA_VERSION = 2 as const;

export interface DiscoveryContractInput {
  papers: ResearchPaper[];
  researcherEvents: unknown[];
  query: string;
  querySettings: Record<string, unknown>;
  services: unknown;
  appUrl: string;
  snapshotId: string;
  now?: Date;
}

export interface ModelUse { task: 'match-score' | 'plain-language-summary'; model: string; work_ids: string[] }

/** Models that produced AI output on these papers, grouped by task, from the labels the server returned. */
export function modelsUsed(papers: ResearchPaper[]): ModelUse[] {
  const uses = new Map<string, ModelUse>();
  const add = (task: ModelUse['task'], model: string | undefined, id: string) => {
    if (!model) return;
    const k = `${task}\u0000${model}`;
    if (!uses.has(k)) uses.set(k, { task, model, work_ids: [] });
    uses.get(k)!.work_ids.push(id);
  };
  for (const p of papers) {
    if (p.scoreSource === 'semantic') add('match-score', p.scoreModel, p.id);
    if (p.laymanSummary) add('plain-language-summary', p.laymanSummaryModel, p.id);
  }
  return [...uses.values()];
}

export function buildDiscoveryContract(input: DiscoveryContractInput) {
  return {
    schema_version: DISCOVERY_CONTRACT_SCHEMA_VERSION,
    paper_facts_schema_version: PAPER_FACTS_SCHEMA_VERSION,
    source: 'scholar-explorer',
    query: input.query,
    query_settings: input.querySettings,
    services: input.services,
    selected_work_ids: input.papers.map(p => p.id),
    // The researcher's own selections, keep/drop decisions and notes, kept with or without study consent.
    researcher_events: input.researcherEvents,
    papers: input.papers.map(p => {
      const facts = paperFacts(withWorkId(p));
      const alias = (scheme: string) => facts.aliases?.find(a => a.scheme === scheme)?.value ?? null;
      return {
        work_id: facts.id,
        title: facts.title ?? '',
        authors: authorNames(p),
        year: typeof facts.year === 'number' ? facts.year : null,
        doi: alias('doi'),
        openalex_id: alias('openalex'),
        arxiv_id: alias('arxiv'),
        pmid: alias('pmid'),
        pmcid: alias('pmcid'),
        source_record_id: facts.sourceId ?? null,
        open_access_pdf_url: facts.openAccessPdfUrl || facts.pdfURL || null,
        abstract: facts.abstract || null,
        source_service: facts.enrichmentSource || null,
      };
    }),
    retrieved_at: (input.now ?? new Date()).toISOString(),
    provenance: {
      app_url: input.appUrl,
      snapshot_id: input.snapshotId,
      models_used: modelsUsed(input.papers),
    },
  };
}
