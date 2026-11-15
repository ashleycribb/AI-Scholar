import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";
import { Metadata, CitationStats, VerificationResult, EvidenceSpan } from "../types";

export type EvidenceSource = 'entailment' | 'unavailable';

function knownScore(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function percentLabel(value: number): string {
  return `${(value * 100).toFixed(0)}%`;
}

/**
 * VACS from the components that actually have a value.
 * Unknown components (null / undefined) are omitted and the remaining weights
 * are renormalized, so a missing citation-intent ratio does not raise or lower
 * the score the way a default of 0.5 would.
 *
 * evidenceSource must name the check that produced evidenceSpans:
 * - 'entailment': empty spans are a real 0 (the check ran and found nothing)
 * - 'unavailable': no entailment model ran; evidence is not a 0 and is omitted
 */
export function computeVACS(
  meta: Metadata,
  citationStats: CitationStats,
  evidenceSpans: EvidenceSpan[],
  evidenceSource: EvidenceSource = 'entailment',
): VerificationResult {
  const C = knownScore(meta.credibilityScore) ? meta.credibilityScore : null;
  const E = evidenceSource === 'unavailable'
    ? null
    : (evidenceSpans.length === 0
        ? 0
        : (evidenceSpans.reduce((s, p) => s + (p.score || 0), 0) / evidenceSpans.length));
  const E_valid = E === null ? null : (E >= MIN_SUPPORT_EVIDENCE_CONFIDENCE ? E : 0);
  const R = knownScore(meta.reproducibilityScore) ? meta.reproducibilityScore : null;
  const I = knownScore(citationStats.supportRatio) ? Math.max(0, Math.min(1, citationStats.supportRatio)) : null;
  const T = knownScore(meta.temporalScore) ? meta.temporalScore : null;

  const parts: Array<{ key: keyof VerificationResult['breakdown']; weight: number; value: number | null }> = [
    { key: 'credibility', weight: WEIGHTS.credibility, value: C },
    { key: 'evidence', weight: WEIGHTS.evidence, value: E_valid },
    { key: 'reproducibility', weight: WEIGHTS.reproducibility, value: R },
    { key: 'citations', weight: WEIGHTS.citations, value: I },
    { key: 'temporal', weight: WEIGHTS.temporal, value: T },
  ];

  const known = parts.filter((p) => p.value !== null) as Array<{ key: keyof VerificationResult['breakdown']; weight: number; value: number }>;
  const weightSum = known.reduce((s, p) => s + p.weight, 0);
  const total = weightSum > 0 ? known.reduce((s, p) => s + p.weight * p.value, 0) / weightSum : null;
  const vacs = total === null ? null : Math.round(100 * total);

  let verdict: VerificationResult['verdict'] = 'Inconclusive';
  if (meta.isRetracted) {
    verdict = 'Questionable';
  } else if (E_valid !== null && E_valid > 0 && vacs !== null && vacs >= 75) {
    verdict = 'Verified';
  } else if (vacs !== null && vacs < 40) {
    verdict = 'Questionable';
  }

  const rationale: string[] = [];
  if (meta.isRetracted) {
    rationale.push("CRITICAL: This paper has been marked as retracted.");
  }
  rationale.push(
    C !== null
      ? `Credibility score of ${percentLabel(C)} based on citation count and journal prestige.`
      : 'Credibility is not available (no citation count to score).',
    E_valid !== null
      ? `Evidence score of ${percentLabel(E_valid)} based on finding passages that support the claim.`
      : 'Evidence is not available (no entailment model is integrated).',
    R !== null
      ? `Reproducibility score of ${percentLabel(R)} based on availability of code/data.`
      : 'Reproducibility is not available (no code/data availability source).',
    I !== null
      ? `Citation context score of ${percentLabel(I)} based on the ratio of supporting to contradicting citations (${citationStats.source}).`
      : 'Citation context is not available (no citation-intent source).',
    T !== null
      ? `Temporal score of ${percentLabel(T)} based on the paper's publication date.`
      : 'Temporal score is not available (no publication year).',
  );

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
