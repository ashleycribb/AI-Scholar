
import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for searches (Standardized)
const ENRICH_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours for stable metadata

let lastArxivUnavailable = false;
const statusListeners = new Set<(unavailable: boolean) => void>();

export function isArxivUnavailable(): boolean {
    return lastArxivUnavailable;
}

export function subscribeArxivStatus(fn: (unavailable: boolean) => void): () => void {
    statusListeners.add(fn);
    fn(lastArxivUnavailable);
    return () => {
        statusListeners.delete(fn);
    };
}

function setArxivUnavailable(val: boolean) {
    if (lastArxivUnavailable !== val) {
        lastArxivUnavailable = val;
        statusListeners.forEach(fn => {
            try { fn(val); } catch {}
        });
    }
}

const extractArxivId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:abs|pdf)\/(\d{4}\.\d{4,5}(v\d+)?)/);
    return match ? match[1] : null;
};

/**
 * Attempts to fetch the full text content from ar5iv via backend proxy.
 */
export const fetchFullTextFromAr5iv = async (arxivId: string): Promise<string | null> => {
    const cacheKey = `ar5iv_text_${arxivId}`;
    const cached = getCache<string>(cacheKey);
    if (cached) return cached;

    try {
        const response = await fetch(`/api/registries/arxiv/ar5iv/${encodeURIComponent(arxivId)}`);
        if (!response.ok) return null;

        const payload = await response.json();
        const html = payload?.html;
        if (!html || typeof html !== 'string') return null;

        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        const sections = Array.from(doc.querySelectorAll('section.ltx_section'));
        let fullText = "";

        if (sections.length > 0) {
            fullText = sections.map(section => {
                const header = section.querySelector('h2, .ltx_title')?.textContent || "";
                const paras = Array.from(section.querySelectorAll('.ltx_para')).map(p => p.textContent).join('\n');
                return `## ${header}\n${paras}`;
            }).join('\n\n');
        } else {
            fullText = Array.from(doc.querySelectorAll('p')).map(p => p.textContent).join('\n\n');
        }

        if (fullText.length > 200) {
            setCache(cacheKey, fullText, ENRICH_TTL_MS);
            return fullText;
        }
        return null;
    } catch {
        return null;
    }
};

export const enrichFromArxiv = async (paper: ResearchPaper): Promise<Partial<ResearchPaper> | null> => {
    const arxivId = extractArxivId(paper.sourceURL);
    if (!arxivId) return null;

    const cacheKey = `arxiv_enrich_${arxivId}`;
    const cached = getCache<Partial<ResearchPaper>>(cacheKey);
    if (cached) return cached;

    try {
        const [metaResponse, fullText] = await Promise.all([
            fetch(`/api/registries/arxiv/search?id_list=${encodeURIComponent(arxivId)}`),
            fetchFullTextFromAr5iv(arxivId)
        ]);

        if (!metaResponse.ok) return null;
        const payload = await metaResponse.json();
        if (payload?.unavailable || !payload?.xml) return null;

        const xmlText = String(payload.xml);
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        const entry = xmlDoc.querySelector("entry");
        if (!entry) return null;

        const enrichedData: Partial<ResearchPaper> = {
            title: entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, ' ') || undefined,
            abstract: entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, ' ') || undefined,
            year: entry.querySelector("published")?.textContent ? new Date(entry.querySelector("published")!.textContent!).getFullYear() : undefined,
            authors: Array.from(entry.querySelectorAll("author > name")).map(n => n.textContent?.trim()).filter(Boolean).join(', '),
            pdfURL: Array.from(entry.querySelectorAll("link")).find(l => l.getAttribute('title') === 'pdf')?.getAttribute('href') || undefined,
            sourceURL: entry.querySelector("id")?.textContent?.trim() || undefined,
            enrichmentSource: 'arXiv'
        };

        if (fullText) {
            enrichedData.abstract = `[FULL TEXT AVAILABLE]\n\nABSTRACT:\n${enrichedData.abstract}\n\nBODY:\n${fullText.substring(0, 10000)}...`; 
        }

        setCache(cacheKey, enrichedData, ENRICH_TTL_MS);
        return enrichedData;
    } catch {
        return null;
    }
};

export const searchArxiv = async (query: string, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean, unavailable?: boolean }> => {
    const cacheKey = `arxiv_search_${query}_${page}`;
    const cached = getCache<{ papers: ResearchPaper[], hasMore: boolean, unavailable?: boolean }>(cacheKey);
    if (cached) return cached;

    const resultsPerPage = 15;
    const start = (page - 1) * resultsPerPage;
    const apiUrl = `/api/registries/arxiv/search?search_query=${encodeURIComponent(`all:${query}`)}&max_results=${resultsPerPage}&start=${start}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            setArxivUnavailable(true);
            return { papers: [], hasMore: false, unavailable: true };
        }
        const payload = await response.json();
        if (payload?.unavailable || !payload?.xml) {
            setArxivUnavailable(true);
            return { papers: [], hasMore: false, unavailable: true };
        }

        setArxivUnavailable(false);
        const xmlText = String(payload.xml);
        const xmlDoc = new DOMParser().parseFromString(xmlText, "application/xml");

        const totalResults = parseInt(xmlDoc.querySelector("opensearch\\:totalResults")?.textContent || '0', 10);
        const entries = Array.from(xmlDoc.querySelectorAll("entry"));
        
        const papers: ResearchPaper[] = entries.map(entry => ({
            id: `arxiv:${extractArxivId(entry.querySelector("id")?.textContent?.trim()) || Math.random()}`,
            title: entry.querySelector("title")?.textContent?.trim().replace(/\s+/g, ' ') || 'Untitled',
            abstract: entry.querySelector("summary")?.textContent?.trim().replace(/\s+/g, ' ') || 'No abstract.',
            year: entry.querySelector("published")?.textContent ? new Date(entry.querySelector("published")!.textContent!).getFullYear() : new Date().getFullYear(),
            authors: Array.from(entry.querySelectorAll("author > name")).map(n => n.textContent?.trim()).filter(Boolean).join(', '),
            pdfURL: Array.from(entry.querySelectorAll("link")).find(l => l.getAttribute('title') === 'pdf')?.getAttribute('href') || undefined,
            sourceURL: entry.querySelector("id")?.textContent?.trim() || '',
            enrichmentSource: 'arXiv'
        }));

        const result = { papers, hasMore: (start + resultsPerPage) < totalResults, unavailable: false };
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch {
        setArxivUnavailable(true);
        return { papers: [], hasMore: false, unavailable: true };
    }
};

