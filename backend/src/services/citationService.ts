import axios from 'axios';
import { CitationStats } from "../types";

/**
 * Fetch citation contexts and compute simple support/contradict counts.
 * This is a simplified call that would use Semantic Scholar or S2ORC extracts.
 */
export async function analyzeCitations(doi: string): Promise<CitationStats> {
  // Semantic Scholar example endpoint:
  // https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=citationCount,citations
  // For each citation, we'd need the citation text context to run a classifier.
  try {
    const response = await axios.get(`https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=citationCount`);
    const total = response.data?.citationCount || 0;
    // placeholder: assume supportive ratio = 0.7 for initial
    const supportCount = Math.round(total * 0.7);
    const contradictCount = Math.round(total * 0.05);
    return {
      total,
      supportCount,
      contradictCount,
      supportRatio: total === 0 ? 0.5 : (supportCount - contradictCount) / Math.max(1, total)
    };
  } catch (e) {
    if (axios.isAxiosError(e) && e.response) {
      // This is not necessarily an error if the paper is not found, so we can return default stats.
      console.warn(`Semantic Scholar API returned status ${e.response.status} for DOI: ${doi}`);
    } else {
      console.error(`Failed to analyze citations for DOI ${doi}:`, e);
    }
    return { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };
  }
}
