// agent-backend/src/services/scoringService.ts (Copy of backend/src/services/scoringService.ts)
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";
import { Metadata, CitationStats, VerificationResult, EvidenceSpan } from "../types";

export function computeVACS(meta: Metadata, citationStats: CitationStats, evidenceSpans: EvidenceSpan[]): VerificationResult {
  const C = meta.credibilityScore ?? 0.5;
  const E = evidenceSpans.length === 0 ? 0 : (evidenceSpans.reduce((s,p)=>s + (p.score || 0),0) / evidenceSpans.length);
  const E_valid = E >= MIN_SUPPORT_EVIDENCE_CONFIDENCE ? E : 0;
  const R = meta.reproducibilityScore ?? 0;
  const I = Math.max(0, Math.min(1, citationStats.supportRatio ?? 0.5));
  const T = meta.temporalScore ?? 0.5;

  const total = WEIGHTS.credibility * C + WEIGHTS.evidence * E_valid + WEIGHTS.reproducibility * R + WEIGHTS.citations * I + WEIGHTS.temporal * T;
  const vacs = Math.round(100 * total);

  let verdict: VerificationResult['verdict'] = 'Inconclusive';
  if (E_valid > MIN_SUPPORT_EVIDENCE_CONFIDENCE && C > 0.4) verdict = 'Verified';
  if (meta.isRetracted || C < 0.2) verdict = 'Questionable';

  const rationale = [
    `Credibility: ${(C*100).toFixed(0)}%`,
    `Evidence avg entailment: ${(E*100).toFixed(0)}% (min required ${(MIN_SUPPORT_EVIDENCE_CONFIDENCE*100).toFixed(0)}%)`,
    `Reproducibility: ${(R*100).toFixed(0)}%`,
    `Citation support ratio: ${(I*100).toFixed(0)}%`,
    `Temporal score: ${(T*100).toFixed(0)}%`
  ];

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