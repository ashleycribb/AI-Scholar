import { describe, it, expect } from 'vitest';
import { computeVACS } from './scoringService';
import { Metadata, CitationStats, EvidenceSpan } from '../types';

describe('computeVACS', () => {
  const defaultMeta: Metadata = {
    doi: '10.1234/test',
    title: 'Test Paper',
    credibilityScore: 0.5,
    reproducibilityScore: 0,
    temporalScore: 0.5,
    isRetracted: false
  };

  const defaultCitationStats: CitationStats = {
    total: 10,
    supportCount: 5,
    contradictCount: 0,
    supportRatio: 0.5
  };

  const highQualityEvidence: EvidenceSpan[] = [
    { source: 'test', passage: 'supporting evidence', score: 0.9 }
  ];

  it('should return Verified verdict for high VACS and valid evidence', () => {
    // High scores across the board
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 1.0,
      reproducibilityScore: 1.0,
      temporalScore: 1.0
    };

    const result = computeVACS(meta, defaultCitationStats, highQualityEvidence);

    expect(result.vacs).toBeGreaterThanOrEqual(75);
    expect(result.evidence.length).toBeGreaterThan(0);
    expect(result.verdict).toBe('Verified');
  });

  it('should return Questionable verdict if paper is retracted', () => {
    const meta: Metadata = { ...defaultMeta, isRetracted: true };
    const result = computeVACS(meta, defaultCitationStats, []);

    expect(result.verdict).toBe('Questionable');
    expect(result.rationale[0]).toContain('CRITICAL');
  });

  it('should return Questionable for retracted paper even if VACS is high', () => {
     // This test ensures that retraction overrides high scores
     const meta: Metadata = {
         ...defaultMeta,
         isRetracted: true,
         credibilityScore: 1, // High scores
         reproducibilityScore: 1,
         temporalScore: 1
     };

     // Even with high evidence
     const result = computeVACS(meta, defaultCitationStats, highQualityEvidence);

     // VACS would be high if not retracted
     expect(result.vacs).toBeGreaterThanOrEqual(75);

     // But verdict must be Questionable
     expect(result.verdict).toBe('Questionable');
     expect(result.rationale[0]).toContain('CRITICAL');
  });

  it('should return Questionable for low VACS', () => {
    // Low scores
    const meta: Metadata = {
      ...defaultMeta,
      credibilityScore: 0,
      reproducibilityScore: 0,
      temporalScore: 0
    };

    const result = computeVACS(meta, { ...defaultCitationStats, supportRatio: 0 }, []);

    expect(result.vacs).toBeLessThan(40);
    expect(result.verdict).toBe('Questionable');
  });

  it('should return Inconclusive for middle VACS', () => {
      // Moderate scores
      const meta: Metadata = {
        ...defaultMeta,
        credibilityScore: 0.8,
        reproducibilityScore: 0.8,
        temporalScore: 0.5
      };

      const result = computeVACS(meta, defaultCitationStats, []);

      // VACS ~ 49 roughly
      expect(result.vacs).toBeGreaterThanOrEqual(40);
      expect(result.vacs).toBeLessThan(75);
      expect(result.verdict).toBe('Inconclusive');
  });
});
