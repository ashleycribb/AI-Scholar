import { describe, it, expect } from 'vitest';
import { computeVACS } from '../services/scoringService';
import { Metadata, CitationStats, EvidenceSpan, VerificationResult } from '../types';

describe('computeVACS', () => {
    // Shared mock data
    const baseMeta: Metadata = {
        title: 'Test Paper',
        doi: '10.1234/test',
        isRetracted: false,
        authors: ['Test Author'],
        year: 2023,
        journal: 'Journal of Science',
    };

    const baseCitationStats: CitationStats = {
        total: 100,
        supportCount: 80,
        contradictCount: 5,
        supportRatio: 0.8
    };

    const strongEvidence: EvidenceSpan[] = [
        {
            source: 'test-source',
            passage: 'test passage',
            score: 0.9
        }
    ];

    it('should mark retracted papers as Questionable regardless of high scores', () => {
        const meta: Metadata = {
            ...baseMeta,
            isRetracted: true,
            credibilityScore: 0.9,
            reproducibilityScore: 0.9,
            temporalScore: 0.9,
        };

        const result: VerificationResult = computeVACS(meta, baseCitationStats, strongEvidence);

        expect(result.vacs).toBeGreaterThanOrEqual(75);
        expect(result.verdict).toBe('Questionable');
        expect(result.rationale[0]).toContain('CRITICAL: This paper has been marked as retracted.');
    });

    it('should mark high-scoring papers with valid evidence as Verified', () => {
        const meta: Metadata = {
            ...baseMeta,
            credibilityScore: 0.9,
            reproducibilityScore: 0.9,
            temporalScore: 0.9,
        };

        const result: VerificationResult = computeVACS(meta, baseCitationStats, strongEvidence);

        expect(result.vacs).toBeGreaterThanOrEqual(75);
        expect(result.evidence.length).toBeGreaterThan(0);
        expect(result.verdict).toBe('Verified');
    });

    it('should mark low-scoring papers as Questionable', () => {
        const meta: Metadata = {
            ...baseMeta,
            credibilityScore: 0.1,
            reproducibilityScore: 0.1,
            temporalScore: 0.1,
        };

        const poorCitations: CitationStats = {
            total: 10,
            supportCount: 1,
            contradictCount: 8,
            supportRatio: 0.1
        };

        const weakEvidence: EvidenceSpan[] = []; // No evidence

        const result: VerificationResult = computeVACS(meta, poorCitations, weakEvidence);

        expect(result.vacs).toBeLessThan(40);
        expect(result.verdict).toBe('Questionable');
    });

    it('should mark medium-scoring papers as Inconclusive', () => {
        const meta: Metadata = {
            ...baseMeta,
            credibilityScore: 0.5,
            reproducibilityScore: 0.5,
            temporalScore: 0.5,
        };

        const mediumCitations: CitationStats = {
            total: 50,
            supportCount: 25,
            contradictCount: 25,
            supportRatio: 0.5
        };

        // Even with evidence, if score is not >= 75
        // Let's verify what the score would be roughly.
        // C=0.5, E=0.8, R=0.5, I=0.5, T=0.5
        // Weights: cred 0.25, evid 0.30, repro 0.20, cit 0.15, temp 0.10
        // Score = 0.125 + 0.24 + 0.1 + 0.075 + 0.05 = 0.59 => 59.

        // Need to make sure E is valid (>= 0.75) for it to count as E_valid in score calculation?
        // computeVACS: const E_valid = E >= MIN_SUPPORT_EVIDENCE_CONFIDENCE ? E : 0;
        // MIN_SUPPORT_EVIDENCE_CONFIDENCE is 0.75.

        const validEvidence: EvidenceSpan[] = [{ source: 's', passage: 'p', score: 0.8 }];

        const result: VerificationResult = computeVACS(meta, mediumCitations, validEvidence);

        // Expect score around 59
        // 59 is between 40 and 75 -> Inconclusive
        expect(result.vacs).toBeGreaterThan(40);
        expect(result.vacs).toBeLessThan(75);
        expect(result.verdict).toBe('Inconclusive');
    });

    it('should NOT verify papers with high score but NO valid evidence', () => {
         // Create a scenario where score is high solely due to other factors (if possible)
         // Max score without evidence:
         // Cred (0.25) + Repro (0.20) + Cit (0.15) + Temp (0.10) = 0.70 => 70.
         // Wait, max score without evidence is 70. So it's impossible to get >= 75 without evidence?
         // Let's check weights in utils/constants.ts

         // If weights sum to 1.0.
         // 0.25 + 0.30 + 0.20 + 0.15 + 0.10 = 1.00. Correct.
         // So if evidence is 0, max score is 70.

         // So strictly speaking, logic `E_valid > 0 && vacs >= 75` implies that `E_valid` MUST be > 0 because otherwise vacs can't be >= 75.
         // UNLESS there is a bug in weights or calculation.

         // However, let's test a case where E is present but score < 0.75 (so invalid), but other scores are perfect.
         // E = 0.7 (below 0.75 threshold). E_valid becomes 0.
         // Max score = 70.

         // So it seems impossible to get >= 75 without valid evidence.
         // But let's verify that behavior: High other metrics, low evidence confidence -> Inconclusive (max 70).

        const meta: Metadata = {
            ...baseMeta,
            credibilityScore: 1.0,
            reproducibilityScore: 1.0,
            temporalScore: 1.0,
        };

        const perfectCitations: CitationStats = {
            total: 100,
            supportCount: 100,
            contradictCount: 0,
            supportRatio: 1.0
        };

        const weakEvidence: EvidenceSpan[] = [{ source: 's', passage: 'p', score: 0.6 }]; // < 0.75

        const result: VerificationResult = computeVACS(meta, perfectCitations, weakEvidence);

        // E_valid should be 0.
        // Score should be 70.
        expect(result.breakdown.evidence).toBe(0);
        expect(result.vacs).toBe(70);
        expect(result.verdict).toBe('Inconclusive'); // 70 < 75
    });
});
