/**
 * Selection queue membership by work, not by whatever id a source happened to use (fix 4).
 * A paper already in the queue keeps its id; a later record of the same work (shared DOI, OpenAlex, arXiv, PMID
 * or PMCID alias) only adds aliases to it, so the queue never holds two entries for one work.
 */
import type { ResearchPaper } from '../types';
import { aliasKey, extractAliases, sameWork, withWorkId, type WorkAlias } from '../utils/workIds';

export function queueIndexOf(queue: ResearchPaper[], paper: ResearchPaper): number {
  return queue.findIndex(q => sameWork(q, paper));
}

export function queueContains(queue: ResearchPaper[], paper: ResearchPaper): boolean {
  return queueIndexOf(queue, paper) >= 0;
}

function mergeAliases(a: WorkAlias[] = [], b: WorkAlias[] = []): WorkAlias[] {
  const seen = new Set(a.map(aliasKey));
  return [...a, ...b.filter(x => !seen.has(aliasKey(x)))];
}

/** Adds papers that are not yet in the queue (normalized with their work id). Returns the new queue and what was added. */
export function addToQueue(queue: ResearchPaper[], papers: ResearchPaper[]): { queue: ResearchPaper[]; added: ResearchPaper[] } {
  const next = [...queue];
  const added: ResearchPaper[] = [];
  for (const raw of papers) {
    const paper = withWorkId(raw);
    const i = queueIndexOf(next, paper);
    if (i >= 0) {
      const existing = next[i];
      const aliases = mergeAliases(existing.aliases ?? extractAliases(existing as ResearchPaper & Record<string, unknown>), paper.aliases);
      if (aliases.length !== (existing.aliases ?? []).length) next[i] = { ...existing, aliases };
      continue;
    }
    next.push(paper);
    added.push(paper);
  }
  return { queue: next, added };
}

/** Removes every queue entry for the same work as `paper`. */
export function removeFromQueue(queue: ResearchPaper[], paper: ResearchPaper): ResearchPaper[] {
  return queue.filter(q => !sameWork(q, paper));
}
