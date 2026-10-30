/**
 * utils/sourceExport.ts
 * 
 * Exports selected sources using OpenAlex metadata only (no PDFs).
 * Supports: BibTeX (.bib), RIS (.ris), and CSV (.csv).
 */

import type { ResearchPaper } from '../types';

function cleanText(text?: string): string {
  if (!text) return '';
  return text.replace(/[\r\n]+/g, ' ').trim();
}

function escapeBibTeX(text?: string): string {
  if (!text) return '';
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/%/g, '\\%')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

function escapeCSV(text?: string): string {
  if (!text) return '""';
  const escaped = text.replace(/"/g, '""').replace(/[\r\n]+/g, ' ').trim();
  return `"${escaped}"`;
}

/**
 * Format papers as BibTeX (.bib)
 */
export function exportToBibTeX(papers: ResearchPaper[]): string {
  return papers.map((p, idx) => {
    const rawId = p.openalex_id || p.id || `paper_${idx + 1}`;
    const cleanId = rawId.replace(/[^A-Za-z0-9_-]/g, '_');
    const authors = Array.isArray(p.authors) ? p.authors.join(' and ') : (p.authors || 'Unknown');
    const title = escapeBibTeX(p.title);
    const year = p.year || 2024;
    const venue = escapeBibTeX(p.journal || '');
    const doi = p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/doi\.org\//, '')}` : '';
    const openalexUrl = p.openalex_id ? (p.openalex_id.startsWith('http') ? p.openalex_id : `https://openalex.org/${p.openalex_id}`) : (p.id.startsWith('http') ? p.id : `https://openalex.org/${p.id}`);

    const lines = [
      `@article{${cleanId},`,
      `  title = {${title}},`,
      `  author = {${authors}},`,
      `  year = {${year}}`
    ];

    if (venue) lines.push(`  journal = {${venue}}`);
    if (doi) lines.push(`  doi = {${doi}}`);
    if (openalexUrl) lines.push(`  url = {${openalexUrl}}`);

    lines.push('}');
    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Format papers as Research Information Systems (.ris)
 */
export function exportToRIS(papers: ResearchPaper[]): string {
  return papers.map((p, idx) => {
    const rawId = p.openalex_id || p.id || `paper_${idx + 1}`;
    const authors = Array.isArray(p.authors) ? p.authors : (p.authors ? [p.authors] : []);
    const title = cleanText(p.title);
    const year = p.year || 2024;
    const venue = cleanText(p.journal || '');
    const doi = p.doi ? p.doi.replace(/^https?:\/\/doi\.org\//, '') : '';
    const openalexUrl = p.openalex_id ? (p.openalex_id.startsWith('http') ? p.openalex_id : `https://openalex.org/${p.openalex_id}`) : (p.id.startsWith('http') ? p.id : `https://openalex.org/${p.id}`);
    const abstract = cleanText(p.abstract);

    const lines = [
      'TY  - JOUR',
      `TI  - ${title}`
    ];

    authors.forEach(author => {
      lines.push(`AU  - ${author.trim()}`);
    });

    lines.push(`PY  - ${year}`);
    if (venue) lines.push(`JO  - ${venue}`);
    if (doi) lines.push(`DO  - ${doi}`);
    if (openalexUrl) lines.push(`UR  - ${openalexUrl}`);
    if (abstract) lines.push(`AB  - ${abstract}`);
    lines.push('ER  -');

    return lines.join('\n');
  }).join('\n\n');
}

/**
 * Format papers as Comma-Separated Values (.csv)
 */
export function exportToCSV(papers: ResearchPaper[]): string {
  const header = ['OpenAlex_ID', 'Title', 'Authors', 'Year', 'Journal', 'DOI', 'URL', 'Citations', 'Abstract'].join(',');
  const rows = papers.map(p => {
    const openalexId = p.openalex_id || p.id || '';
    const title = p.title || '';
    const authors = Array.isArray(p.authors) ? p.authors.join('; ') : (p.authors || '');
    const year = p.year || '';
    const journal = p.journal || '';
    const doi = p.doi ? `https://doi.org/${p.doi.replace(/^https?:\/\/doi\.org\//, '')}` : '';
    const url = openalexId.startsWith('http') ? openalexId : `https://openalex.org/${openalexId}`;
    const citations = p.citations || 0;
    const abstract = p.abstract || '';

    return [
      escapeCSV(openalexId),
      escapeCSV(title),
      escapeCSV(authors),
      escapeCSV(String(year)),
      escapeCSV(journal),
      escapeCSV(doi),
      escapeCSV(url),
      escapeCSV(String(citations)),
      escapeCSV(abstract)
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
