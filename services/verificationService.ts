
import { VerificationResult, ResearchPaper, EvidenceSpan } from '../types';
import * as metadataService from './metadataService';
import * as retrievalService from './retrievalService';
import * as entailmentService from './entailmentService';
import * as scoringService from './scoringService';
import * as citationService from './citationService';
import { MIN_EVIDENCE_SPANS_FOR_VERIFIED, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from '../utils/constants';

/**
 * This function orchestrates the entire VACS verification process on the client-side.
 * It prioritizes using data from the `paper` object (local environment) to reduce latency.
 */
export async function verifyPaper(
    paper: ResearchPaper, 
    claimText: string
): Promise<VerificationResult> {
  
  try {
    // 1. Construct metadata from the local paper object (Fast)
    // If specific fields like citations aren't in the local object, this might be less accurate than a fresh fetch,
    // but it is significantly faster for the user experience.
    const meta = metadataService.createMetadataFromPaper(paper);
    
    const claim = claimText.trim() || meta.title || 'Main claim of the paper';
    
    // 2. Find supporting passages
    // Pass the local abstract to avoid an API call
    const candidatePassages = await retrievalService.findSupportingPassages(paper.doi, claim, paper.abstract);
    
    // 3. Check entailment for each passage. No model is integrated, so this
    // returns source 'unavailable' and is not treated as a 0 evidence score.
    const evidenceResults: EvidenceSpan[] = [];
    let evidenceSource: scoringService.EvidenceSource = 'unavailable';
    if (candidatePassages.length > 0) {
        const entailmentPromises = candidatePassages.map(p => 
            entailmentService.checkEntailment(claim, p.passage).then(ent => ({...p, ...ent}))
        );
        const allEntailments = await Promise.all(entailmentPromises);
        const anyReal = allEntailments.some(p => p.source !== 'unavailable');
        if (anyReal) evidenceSource = 'entailment';

        for (const p of allEntailments) {
            if (p.verdict === 'SUPPORT' && p.confidence != null && p.confidence >= MIN_SUPPORT_EVIDENCE_CONFIDENCE) {
                evidenceResults.push({
                    source: p.source,
                    passage: p.passage,
                    score: p.confidence
                });
            }
        }
    }

    // 4. Citation intent only from a real source (scite tally already on the
    // paper, or sciteService). Never fill supporting/contradicting with a ratio.
    const citationStats = paper.sciteTally
        ? (citationService.citationStatsFromSciteTally(paper.sciteTally) ?? {
            ...citationService.UNAVAILABLE_CITATION_STATS,
            total: paper.citations ?? paper.sciteTally.total ?? null,
          })
        : paper.doi
            ? await citationService.analyzeCitations(paper.doi)
            : { ...citationService.UNAVAILABLE_CITATION_STATS, total: paper.citations ?? null };
    
    // 5. Compute the final VACS score and verdict (unknown components omitted)
    const result: VerificationResult = scoringService.computeVACS(meta, citationStats, evidenceResults, evidenceSource);

    // 6. Apply final business logic
    if (result.verdict === 'Verified' && result.evidence.length < MIN_EVIDENCE_SPANS_FOR_VERIFIED) {
      result.verdict = 'Inconclusive';
      result.rationale.push('Verdict changed to Inconclusive: Not enough supporting evidence found.');
    }

    return result;
  } catch (error) {
    console.error("Error during client-side verification:", error);
    if (error instanceof TypeError && error.message.includes('fetch')) { 
        throw new Error(`A network error occurred during verification. Please check your connection and try again.`);
    }
    throw error; // Re-throw other errors
  }
}
