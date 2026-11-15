/**
 * utils/sourceExport.ts
 *
 * Plain bibliographic exports of selected sources: BibTeX (.bib), RIS (.ris) and CSV (.csv).
 * Missing data stays missing: no made-up year, author, venue or link is written. Keys and ids come from the
 * permanent work id (utils/workIds.ts); a URL is written only for an identifier the record really has.
 */

import type { ResearchPaper } from '../types';
import { withWorkId } from './workIds';

function cleanText(text?: string): string {
  if (!text) return '';
  return text.normalize('NFC').replace(/[\r\n]+/g, ' ').trim();
}

function escapeBibTeX(text?: string): string {
  if (!text) return '';
  return text
    .normalize('NFC')
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/([{}%&$#_])/g, '\\$1')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function escapeCSV(text?: string | number): string {
  if (text === undefined || text === null || text === '') return '""';
  const escaped = String(text).normalize('NFC').replace(/"/g, '""').replace(/[\r\n]+/g, ' ').trim();
  return `"${escaped}"`;
}

/** Author names as a list: the structured list when there is one, else the comma-separated string. */
export function authorNames(p: ResearchPaper): string[] {
  if (Array.isArray(p.authorList) && p.authorList.length > 0) return p.authorList.map(a => cleanText(a.name)).filter(Boolean);
  const raw = p.authors as unknown;
  if (Array.isArray(raw)) return raw.map(a => cleanText(String(a))).filter(Boolean);
  return typeof raw === 'string' ? raw.split(/\s*[,;]\s*/).map(cleanText).filter(Boolean) : [];
}

/** Ids and links a record really has (no guessed OpenAlex URL from an unrelated id). */
function identifiers(p: ResearchPaper) {
  const w = withWorkId(p);
  const alias = (scheme: string) => w.aliases?.find(a => a.scheme === scheme)?.value;
  const doi = alias('doi');
  const openalex = alias('openalex');
  const arxiv = alias('arxiv');
  const url = doi ? `https://doi.org/${doi}` : openalex ? `https://openalex.org/${openalex}` : arxiv ? `https://arxiv.org/abs/${arxiv}` : (p.sourceURL || '');
  return { workId: w.id, doi, openalex, arxiv, pmid: alias('pmid'), url };
}

const validYear = (y: unknown): number | null => (typeof y === 'number' && Number.isInteger(y) && y > 0 ? y : null);

/** BibTeX citation key from the work id: letters, digits, and : - _ only. */
export function bibKey(workId: string): string {
  return workId.normalize('NFC').replace(/[^A-Za-z0-9:_-]/g, '_');
}

/**
 * Format papers as BibTeX (.bib)
 */
export function exportToBibTeX(papers: ResearchPaper[]): string {
  return papers.map(p => {
    const id = identifiers(p);
    const year = validYear(p.year);
    const authors = authorNames(p);
    const lines = [`@article{${bibKey(id.workId)},`, `  title = {${escapeBibTeX(p.title)}},`];
    if (authors.length) lines.push(`  author = {${authors.map(escapeBibTeX).join(' and ')}},`);
    if (year !== null) lines.push(`  year = {${year}},`);
    if (p.journal) lines.push(`  journal = {${escapeBibTeX(p.journal)}},`);
    if (id.doi) lines.push(`  doi = {${id.doi}},`);
    if (id.arxiv) lines.push(`  eprint = {${id.arxiv}},`, `  archiveprefix = {arXiv},`);
    if (id.pmid) lines.push(`  pmid = {${id.pmid}},`);
    if (id.url) lines.push(`  url = {${id.url}},`);
    lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
    lines.push('}');
    return lines.join('\n');
  }).join('\n\n') + (papers.length ? '\n' : '');
}

/**
 * Format papers as Research Information Systems (.ris)
 */
export function exportToRIS(papers: ResearchPaper[]): string {
  return papers.map(p => {
    const id = identifiers(p);
    const year = validYear(p.year);
    const lines = ['TY  - JOUR', `ID  - ${id.workId}`, `TI  - ${cleanText(p.title)}`];
    authorNames(p).forEach(a => lines.push(`AU  - ${a}`));
    if (year !== null) lines.push(`PY  - ${year}`);
    if (p.journal) lines.push(`JO  - ${cleanText(p.journal)}`);
    if (id.doi) lines.push(`DO  - ${id.doi}`);
    if (id.url) lines.push(`UR  - ${id.url}`);
    if (p.abstract) lines.push(`AB  - ${cleanText(p.abstract)}`);
    lines.push('ER  -');
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Format papers as Comma-Separated Values (.csv)
 */
export function exportToCSV(papers: ResearchPaper[]): string {
  const header = ['Work_ID', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'OpenAlex_ID', 'URL', 'Citations', 'Abstract'].join(',');
  const rows = papers.map(p => {
    const id = identifiers(p);
    return [
      escapeCSV(id.workId),
      escapeCSV(p.title),
      escapeCSV(authorNames(p).join('; ')),
      escapeCSV(validYear(p.year) ?? ''),
      escapeCSV(p.journal),
      escapeCSV(id.doi),
      escapeCSV(id.openalex),
      escapeCSV(id.url),
      escapeCSV(typeof p.citations === 'number' ? p.citations : ''),
      escapeCSV(p.abstract),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

/**
 * Triggers browser download of generated export content
 */
export function downloadExportFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
