import { describe, test, expect } from 'bun:test';
import { computeVACS } from './scoringService';
import type { Metadata, CitationStats, EvidenceSpan } from '../types';
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from '../utils/constants';

describe('computeVACS', () => {
    const mockMetadata: Metadata = {
        credibilityScore: 0.8,
        reproducibilityScore: 0.6,
        temporalScore: 0.9,
        title: 'Test Paper',
        doi: '10.1234/test',
        isRetracted: false
    };

    const mockCitationStats: CitationStats = {
        total: 100,
        supportCount: 80,
        contradictCount: 20,
        supportRatio: 0.8
    };

    const highConfidenceEvidence: EvidenceSpan[] = [
        { source: 'ref1', passage: 'supports', score: 0.9 },
        { source: 'ref2', passage: 'supports', score: 0.8 }
    ];

    const lowConfidenceEvidence: EvidenceSpan[] = [
        { source: 'ref1', passage: 'weakly supports', score: 0.6 },
        { source: 'ref2', passage: 'weakly supports', score: 0.5 }
    ];

    test('should calculate VACS correctly with high confidence evidence', () => {
        const result = computeVACS(mockMetadata, mockCitationStats, highConfidenceEvidence);

        // E = (0.9 + 0.8) / 2 = 0.85
        // E_valid = 0.85 (since 0.85 >= 0.75)

        const expectedScore = Math.round(100 * (
            WEIGHTS.credibility * (mockMetadata.credibilityScore ?? 0.5) +
            WEIGHTS.evidence * 0.85 +
            WEIGHTS.reproducibility * (mockMetadata.reproducibilityScore ?? 0) +
            WEIGHTS.citations * (mockCitationStats.supportRatio ?? 0.5) +
            WEIGHTS.temporal * (mockMetadata.temporalScore ?? 0.5)
        ));

        expect(result.vacs).toBe(expectedScore);
        // It's possible verdict is not Verified if score is low, but with these inputs:
        // 0.25*0.8 + 0.30*0.85 + 0.20*0.6 + 0.15*0.8 + 0.10*0.9 = 0.2 + 0.255 + 0.12 + 0.12 + 0.09 = 0.785 -> 79
        // 79 >= 75 and E_valid > 0, so Verified.
        expect(result.verdict).toBe('Verified');
    });

    test('should use 0 evidence score if average evidence confidence is below threshold', () => {
        const result = computeVACS(mockMetadata, mockCitationStats, lowConfidenceEvidence);

        // E = 0.55
        // E_valid = 0 (since 0.55 < 0.75)

        const expectedScore = Math.round(100 * (
            WEIGHTS.credibility * (mockMetadata.credibilityScore ?? 0.5) +
            WEIGHTS.evidence * 0 +
            WEIGHTS.reproducibility * (mockMetadata.reproducibilityScore ?? 0) +
            WEIGHTS.citations * (mockCitationStats.supportRatio ?? 0.5) +
            WEIGHTS.temporal * (mockMetadata.temporalScore ?? 0.5)
        ));

        expect(result.vacs).toBe(expectedScore);
        expect(result.breakdown.evidence).toBe(0);
        // With 0 evidence score, verdict cannot be verified.
        expect(result.verdict).not.toBe('Verified');
    });

    test('should handle missing metadata scores using defaults', () => {
        const emptyMeta: Metadata = {
            title: 'Empty Paper',
            doi: '10.0000/empty'
        };
        const emptyStats: CitationStats = {
            total: 0,
            supportCount: 0,
            contradictCount: 0,
            supportRatio: undefined as unknown as number // Force undefined to test default
        };

        const result = computeVACS(emptyMeta, emptyStats, []);

        // Defaults: C=0.5, R=0, T=0.5, I=0.5 (clamped 0.5)
        // E=0, E_valid=0

        const expectedScore = Math.round(100 * (
            WEIGHTS.credibility * 0.5 +
            WEIGHTS.evidence * 0 +
            WEIGHTS.reproducibility * 0 +
            WEIGHTS.citations * 0.5 +
            WEIGHTS.temporal * 0.5
        ));

        expect(result.vacs).toBe(expectedScore);
        expect(result.breakdown.credibility).toBe(0.5);
        expect(result.breakdown.reproducibility).toBe(0);
        expect(result.breakdown.temporal).toBe(0.5);
        expect(result.breakdown.citations).toBe(0.5);
    });

    test('should mark verdict as Questionable if VACS < 40', () => {
         const badMeta: Metadata = {
            credibilityScore: 0.1,
            reproducibilityScore: 0,
            temporalScore: 0.1
        };
        const badStats: CitationStats = {
             total: 10, supportCount: 0, contradictCount: 10, supportRatio: 0
        };
        // No evidence

        const result = computeVACS(badMeta, badStats, []);
        // Score: 0.25*0.1 + 0 + 0 + 0 + 0.10*0.1 = 0.025 + 0.01 = 0.035 -> 4
        expect(result.vacs).toBeLessThan(40);
        expect(result.verdict).toBe('Questionable');
    });

    test('should mark verdict as Questionable if paper is retracted regardless of high score', () => {
         const goodMetaButRetracted: Metadata = {
            credibilityScore: 1,
            reproducibilityScore: 1,
            temporalScore: 1,
            isRetracted: true,
            title: 'Retracted Paper',
            doi: '10.1111/retracted'
        };
         const goodStats: CitationStats = {
             total: 100, supportCount: 100, contradictCount: 0, supportRatio: 1
        };

        // Even with high evidence
        const goodEvidence: EvidenceSpan[] = [
             { source: 's', passage: 'p', score: 1 }
        ];

        const result = computeVACS(goodMetaButRetracted, goodStats, goodEvidence);

        // Score calculation should still proceed normally
        expect(result.vacs).toBeGreaterThan(90);

        // But verdict must be Questionable
        expect(result.verdict).toBe('Questionable');

        // Rationale should include warning
        const warning = result.rationale.find(r => r.includes('CRITICAL'));
        expect(warning).toBeDefined();
    });

    test('should clamp citation support ratio between 0 and 1', () => {
         const meta: Metadata = { credibilityScore: 0.5 };

         const statsOver: CitationStats = {
             total: 0, supportCount: 0, contradictCount: 0, supportRatio: 1.5
         };

         const statsUnder: CitationStats = {
             total: 0, supportCount: 0, contradictCount: 0, supportRatio: -0.5
         };

         const resultOver = computeVACS(meta, statsOver, []);
         expect(resultOver.breakdown.citations).toBe(1); // Clamped to 1

         const resultUnder = computeVACS(meta, statsUnder, []);
         expect(resultUnder.breakdown.citations).toBe(0); // Clamped to 0
    });
});
