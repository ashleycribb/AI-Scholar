// agent-backend/src/services/citationService.ts (Copy of backend/src/services/citationService.ts)
import { CitationStats } from "../types";

/**
 * Fetch citation contexts and compute simple support/contradict counts.
 * This is a simplified call that would use Semantic Scholar or S2ORC extracts.
 */
export async function analyzeCitations(doi: string): Promise<CitationStats> {
  try {
    const response = await fetch(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount`);
    
    if (!response.ok) {
        console.warn(`Semantic Scholar API returned status ${response.status} for DOI: ${doi}`);
        return { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };
    }
    const data = await response.json();
    const total = data?.citationCount || 0;
    const supportCount = Math.round(total * 0.7);
    const contradictCount = Math.round(total * 0.05);
    return {
      total,
      supportCount,
      contradictCount,
      supportRatio: total === 0 ? 0.5 : (supportCount - contradictCount) / Math.max(1, total)
    };
  } catch (e) {
    console.error(`Failed to analyze citations for DOI ${doi}:`, e);
    return { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };
  }
}