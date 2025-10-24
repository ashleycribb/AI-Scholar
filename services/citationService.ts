import type { ResearchPaper, CitationStyle } from '../types';

let citeConstructorPromise: Promise<any> | null = null;

/**
 * Returns a promise that resolves with the `Cite` constructor.
 * It assumes Citation.js scripts have been loaded globally via script tags in index.html.
 * It polls for the library to become available, as `window.onload` is not always reliable.
 * @returns A promise that resolves to the `Cite` constructor.
 */
const getCiteConstructor = (): Promise<any> => {
    // If the promise is already created (and pending or resolved), return it.
    if (citeConstructorPromise) {
        return citeConstructorPromise;
    }

    // Create a promise that resolves when the library is ready.
    citeConstructorPromise = new Promise((resolve, reject) => {
        const POLLING_INTERVAL_MS = 100;
        const MAX_WAIT_MS = 8000; // 8 seconds timeout
        let totalWait = 0;

        const pollForCite = setInterval(() => {
            const GlobalCite = (window as any).Cite;

            // Check that the core library and both required plugins are ready.
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
                    let reason = "Citation.js library failed to initialize in time.";
                    if (typeof GlobalCite !== 'function') {
                        reason += " Core library (Cite) not found on window.";
                    } else if (!GlobalCite.plugins?.output?.has('ris')) {
                        reason += " RIS plugin not registered.";
                    } else if (!GlobalCite.plugins?.csl?.templates?.has('apa')) {
                        reason += " CSL plugin not registered (required for citation styles).";
                    }
                    reject(new Error(reason));
                }
            }
        }, POLLING_INTERVAL_MS);
    });

    return citeConstructorPromise;
};


/**
 * Maps an internal ResearchPaper object to the CSL-JSON format
 * required by Citation.js.
 * @param paper - The research paper to convert.
 * @returns A CSL-JSON object.
 */
const mapPaperToCSL = (paper: ResearchPaper): any => {
    // A simple author parser. Assumes "Family, G." or "Given Family" formats.
    const authors = paper.authors.split(',').map(name => {
        const trimmedName = name.trim();
        // More robust parsing could be added here if needed
        const parts = trimmedName.split(' ');
        const family = parts.pop() || '';
        const given = parts.join(' ');
        return { given, family };
    });

    const cslData: any = {
        type: 'article-journal', // A reasonable default assumption
        id: paper.title.toLowerCase().replace(/\s+/g, '-'),
        title: paper.title,
        author: authors,
        issued: {
            'date-parts': [[paper.year]],
        },
    };
    
    // Add DOI or URL if available, prioritizing DOI.
    if (paper.doi) {
        cslData.DOI = paper.doi;
    } else if (paper.sourceURL && paper.sourceURL.includes('doi.org')) {
        cslData.DOI = paper.sourceURL.replace('https://doi.org/', '');
    } else if (paper.sourceURL) {
        cslData.URL = paper.sourceURL;
    }

    return cslData;
};

/**
 * Generates formatted citations for a list of papers using Citation.js.
 * @param papers - An array of ResearchPaper objects.
 * @param style - The citation style to use (e.g., 'apa', 'mla').
 * @returns An array of HTML-formatted citation strings.
 */
export const generateCitations = async (papers: ResearchPaper[], style: CitationStyle): Promise<string[]> => {
    try {
        const Cite = await getCiteConstructor();
        
        const cslData = papers.map(mapPaperToCSL);
        const cite = new Cite(cslData);
        
        // Maps our internal style names to the template names used by Citation.js
        const styleMap = {
            apa: 'apa',
            mla: 'modern-language-association',
            chicago: 'chicago-author-date',
            harvard: 'harvard-cite-them-right',
            ieee: 'ieee',
            vancouver: 'vancouver'
        };
        
        const output = cite.format('bibliography', {
            format: 'html',
            template: styleMap[style] || 'apa', // Default to APA
            lang: 'en-US'
        });
        
        // The output is a single HTML string with entries separated by newlines.
        // We split it to get an array of individual citation strings.
        return output.split('\n').filter((c: string) => c.trim().length > 0);
    } catch (error) {
        console.error("Error during citation generation:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to generate citations: ${errorMessage}`);
    }
};

/**
 * Generates a RIS string for a list of papers, suitable for Zotero/Mendeley.
 * @param papers - An array of ResearchPaper objects.
 * @returns A single string containing all references in RIS format.
 */
export const generateRIS = async (papers: ResearchPaper[]): Promise<string> => {
    try {
        const Cite = await getCiteConstructor();
        const cslData = papers.map(mapPaperToCSL);
        const cite = new Cite(cslData);

        // Generate the RIS string
        const risString = cite.format('ris');
        
        return risString;
    } catch (error) {
        console.error("Error generating RIS:", error);
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred.";
        throw new Error(`Failed to generate RIS file for Zotero: ${errorMessage}`);
    }
};