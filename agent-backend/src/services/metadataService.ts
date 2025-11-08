// agent-backend/src/services/metadataService.ts (Copy of backend/src/services/metadataService.ts)
import { Metadata } from "../types/index.js";

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
    const score = Math.log10(citations + 1) / Math.log10(1001);
    return Math.min(Math.max(score + 0.2, 0.2), 1.0);
}

export async function fetchMetadataByDOI(doi: string): Promise<Metadata> {
  try {
    const response = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    if (!response.ok) throw new Error(`OpenAlex fetch failed with status ${response.status}`);
    
    const data = await response.json();
    
    const meta: Metadata = {
        doi: doi,
        title: data.title,
        authors: data.authorships?.map((a: any) => a.author.display_name),
        journal: data.host_venue?.display_name,
        year: data.publication_year,
        citations: data.cited_by_count,
        isRetracted: data.is_retracted,
        isOpenAccess: data.open_access?.is_oa,
        hasData: undefined,
        hasCode: undefined,
        temporalScore: calculateTemporalScore(data.publication_year),
        credibilityScore: calculateCredibilityScore(data.cited_by_count),
        reproducibilityScore: 0.5, 
    };
    return meta;

  } catch (error) {
      console.error(`Failed to fetch metadata for DOI ${doi}:`, error);
      throw new Error(`Could not retrieve metadata for DOI: ${doi}.`);
  }
}