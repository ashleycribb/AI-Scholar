import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";
import { Metadata, CitationStats, VerificationResult, EvidenceSpan } from "../types";

export function computeVACS(meta: Metadata, citationStats: CitationStats, evidenceSpans: EvidenceSpan[]): VerificationResult {
  const C = meta.credibilityScore ?? 0.5;
  // Evidence score: average of entailment confidences, but must satisfy minimum
  const E = evidenceSpans.length === 0 ? 0 : (evidenceSpans.reduce((s,p)=>s + (p.score || 0),0) / evidenceSpans.length);
  const E_valid = E >= MIN_SUPPORT_EVIDENCE_CONFIDENCE ? E : 0;
  const R = meta.reproducibilityScore ?? 0;
  const I = Math.max(0, Math.min(1, citationStats.supportRatio ?? 0.5));
  const T = meta.temporalScore ?? 0.5;

  const total = WEIGHTS.credibility * C + WEIGHTS.evidence * E_valid + WEIGHTS.reproducibility * R + WEIGHTS.citations * I + WEIGHTS.temporal * T;
  const vacs = Math.round(100 * total);

  // determine verdict conservatively
  let verdict: VerificationResult['verdict'] = 'Inconclusive';
  if (meta.isRetracted) {
      verdict = 'Questionable';
  } else if (E_valid > 0 && vacs >= 75) {
      verdict = 'Verified';
  } else if (vacs < 40) {
      verdict = 'Questionable';
  }

  const rationale = [
    `Credibility score of ${(C*100).toFixed(0)}% based on citation count and journal prestige.`,
    `Evidence score of ${(E_valid*100).toFixed(0)}% based on finding passages that support the claim.`,
    `Reproducibility score of ${(R*100).toFixed(0)}% based on availability of code/data (mocked).`,
    `Citation context score of ${(I*100).toFixed(0)}% based on the ratio of supporting to contradicting citations.`,
    `Temporal score of ${(T*100).toFixed(0)}% based on the paper's publication date.`
  ];

  if (meta.isRetracted) {
      rationale.unshift("CRITICAL: This paper has been marked as retracted.");
  }

  return {
    doi: meta.doi,
    title: meta.title,
    vacs,
    verdict,
    breakdown: { credibility: C, evidence: E_valid, reproducibility: R, citations: I, temporal: T },
    evidence: evidenceSpans,
    rationale
  };
}
