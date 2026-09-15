
import { Metadata, ResearchPaper } from "../types";
import { searchOpenAlexByDoi } from "./openalexService";

// Very simple temporal scoring: decays linearly over 20 years
function calculateTemporalScore(year?: number): number {
    if (!year) return 0.5;
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;
    if (age <= 0) return 1.0;
    if (age >= 20) return 0.0;
    return 1.0 - (age / 20);
}

// Simple credibility score based on citations (log scale)
function calculateCredibilityScore(citations?: number): number {
    if (!citations || citations === 0) return 0.2;
    // scale from 0 to 1, with 1000 citations being ~0.8
    const score = Math.log10(citations + 1) / Math.log10(1001);
    return Math.min(Math.max(score + 0.2, 0.2), 1.0);
}


export async function fetchMetadataByDOI(doi: string): Promise<Metadata> {
  try {
    const paper = await searchOpenAlexByDoi(doi);
    if (!paper) throw new Error(`Paper not found for DOI ${doi}`);
    
    const meta: Metadata = {
        doi: doi,
        title: paper.title,
        authors: paper.authorList ? paper.authorList.map(a => a.name) : paper.authors.split(', '),
        journal: paper.journal,
        year: paper.year,
        citations: paper.citations,
        isRetracted: paper.isRetracted,
        isOpenAccess: paper.isOpenAccess,
        hasData: undefined, // Not easily available from OpenAlex
        hasCode: undefined, // Not easily available from OpenAlex
        temporalScore: calculateTemporalScore(paper.year),
        credibilityScore: calculateCredibilityScore(paper.citations),
        // Placeholder as this is hard to determine automatically
        reproducibilityScore: 0.5, 
        abstract: paper.abstract,
        pdfURL: paper.pdfURL,
    };
    return meta;

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
    return {
        doi: paper.doi,
        title: paper.title,
        authors: paper.authors.split(', '),
        journal: paper.journal,
        year: paper.year,
        citations: paper.citations,
        isRetracted: paper.isRetracted, // Uses local data if available
        isOpenAccess: !!paper.pdfURL || paper.validation?.checks.open_access,
        hasData: undefined,
        hasCode: undefined,
        temporalScore: calculateTemporalScore(paper.year),
        credibilityScore: calculateCredibilityScore(paper.citations),
        reproducibilityScore: 0.5,
        abstract: paper.abstract,
        pdfURL: paper.pdfURL,
    };
}