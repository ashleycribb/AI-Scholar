import type { ResearchPaper, AdvancedSearchOptions } from '../types';
import { createPaperId } from './extensionService';

const PUBMED_API_BASE = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/';
const RETMAX = 20;

interface PubMedIdList {
    esearchresult: {
        count: string;
        retmax: string;
        retstart: string;
        idlist: string[];
    };
}

interface PubMedSummary {
    uid: string;
    title: string;
    authors: { name: string; authtype: string; clusterid: string }[];
    pubdate: string;
    source: string; // Journal
    fulljournalname: string;
    elocationid: string; // doi: 10.1038/s41586-020-2649-2
    doctype: string;
    pmcrefcount: number;
    // Abstract is NOT in esummary for JSON (annoying limitation of E-utilities JSON),
    // but usually we need efetch for abstract or use a different endpoint.
    // However, let's try to get what we can.
    // Actually, esummary rarely gives abstract. efetch does.
    // Let's use efetch for details if possible, or just map what we have.
    // But ResearchPaper needs abstract.
    // efetch with retmode=xml gives abstract.
}
// efetch is better for details.

// Helper to clean XML tags if any (though we'll try to use JSON where possible)
const cleanText = (text: string) => text.replace(/<[^>]*>?/gm, '');

export const searchPubMed = async (query: string, options: AdvancedSearchOptions, page: number = 1): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    try {
        // 1. Search for IDs
        const offset = (page - 1) * RETMAX;
        const searchParams = new URLSearchParams({
            db: 'pubmed',
            term: query,
            retmode: 'json',
            retmax: RETMAX.toString(),
            retstart: offset.toString(),
            sort: 'relevance'
        });

        // Add date filter if present
        if (options.startYear || options.endYear) {
             // PubMed handles dates in term like "2020:2024[dp]"
             const dateTerm = ` AND ${options.startYear || '1900'}:${options.endYear || '3000'}[dp]`;
             searchParams.set('term', query + dateTerm);
        }

        const searchUrl = `${PUBMED_API_BASE}esearch.fcgi?${searchParams.toString()}`;
        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) throw new Error(`PubMed Search Failed: ${searchRes.status}`);

        const searchData = await searchRes.json() as PubMedIdList;
        const ids = searchData.esearchresult.idlist;
        const totalCount = parseInt(searchData.esearchresult.count, 10);

        if (ids.length === 0) {
            return { papers: [], hasMore: false };
        }

        // 2. Fetch Details using efetch (to get abstract)
        // efetch doesn't support JSON well for detailed records with abstract, it often returns XML.
        // Let's use XML parsing.
        const fetchParams = new URLSearchParams({
            db: 'pubmed',
            id: ids.join(','),
            retmode: 'xml'
        });

        const fetchUrl = `${PUBMED_API_BASE}efetch.fcgi?${fetchParams.toString()}`;
        const fetchRes = await fetch(fetchUrl);
        if (!fetchRes.ok) throw new Error(`PubMed Fetch Failed: ${fetchRes.status}`);

        const xmlText = await fetchRes.text();

        // Parse XML manually or with a library. Since we are in browser/node environment,
        // we might not have a heavy XML parser.
        // Let's use a simple regex-based extraction for now as we don't have DOMParser in Node.js env easily without jsdom,
        // but this code runs in browser (mostly).
        // Wait, the environment instructions say: "The default environment lacks DOMParser".
        // So I should use regex or a lightweight parser.

        const papers: ResearchPaper[] = [];
        const articles = xmlText.split('</PubmedArticle>');

        for (const article of articles) {
            if (!article.includes('<PubmedArticle>')) continue;

            const pmidMatch = article.match(/<PMID[^>]*>(.*?)<\/PMID>/);
            const pmid = pmidMatch ? pmidMatch[1] : '';
            if (!pmid) continue;

            const titleMatch = article.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
            const title = titleMatch ? cleanText(titleMatch[1]) : 'Untitled';

            const abstractMatch = article.match(/<AbstractText[^>]*>(.*?)<\/AbstractText>/g);
            const abstract = abstractMatch
                ? abstractMatch.map(a => cleanText(a.replace(/<[^>]+>/g, ''))).join(' ')
                : 'No abstract available.';

            const authorMatches = [...article.matchAll(/<LastName>(.*?)<\/LastName>.*?<Initials>(.*?)<\/Initials>/gs)];
            const authors = authorMatches.map(m => `${m[1]} ${m[2]}`).join(', ');

            const yearMatch = article.match(/<PubDate>.*?<Year>(.*?)<\/Year>.*?<\/PubDate>/s);
            const year = yearMatch ? parseInt(yearMatch[1], 10) : new Date().getFullYear();

            const journalMatch = article.match(/<Title>(.*?)<\/Title>/);
            const journal = journalMatch ? cleanText(journalMatch[1]) : 'Unknown Journal';

            const doiMatch = article.match(/<ArticleId IdType="doi">(.*?)<\/ArticleId>/);
            const doi = doiMatch ? doiMatch[1] : undefined;

            const paper: ResearchPaper = {
                id: createPaperId({ title, authors, year, abstract, sourceURL: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` }),
                title,
                authors: authors || 'Unknown Authors',
                year,
                abstract,
                sourceURL: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
                pdfURL: undefined, // PubMed rarely gives direct PDF links
                citations: 0, // Not easily available in efetch
                doi,
                journal,
                enrichmentSource: 'PubMed' as any // Casting to avoid type error if strictly typed
            };
            papers.push(paper);
        }

        return {
            papers,
            hasMore: (page * RETMAX) < totalCount
        };

    } catch (error) {
        console.error("PubMed API Error:", error);
        return { papers: [], hasMore: false };
    }
};
