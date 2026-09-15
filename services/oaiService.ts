
import type { ResearchPaper } from '../types';
import { getCache, setCache } from '../utils/cache';

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes for institutional metadata

/**
 * Searches an OAI-PMH endpoint for papers.
 * Most universities use OAI-PMH for their institutional repositories (theses, locally-published journals).
 */
export const queryInstitutionalRepository = async (baseUrl: string, query: string): Promise<ResearchPaper[]> => {
    const cacheKey = `oai_search_${baseUrl}_${query}`;
    const cached = getCache<ResearchPaper[]>(cacheKey);
    if (cached) return cached;

    try {
        // Construct standard OAI-PMH query. 
        // Note: OAI-PMH usually doesn't have a direct 'search' keyword parameter across all servers,
        // but many Discovery Layers allow ListRecords with set parameters or date ranges.
        // For a generic implementation, we use the verb ListRecords with metadataPrefix=oai_dc
        // and attempt to filter client-side if the server doesn't support specific keyword filters.
        const url = `${baseUrl}?verb=ListRecords&metadataPrefix=oai_dc`;
        
        const response = await fetch(url);
        if (!response.ok) return [];

        const xmlText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "application/xml");
        
        const records = Array.from(xmlDoc.querySelectorAll("record"));
        const matchingPapers: ResearchPaper[] = [];

        records.forEach(record => {
            const metadata = record.querySelector("metadata");
            if (!metadata) return;

            const title = metadata.querySelector("dc\\:title, title")?.textContent || "Untitled OAI Record";
            const creator = Array.from(metadata.querySelectorAll("dc\\:creator, creator")).map(c => c.textContent).join(", ") || "Unknown Creator";
            const date = metadata.querySelector("dc\\:date, date")?.textContent || "";
            const year = parseInt(date.substring(0, 4)) || 0;
            const description = metadata.querySelector("dc\\:description, description")?.textContent || "No description provided.";
            const identifier = metadata.querySelector("dc\\:identifier, identifier")?.textContent || "";

            // Simple keyword matching for simulation of search if the OAI server doesn't support it directly
            const searchPayload = `${title} ${description} ${creator}`.toLowerCase();
            const keywords = query.toLowerCase().split(' ');
            const isMatch = keywords.every(k => searchPayload.includes(k));

            if (isMatch) {
                matchingPapers.push({
                    id: `oai:${btoa(identifier).substring(0, 10)}`,
                    title,
                    authors: creator,
                    year,
                    abstract: description,
                    sourceURL: identifier,
                    enrichmentSource: 'Institutional Repository (OAI)'
                });
            }
        });

        const result = matchingPapers.slice(0, 10);
        setCache(cacheKey, result, CACHE_TTL_MS);
        return result;
    } catch (e) {
        console.warn("OAI-PMH harvesting failed:", e);
        return [];
    }
};
