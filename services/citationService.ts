import type { ResearchPaper, CitationStyle } from '../types';

let citeConstructorPromise: Promise<any> | null = null;

/**
 * Returns a promise that resolves with the `Cite` constructor.
 * It assumes Citation.js scripts have been loaded globally via script tags in index.html.
 * @returns A promise that resolves to the `Cite` constructor.
 */
const getCiteConstructor = (): Promise<any> => {
    // If the promise is already created (or resolved), return it.
    if (citeConstructorPromise) {
        return citeConstructorPromise;
    }

    // Create a promise that resolves with the global `Cite` object.
    citeConstructorPromise = new Promise((resolve, reject) => {
        // The scripts are loaded before this module, so Cite should be available on the window object.
        const GlobalCite = (window as any).Cite;
        
        // Final check to ensure everything is ready.
        if (typeof GlobalCite === 'function' && GlobalCite.plugins?.output.has('ris')) {
            resolve(GlobalCite);
        } else {
            // This case should ideally not be hit if the script tags in index.html are correct.
            reject(new Error("Citation.js library not found or failed to initialize. Please check the script tags in your HTML."));
        }
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
    
    // Add DOI or URL if available
    if (paper.sourceURL && paper.sourceURL.includes('doi.org')) {
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