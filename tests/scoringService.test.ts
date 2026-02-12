import { describe, it, expect } from 'vitest';
import { computeVACS } from '../services/scoringService';
import { Metadata, CitationStats, EvidenceSpan } from '../types';

describe('computeVACS', () => {
  const baseMeta: Metadata = {
    doi: '10.1234/5678',
    title: 'Test Paper',
    credibilityScore: 0.8,
    reproducibilityScore: 0.8,
    temporalScore: 0.8,
    isRetracted: false
  };

  const baseCitationStats: CitationStats = {
    total: 10,
    supportCount: 8,
    contradictCount: 1,
    supportRatio: 0.8
  };

  const validEvidence: EvidenceSpan[] = [
    { source: 'ref1', passage: 'supports', score: 0.9 }
  ];

  it('should return "Verified" for high scores and valid evidence', () => {
    const result = computeVACS(baseMeta, baseCitationStats, validEvidence);
    expect(result.verdict).toBe('Verified');
    expect(result.vacs).toBeGreaterThanOrEqual(75);
  });

  it('should return "Questionable" for low VACS score', () => {
    const lowMeta: Metadata = {
      ...baseMeta,
      credibilityScore: 0.2,
      reproducibilityScore: 0.2,
      temporalScore: 0.2
    };
    const lowCitations: CitationStats = {
      ...baseCitationStats,
      supportRatio: 0.2
    };
    const result = computeVACS(lowMeta, lowCitations, []);

    // With these scores:
    // C=0.2, E=0 (empty), R=0.2, I=0.2, T=0.2
    // Weights: C=0.25, E=0.30, R=0.20, I=0.15, T=0.10
    // Total = 0.25*0.2 + 0 + 0.2*0.2 + 0.15*0.2 + 0.1*0.2
    // Total = 0.05 + 0 + 0.04 + 0.03 + 0.02 = 0.14
    // VACS = 14

    expect(result.verdict).toBe('Questionable');
    expect(result.vacs).toBeLessThan(40);
  });

  it('should return "Inconclusive" for intermediate scores', () => {
    // Construct a case that falls between 40 and 75
    // C=0.6, E=0, R=0.6, I=0.6, T=0.6
    // Weights: C=0.25, E=0.30, R=0.20, I=0.15, T=0.10
    // Sum of non-E weights = 0.70
    // Total contribution = 0.6 * 0.70 = 0.42
    // VACS = 42

    const medMeta: Metadata = {
      ...baseMeta,
      credibilityScore: 0.6,
      reproducibilityScore: 0.6,
      temporalScore: 0.6
    };
    const medCitations: CitationStats = {
      ...baseCitationStats,
      supportRatio: 0.6
    };

    const result = computeVACS(medMeta, medCitations, []);

    expect(result.verdict).toBe('Inconclusive');
    expect(result.vacs).toBeGreaterThanOrEqual(40);
    expect(result.vacs).toBeLessThan(75);
  });

  it('should return "Questionable" if paper is retracted, even with high scores', () => {
    const retractedMeta: Metadata = { ...baseMeta, isRetracted: true };
    // Keep scores high enough for verified
    const result = computeVACS(retractedMeta, baseCitationStats, validEvidence);

    // Even if VACS is high
    expect(result.vacs).toBeGreaterThanOrEqual(75);
    // Verdict must be Questionable
    expect(result.verdict).toBe('Questionable');
    expect(result.rationale[0]).toContain('CRITICAL: This paper has been marked as retracted.');
  });
});
