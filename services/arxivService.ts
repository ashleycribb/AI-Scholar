
import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes for searches (Standardized)
const ENRICH_TTL_MS = 48 * 60 * 60 * 1000; // 48 hours for stable metadata

const extractArxivId = (url?: string): string | null => {
    if (!url) return null;
    const match = url.match(/(?:abs|pdf)\/(\d{4}\.\d{4,5}(v\d+)?)/);
    return match ? match[1] : null;
};

/**
 * Attempts to fetch the full text content from ar5iv.labs.arxiv.org.
 * Mirrors the `retrieve_passages` and `parsing_paragraph` logic from OpenScholar.
 */
export const fetchFullTextFromAr5iv = async (arxivId: string): Promise<string | null> => {
    const cacheKey = `ar5iv_text_${arxivId}`;
    const cached = getCache<string>(cacheKey);
    if (cached) return cached;

    // Ar5iv converts arXiv LaTeX to HTML5.
    const url = `https://ar5iv.labs.arxiv.org/html/${arxivId}`;

    try {
        // Note: Client-side fetching might be blocked by CORS depending on browser/network.
        // In a production env, this should go through a proxy. 
        // We use a simple fetch here as requested by the client-side architecture.
        const response = await fetch(url);
        if (!response.ok) return null;

        const html = await response.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Logic from Python script: Find sections starting with "S" (standard academic sections)
        // and extract paragraphs.
        const sections = Array.from(doc.querySelectorAll('section.ltx_section'));
        let fullText = "";

        if (sections.length > 0) {
            fullText = sections.map(section => {
                const header = section.querySelector('h2, .ltx_title')?.textContent || "";
                const paras = Array.from(section.querySelectorAll('.ltx_para')).map(p => p.textContent).join('\n');
                return `## ${header}\n${paras}`;
            }).join('\n\n');
        } else {
            // Fallback: grab all paragraphs if sections aren't clear
            fullText = Array.from(doc.querySelectorAll('p')).map(p => p.textContent).join('\n\n');
        }

        if (fullText.length > 200) {
            setCache(cacheKey, fullText, ENRICH_TTL_MS);
            return fullText;
        }
        return null;
    } catch (e) {
        console.warn(`Ar5iv fetch failed for ${arxivId}`, e);
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
        // Parallelize metadata fetch and full text fetch
        const [metaResponse, fullText] = await Promise.all([
            fetch(`https://export.arxiv.org/api/query?id_list=${arxivId}`),
            fetchFullTextFromAr5iv(arxivId)
        ]);

        if (!metaResponse.ok) return null;

        const xmlText = await metaResponse.text();
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

        // If we found full text, append it to the abstract or a new field. 
        // For compatibility with the current type definition, we might append it to the abstract with a delimiter
        // or rely on the abstract being the summary. 
        // Ideally, ResearchPaper type should have a `fullText` field.
        // For now, if we found full text, we can use it for analysis but maybe not store it in the abstract field to avoid UI bloat.
        // Let's store a truncated version or just the fact we have it.
        
        // However, if we want the "Deep Research" service to see it, we can create a composite abstract.
        if (fullText) {
            enrichedData.abstract = `[FULL TEXT AVAILABLE]\n\nABSTRACT:\n${enrichedData.abstract}\n\nBODY:\n${fullText.substring(0, 10000)}...`; 
        }

        setCache(cacheKey, enrichedData, ENRICH_TTL_MS);
        return enrichedData;
    } catch (e) {
        return null;
    }
};

export const searchArxiv = async (query: string, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    const cacheKey = `arxiv_search_${query}_${page}`;
    const cached = getCache<{ papers: ResearchPaper[], hasMore: boolean }>(cacheKey);
    if (cached) return cached;

    const resultsPerPage = 15;
    const start = (page - 1) * resultsPerPage;
    const apiUrl = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${resultsPerPage}&start=${start}`;
    
    try {
        const response = await fetch(apiUrl);
        if (!response.ok) return { papers: [], hasMore: false };
        const xmlText = await response.text();
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

        const result = { papers, hasMore: (start + resultsPerPage) < totalResults };
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (e) {
        return { papers: [], hasMore: false };
    }
};
