import { describe, it, expect } from 'vitest';
import { computeVACS } from '../../services/scoringService';
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from '../../utils/constants';
import { Metadata, CitationStats, EvidenceSpan } from '../../types';

describe('computeVACS', () => {
  const defaultMeta: Metadata = {
    doi: '10.1234/test',
    title: 'Test Paper',
  };

  const defaultStats: CitationStats = {
    total: 10,
    supportCount: 5,
    contradictCount: 1,
    supportRatio: 0.83,
  };

  it('should return default values when optional metadata is missing', () => {
    const result = computeVACS(defaultMeta, defaultStats, []);

    // C=0.5, E=0, R=0, I=0.83, T=0.5
    // Total = 0.25*0.5 + 0.30*0 + 0.20*0 + 0.15*0.83 + 0.10*0.5
    // Total = 0.125 + 0 + 0 + 0.1245 + 0.05 = 0.2995
    // VACS = 30

    expect(result.vacs).toBeCloseTo(30, -1); // Allow slight rounding differences
    expect(result.verdict).toBe('Questionable'); // vacs < 40
    expect(result.breakdown).toEqual({
      credibility: 0.5,
      evidence: 0,
      reproducibility: 0,
      citations: 0.83,
      temporal: 0.5
    });
  });

  it('should return Verified verdict for high scores and valid evidence', () => {
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 1.0,
      reproducibilityScore: 1.0,
      temporalScore: 1.0,
    };

    const stats: CitationStats = {
      ...defaultStats,
      supportRatio: 1.0
    };

    const evidence: EvidenceSpan[] = [
      { source: 'ref1', passage: 'p1', score: 0.9 }
    ];

    const result = computeVACS(meta, stats, evidence);

    // C=1, E=0.9, R=1, I=1, T=1
    // Total = 0.25*1 + 0.30*0.9 + 0.20*1 + 0.15*1 + 0.10*1
    // Total = 0.25 + 0.27 + 0.20 + 0.15 + 0.10 = 0.97
    // VACS = 97

    expect(result.vacs).toBe(97);
    expect(result.verdict).toBe('Verified');
    expect(result.breakdown.evidence).toBe(0.9);
  });

  it('should return Questionable verdict for low scores', () => {
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 0.1,
      reproducibilityScore: 0.1,
      temporalScore: 0.1,
    };

    const stats: CitationStats = {
      ...defaultStats,
      supportRatio: 0.1
    };

    const result = computeVACS(meta, stats, []);

    // C=0.1, E=0, R=0.1, I=0.1, T=0.1
    // Total = 0.25*0.1 + 0 + 0.20*0.1 + 0.15*0.1 + 0.10*0.1
    // Total = 0.025 + 0.02 + 0.015 + 0.01 = 0.07
    // VACS = 7

    expect(result.vacs).toBe(7);
    expect(result.verdict).toBe('Questionable');
  });

  it('should return Questionable verdict if retracted, regardless of score', () => {
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 1.0,
      reproducibilityScore: 1.0,
      temporalScore: 1.0,
      isRetracted: true
    };

    const stats: CitationStats = {
      ...defaultStats,
      supportRatio: 1.0
    };

    const evidence: EvidenceSpan[] = [
      { source: 'ref1', passage: 'p1', score: 0.9 }
    ];

    const result = computeVACS(meta, stats, evidence);

    // VACS calculation would be high (97), but verdict should be Questionable
    expect(result.vacs).toBe(97);
    expect(result.verdict).toBe('Questionable');
    expect(result.rationale[0]).toContain('CRITICAL: This paper has been marked as retracted');
  });

  it('should ignore evidence with confidence below threshold', () => {
    const meta: Metadata = { ...defaultMeta };
    const evidence: EvidenceSpan[] = [
      { source: 'ref1', passage: 'p1', score: MIN_SUPPORT_EVIDENCE_CONFIDENCE - 0.01 } // Just below threshold
    ];

    const result = computeVACS(meta, defaultStats, evidence);

    expect(result.breakdown.evidence).toBe(0);
  });

  it('should use evidence if confidence is at or above threshold', () => {
      const meta: Metadata = { ...defaultMeta };
      const evidence: EvidenceSpan[] = [
        { source: 'ref1', passage: 'p1', score: MIN_SUPPORT_EVIDENCE_CONFIDENCE } // At threshold
      ];

      const result = computeVACS(meta, defaultStats, evidence);

      expect(result.breakdown.evidence).toBe(MIN_SUPPORT_EVIDENCE_CONFIDENCE);
  });

  it('should average evidence scores correctly', () => {
      const meta: Metadata = { ...defaultMeta };
      const evidence: EvidenceSpan[] = [
        { source: 'ref1', passage: 'p1', score: 0.8 },
        { source: 'ref2', passage: 'p2', score: 0.9 }
      ];
      // Avg = 0.85, which is >= threshold (0.75)

      const result = computeVACS(meta, defaultStats, evidence);

      expect(result.breakdown.evidence).toBeCloseTo(0.85);
  });

  it('should treat average evidence score below threshold as 0', () => {
      const meta: Metadata = { ...defaultMeta };
      const evidence: EvidenceSpan[] = [
        { source: 'ref1', passage: 'p1', score: 0.6 },
        { source: 'ref2', passage: 'p2', score: 0.8 }
      ];
      // Avg = 0.7, which is < threshold (0.75)

      const result = computeVACS(meta, defaultStats, evidence);

      expect(result.breakdown.evidence).toBe(0);
  });

  it('should return Inconclusive verdict for middle scores', () => {
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 0.6,
      reproducibilityScore: 0.5,
      temporalScore: 0.5,
    };

    const stats: CitationStats = {
        ...defaultStats,
        supportRatio: 0.5
    };

    // E=0
    // Total = 0.25*0.6 + 0 + 0.20*0.5 + 0.15*0.5 + 0.10*0.5
    // Total = 0.15 + 0 + 0.10 + 0.075 + 0.05 = 0.375
    // VACS = 38 -> Questionable (Wait, < 40 is Questionable)

    // Let's bump it up slightly to be Inconclusive range (40 <= vacs < 75)
    // Increase credibility to 0.7
    meta.credibilityScore = 0.7;
    // Total = 0.175 + 0.10 + 0.075 + 0.05 = 0.40
    // VACS = 40

    const result = computeVACS(meta, stats, []);
    expect(result.vacs).toBe(40);
    expect(result.verdict).toBe('Inconclusive');
  });

    it('should return Inconclusive if score is high but no valid evidence', () => {
        const meta: Metadata = {
            ...defaultMeta,
            credibilityScore: 1.0,
            reproducibilityScore: 1.0,
            temporalScore: 1.0,
        };
        const stats: CitationStats = {
            ...defaultStats,
            supportRatio: 1.0
        };

        // VACS without evidence:
        // Total = 0.25 + 0 + 0.2 + 0.15 + 0.1 = 0.7
        // VACS = 70.
        // Wait, max score without evidence is 0.7 (since Evidence is 0.3).
        // So verdict requires VACS >= 75 AND E_valid > 0.
        // Even if VACS was somehow >= 75 (not possible without Evidence weight), it requires E_valid > 0.

        // To be strictly correct: max score without evidence is 70.
        // If we change weights or something... but with current weights max is 70.
        // So it will always be Inconclusive if score >= 40.

        const result = computeVACS(meta, stats, []);
        expect(result.vacs).toBeLessThan(75);
        expect(result.verdict).toBe('Inconclusive');
    });

});
