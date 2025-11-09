import { VerificationResult, VerificationBreakdown, Verdict, Metadata, CitationStats, EvidenceSpan } from '../types';
import * as metadataService from './metadataService';
import * as retrievalService from './retrievalService';
import * as entailmentService from './entailmentService';
import * as scoringService from './scoringService';
import * as citationService from './citationService';
import { MIN_EVIDENCE_SPANS_FOR_VERIFIED, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from '../utils/constants';

/**
 * This function orchestrates the entire VACS verification process on the client-side.
 */
export async function verifyPaper(
    doi: string, 
    claimText: string
): Promise<VerificationResult> {
  
  try {
    // 1. Fetch metadata
    const meta = await metadataService.fetchMetadataByDOI(doi);
    const claim = claimText.trim() || meta.title || 'Main claim of the paper';
    
    // 2. Find supporting passages
    const candidatePassages = await retrievalService.findSupportingPassages(doi, claim);
    
    // 3. Check entailment for each passage
    const evidenceResults: EvidenceSpan[] = [];
    if (candidatePassages.length > 0) {
        const entailmentPromises = candidatePassages.map(p => 
            entailmentService.checkEntailment(claim, p.passage).then(ent => ({...p, ...ent}))
        );
        const allEntailments = await Promise.all(entailmentPromises);
        
        for (const p of allEntailments) {
            if (p.verdict === 'SUPPORT' && p.confidence >= MIN_SUPPORT_EVIDENCE_CONFIDENCE) {
                evidenceResults.push({
                    source: p.source,
                    passage: p.passage,
                    score: p.confidence
                });
            }
        }
    }

    // 4. Analyze citation context
    const citationStats = await citationService.analyzeCitations(doi);
    
    // 5. Compute the final VACS score and verdict
    const result: VerificationResult = scoringService.computeVACS(meta, citationStats, evidenceResults);

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
