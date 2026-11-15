/**
 * How a paper is named inside a .s3a file. The engine's add_paper takes a string id and stores hash_iri (64-bit
 * FNV-1a) of it as tile-12 paper_id; these helpers compute that string so other files can refer to the same paper.
 * Pure (no engine import), so exports and tests can use it without loading WebAssembly.
 */
import type { ResearchPaper } from '../types';
import { withWorkId } from './workIds';

export function extractCleanOpenAlexId(rawId?: string): string {
  if (!rawId || typeof rawId !== 'string') return '';
  const trimmed = rawId.trim();
  const match = trimmed.match(/(?:https?:\/\/openalex\.org\/)?(W[1-9][0-9]*)$/i);
  if (match && match[1]) {
    return match[1].toUpperCase();
  }
  return '';
}

/**
 * The string the engine's add_paper receives as the paper's id (the engine stores hash_iri of it as paper_id in
 * tile 12). Exported so other files in an export bundle can name the same paper (works.jsonl s3a_paper_key).
 */
export function scholarPackPaperKey(paper: ResearchPaper): { cleanOpenAlex: string; cleanDoi: string; key: string } {
  const cleanOpenAlex = extractCleanOpenAlexId(paper.openalex_id || paper.id)
    || extractCleanOpenAlexId(withWorkId(paper).aliases?.find(a => a.scheme === 'openalex')?.value);
  const cleanDoi = paper.doi ? paper.doi.replace(/^https?:\/\/doi\.org\//i, '').trim() : '';
  return { cleanOpenAlex, cleanDoi, key: cleanOpenAlex || cleanDoi || paper.id || paper.title || '' };
}
