
import { Metadata, ResearchPaper } from "../types";
import { searchOpenAlexByDoi } from "./openalexService";

// Linear decay over 20 years when a publication year is known. Missing year is unknown, not 0.5.
export function calculateTemporalScore(year?: number | null): number | null {
    if (year == null || !Number.isFinite(year)) return null;
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age <= 0) return 1.0;
    if (age >= 20) return 0.0;
    return 1.0 - (age / 20);
}

// Log-scale credibility from a known citation count (including 0). Missing count is unknown, not 0.2.
export function calculateCredibilityScore(citations?: number | null): number | null {
    if (citations == null || !Number.isFinite(citations) || citations < 0) return null;
    if (citations === 0) return 0.2;
    // scale from 0 to 1, with 1000 citations being ~0.8
    const score = Math.log10(citations + 1) / Math.log10(1001);
    return Math.min(Math.max(score + 0.2, 0.2), 1.0);
}

function metadataFromPaperFields(paper: {
    doi?: string;
    title: string;
    authors?: string | string[];
    authorList?: { name: string }[];
    journal?: string;
    year?: number;
    citations?: number;
    isRetracted?: boolean;
    isOpenAccess?: boolean;
    pdfURL?: string;
    abstract?: string;
    validation?: { checks: { open_access?: boolean } };
}): Metadata {
    const authors = typeof paper.authors === 'string'
        ? paper.authors.split(', ')
        : (paper.authorList ? paper.authorList.map(a => a.name) : []);
    return {
        doi: paper.doi,
        title: paper.title,
        authors,
        journal: paper.journal,
        year: paper.year,
        citations: paper.citations,
        isRetracted: paper.isRetracted,
        isOpenAccess: paper.isOpenAccess ?? (!!paper.pdfURL || paper.validation?.checks.open_access),
        hasData: undefined,
        hasCode: undefined,
        temporalScore: calculateTemporalScore(paper.year),
        credibilityScore: calculateCredibilityScore(paper.citations),
        // No code/data availability source is integrated; never fill this with 0.5.
        reproducibilityScore: undefined,
        abstract: paper.abstract,
        pdfURL: paper.pdfURL,
    };
}


export async function fetchMetadataByDOI(doi: string): Promise<Metadata> {
  try {
    const paper = await searchOpenAlexByDoi(doi);
    if (!paper) throw new Error(`Paper not found for DOI ${doi}`);
    return metadataFromPaperFields({ ...paper, doi });
  } catch (error) {
      console.error(`Failed to fetch metadata for DOI ${doi}:`, error);
      throw new Error(`Could not retrieve metadata for DOI: ${doi}.`);
  }
}

/**
 * Creates a Metadata object from an existing ResearchPaper, avoiding external API calls.
 * This uses the "local researcher's environment" data to speed up verification.
 */
export function createMetadataFromPaper(paper: ResearchPaper): Metadata {
    return metadataFromPaperFields({
        ...paper,
        isOpenAccess: !!paper.pdfURL || paper.validation?.checks.open_access,
    });
}
