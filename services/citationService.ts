
import type { ResearchPaper, CitationStyle, ModelDefinition, CitationStats, SciteTally } from '../types';
import { sciteService } from './sciteService';
import { exportToBibTeX } from '../utils/sourceExport';
import * as geminiService from './geminiService';
import * as crossrefService from './crossrefService';

let citeConstructorPromise: Promise<any> | null = null;

const getCiteConstructor = (): Promise<any> => {
    if (citeConstructorPromise) {
        return citeConstructorPromise;
    }

    citeConstructorPromise = new Promise((resolve, reject) => {
        const POLLING_INTERVAL_MS = 100;
        const MAX_WAIT_MS = 3000;
        let totalWait = 0;

        const pollForCite = setInterval(() => {
            // @ts-ignore
            const GlobalCite = window.Cite;
            const isReady = typeof GlobalCite === 'function' &&
                            GlobalCite.plugins?.output?.has('ris') &&
                            GlobalCite.plugins?.csl?.templates?.has('apa');

            if (isReady) {
                clearInterval(pollForCite);
                resolve(GlobalCite);
            } else {
                totalWait += POLLING_INTERVAL_MS;
                if (totalWait >= MAX_WAIT_MS) {
                    clearInterval(pollForCite);
                    console.warn("Citation.js failed to load within timeout. Falling back to AI.");
                    resolve(null);
                }
            }
        }, POLLING_INTERVAL_MS);
    });

    return citeConstructorPromise;
};

/**
 * BibTeX for one paper: the same writer as the export bundle (utils/sourceExport.ts). Missing fields are omitted.
 */
export const generateBibTeX = (paper: ResearchPaper): string => exportToBibTeX([paper]).trimEnd();

/**
 * Instant deterministic citation generator for zero-latency scholar copying.
 */
export const formatInstantCitation = (paper: ResearchPaper, style: 'apa' | 'chicago' | 'mla' | 'harvard' | 'bibtex'): string => {
    if (style === 'bibtex') {
        return generateBibTeX(paper);
    }

    // Missing stays missing: no author -> the title leads (APA/MLA practice), no year -> "n.d.", no venue -> omitted.
    const title = paper.title.trim().replace(/\.$/, '');
    const authors = (paper.authors || '').trim() || title;
    const year = paper.year || 'n.d.';
    const venue = paper.journal || '';
    const doiUrl = paper.doi ? `https://doi.org/${paper.doi}` : (paper.sourceURL || '');

    switch (style) {
        case 'apa':
            // APA 7th Edition: Author, A. A. (Year). Title. Journal. https://doi.org/...
            return `${authors} (${year}). ${title}.${venue ? ` ${venue}.` : ''}${doiUrl ? ` ${doiUrl}` : ''}`;
        
        case 'chicago':
            // Chicago 17th: Author. Year. "Title." Journal. https://doi.org/...
            return `${authors}. ${year}. "${title}."${venue ? ` ${venue}.` : ''}${doiUrl ? ` ${doiUrl}` : ''}`;
        
        case 'mla':
            // MLA 9th: Author. "Title." Journal, Year. doi:...
            return `${authors}. "${title}."${venue ? ` ${venue},` : ''} ${year}.${paper.doi ? ` https://doi.org/${paper.doi}` : (doiUrl ? ` ${doiUrl}` : '')}`;

        case 'harvard':
            // Harvard: Author, Year. Title. Journal. Available at: URL.
            return `${authors}, ${year}. ${title}.${venue ? ` ${venue}.` : ''}${doiUrl ? ` Available at: ${doiUrl}` : ''}`;

        default:
            return `${authors} (${year}). ${title}.${venue ? ` ${venue}.` : ''}`;
    }
};

const sanitizeCslData = (data: any): any => {
    if (!data) return null;
    if (!data.type) data.type = 'article-journal';
    if (Array.isArray(data.author)) {
        data.author = data.author.map((a: any) => {
            if (typeof a === 'string') return { literal: a };
            if (!a.family && !a.literal) return { literal: a.given || 'Unknown' };
            if (!a.family && a.given) return { family: a.given };
            return a;
        });
    } else if (typeof data.author === 'string') {
        data.author = [{ literal: data.author }];
    }
    // No author or date is invented: citation-js renders a missing author or "n.d." from the absent fields.
    return data;
};

const getPaperCslData = async (paper: ResearchPaper, model: ModelDefinition): Promise<object> => {
    if (paper.doi) {
        try {
            const crossrefCsl = await crossrefService.fetchCslFromCrossref(paper.doi);
            if (crossrefCsl) return sanitizeCslData(crossrefCsl);
        } catch (error) {
            console.warn(`[Citation] Crossref fetch failed for DOI ${paper.doi}, falling back to AI.`, error);
        }
    }
    const aiData = await geminiService.extractCitationMetadata(paper, model);
    return sanitizeCslData(aiData);
};


export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle, model: ModelDefinition): Promise<string[]> => {
    if (style === 'bibtex') {
        return papers.map(generateBibTeX);
    }

    const styleMap = {
        apa: 'apa',
        mla: 'modern-language-association',
        chicago: 'chicago-author-date',
        harvard: 'harvard-cite-them-right',
        ieee: 'ieee',
        vancouver: 'vancouver'
    };

    const useAiFallback = async (paper: ResearchPaper): Promise<string> => {
        return await geminiService.formatCitation(paper, style, model);
    };

    try {
        const Cite = await getCiteConstructor();
        if (!Cite) return await Promise.all(papers.map(p => useAiFallback(p)));
        
        const citations = await Promise.all(papers.map(async (paper) => {
            try {
                const cslData = await getPaperCslData(paper, model);
                try {
                    const cite = new Cite(cslData);
                    const output = cite.format('bibliography', {
                        format: 'html',
                        template: styleMap[style] || 'apa',
                        lang: 'en-US'
                    });
                    return output.trim();
                } catch (citeError) {
                    return await useAiFallback(paper);
                }
            } catch (dataError) {
                return await useAiFallback(paper);
            }
        }));
        
        return citations;
    } catch (error) {
        // Only use basic formatting if AI also fails, but for now we trust AI fallback
        return await Promise.all(papers.map(p => useAiFallback(p)));
    }
};

export const generateRIS = async (papers: ResearchPaper[], model?: ModelDefinition): Promise<string> => {
    // Deterministic offline RIS generation from metadata
    return generateDeterministicRIS(papers);
};

export const generateDeterministicRIS = (papers: ResearchPaper[]): string => {
    return papers.map(paper => {
        const lines: string[] = ['TY  - JOUR'];
        lines.push(`TI  - ${paper.title.replace(/\n/g, ' ')}`);
        
        if (paper.authorList && paper.authorList.length > 0) {
            paper.authorList.forEach(a => lines.push(`AU  - ${a.name}`));
        } else if (typeof paper.authors === 'string' && paper.authors) {
            paper.authors.split(',').forEach(a => lines.push(`AU  - ${a.trim()}`));
        } else if (Array.isArray(paper.authors)) {
            (paper.authors as string[]).forEach(a => lines.push(`AU  - ${String(a).trim()}`));
        }
        
        if (paper.year) lines.push(`PY  - ${paper.year}`);
        if (paper.journal) lines.push(`JO  - ${paper.journal}`);
        if (paper.doi) lines.push(`DO  - ${paper.doi}`);
        const url = paper.sourceURL || (paper.doi ? `https://doi.org/${paper.doi}` : (paper.openalex_id ? `https://openalex.org/${paper.openalex_id}` : ''));
        if (url) lines.push(`UR  - ${url}`);
        lines.push('ER  - ');
        return lines.join('\n');
    }).join('\n\n');
};

export const generateMetadataCSV = (papers: ResearchPaper[]): string => {
    const header = ['Title', 'Authors', 'Year', 'Journal', 'DOI', 'OpenAlex_ID', 'URL'];
    const rows = papers.map(p => {
        const title = `"${(p.title || '').replace(/"/g, '""')}"`;
        const authors = `"${(p.authors || '').replace(/"/g, '""')}"`;
        const year = p.year || '';
        const journal = `"${(p.journal || p.enrichmentSource || '').replace(/"/g, '""')}"`;
        const doi = `"${(p.doi || '').replace(/"/g, '""')}"`;
        const openalexId = `"${(p.openalex_id || p.id || '').replace(/"/g, '""')}"`;
        const url = `"${(p.sourceURL || (p.doi ? `https://doi.org/${p.doi}` : '')).replace(/"/g, '""')}"`;
        return [title, authors, year, journal, doi, openalexId, url].join(',');
    });
    return [header.join(','), ...rows].join('\n');
};

/**
 * Downloads exported OpenAlex metadata in BibTeX, RIS, or CSV format.
 */
export const downloadMetadataExport = (
    papers: ResearchPaper[], 
    format: 'bibtex' | 'ris' | 'csv',
    filename = 'scholar-explorer-export'
): void => {
    if (!papers || papers.length === 0) return;

    let content = '';
    let mimeType = 'text/plain';
    let ext: string = format;

    if (format === 'bibtex') {
        content = papers.map(generateBibTeX).join('\n\n');
        mimeType = 'application/x-bibtex';
        ext = 'bib';
    } else if (format === 'ris') {
        content = generateDeterministicRIS(papers);
        mimeType = 'application/x-research-info-systems';
        ext = 'ris';
    } else if (format === 'csv') {
        content = generateMetadataCSV(papers);
        mimeType = 'text/csv';
        ext = 'csv';
    }

    const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.${ext}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Intent counts are unknown; no citation-intent check ran or the source had nothing to report. */
export const UNAVAILABLE_CITATION_STATS: CitationStats = {
  total: null,
  supportCount: null,
  contradictCount: null,
  supportRatio: null,
  source: 'unavailable',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Build citation-intent stats from a real scite.ai tally.
 * supportRatio is supporting / (supporting + contrasting) when that sum is > 0;
 * it is null when both counts are 0 (no intent citations, not a 50% default).
 * Mentions are not part of the ratio. Missing numeric fields are treated as unavailable.
 */
export function citationStatsFromSciteTally(tally: SciteTally): CitationStats | null {
  if (!tally || !isFiniteNumber(tally.supporting) || !isFiniteNumber(tally.contrasting)) {
    return null;
  }
  const supportCount = tally.supporting;
  const contradictCount = tally.contrasting;
  const intentTotal = supportCount + contradictCount;
  const total = isFiniteNumber(tally.total) ? tally.total : (intentTotal > 0 ? intentTotal : null);
  return {
    total,
    supportCount,
    contradictCount,
    supportRatio: intentTotal > 0 ? supportCount / intentTotal : null,
    source: 'scite',
  };
}

async function fetchSemanticScholarCitationTotal(doi: string): Promise<number | null> {
  try {
    const response = await fetch(
      `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount`
    );
    if (!response.ok) return null;
    const data = await response.json();
    return isFiniteNumber(data?.citationCount) ? data.citationCount : null;
  } catch {
    return null;
  }
}

/**
 * Supporting / contrasting counts come only from a real citation-intent source
 * (currently scite.ai, already integrated). Semantic Scholar's citationCount is a
 * total only — it is never turned into 70%/5% intent counts. On failure or with
 * no intent source, counts are null and source is 'unavailable'.
 */
export async function analyzeCitations(doi: string, existingTally?: SciteTally | null): Promise<CitationStats> {
  const tally = existingTally ?? (doi ? await sciteService.getTally(doi) : null);
  const fromScite = tally ? citationStatsFromSciteTally(tally) : null;
  if (fromScite) {
    if (fromScite.total == null && doi) {
      const total = await fetchSemanticScholarCitationTotal(doi);
      return { ...fromScite, total };
    }
    return fromScite;
  }

  const total = doi ? await fetchSemanticScholarCitationTotal(doi) : null;
  return {
    ...UNAVAILABLE_CITATION_STATS,
    total,
  };
}
