// extension/lib/scraper.ts
import type { ResearchPaper } from '../../types';

/**
 * This function is designed to be injected into a web page to scrape its metadata.
 * It must be self-contained and not rely on any external modules.
 * It looks for standard academic metadata formats like Highwire Press meta tags
 * and JSON-LD structured data.
 * 
 * @returns A `Partial<ResearchPaper>` object with all the metadata that could be found.
 */
export function scrapePageMetadata(): Partial<ResearchPaper> {
    const getMeta = (name: string): string | undefined => {
        return document.querySelector<HTMLMetaElement>(`meta[name='${name}']`)?.content.trim();
    };

    const title = getMeta('citation_title') || document.title;
    const authors = Array.from(document.querySelectorAll<HTMLMetaElement>("meta[name='citation_author']")).map(meta => meta.content).join(', ');
    const yearStr = getMeta('citation_publication_date') || getMeta('citation_date');
    const year = yearStr ? new Date(yearStr).getFullYear() : new Date().getFullYear();
    const abstract = getMeta('citation_abstract') || getMeta('description') || '';
    const doi = getMeta('citation_doi');
    const pdfURL = getMeta('citation_pdf_url');

    const paper: Partial<ResearchPaper> = {
        title,
        authors: authors || 'N/A',
        year,
        abstract: abstract || 'No abstract found.',
        sourceURL: window.location.href,
    };

    if (doi) paper.doi = doi;
    if (pdfURL) paper.pdfURL = pdfURL;

    // As a fallback or for enhancement, try to find JSON-LD data.
    try {
        const jsonLdElement = document.querySelector<HTMLScriptElement>('script[type="application/ld+json"]');
        if (jsonLdElement) {
            const data = JSON.parse(jsonLdElement.innerText);
            // Check for ScholarlyArticle type, which is common.
            if (data['@type'] === 'ScholarlyArticle') {
                // Only overwrite if the meta tag didn't exist.
                if (data.headline && !getMeta('citation_title')) paper.title = data.headline;
                if (data.description && !abstract) paper.abstract = data.description;
                if (data.datePublished && !yearStr) paper.year = new Date(data.datePublished).getFullYear();
                if (data.author && !authors) {
                    paper.authors = Array.isArray(data.author)
                        ? data.author.map((a: { name: string }) => a.name).join(', ')
                        : data.author.name;
                }
                // Sometimes DOI is in 'sameAs' or an identifier field.
                if (!doi && data.sameAs) {
                    const doiLink = Array.isArray(data.sameAs) ? data.sameAs.find(url => url.includes('doi.org')) : (data.sameAs.includes('doi.org') ? data.sameAs : undefined);
                    if (doiLink) paper.doi = doiLink.replace(/https?:\/\/doi.org\//, '');
                }
            }
        }
    } catch (e) {
        // Silently fail if JSON-LD is malformed or doesn't exist.
        console.warn('AI Research Explorer: Could not parse JSON-LD on page.', e);
    }
    
    return paper;
}