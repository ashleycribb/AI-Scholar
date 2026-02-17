import { describe, it, expect } from 'vitest';
import { computeVACS } from '../../services/scoringService';
import { Metadata, CitationStats, EvidenceSpan } from '../../types';

describe('computeVACS', () => {
    const mockCitationStats: CitationStats = {
        total: 10,
        supportCount: 8,
        contradictCount: 1,
        supportRatio: 0.8
    };

    const mockEvidenceSpan: EvidenceSpan = {
        source: 'test',
        passage: 'This supports the claim.',
        score: 0.9
    };

    it('should mark a retracted paper as Questionable even if it has high scores', () => {
        const meta: Metadata = {
            title: 'Retracted Paper',
            isRetracted: true,
            credibilityScore: 1.0,
            reproducibilityScore: 1.0,
            temporalScore: 1.0
        };

        // High scores for everything
        const result = computeVACS(meta, { ...mockCitationStats, supportRatio: 1.0 }, [mockEvidenceSpan]);

        // VACS calculation should yield a high score
        expect(result.vacs).toBeGreaterThan(75);

        // However, verdict MUST be Questionable because it is retracted
        expect(result.verdict).toBe('Questionable');
    });

    it('should mark a retracted paper as Questionable if it has low scores', () => {
        const meta: Metadata = {
            title: 'Retracted Low Score',
            isRetracted: true,
            credibilityScore: 0.1,
            reproducibilityScore: 0.0,
            temporalScore: 0.1
        };

        const result = computeVACS(meta, { ...mockCitationStats, supportRatio: 0.1 }, []);

        expect(result.verdict).toBe('Questionable');
    });

    it('should mark a valid paper with high scores as Verified', () => {
        const meta: Metadata = {
            title: 'Valid High Score',
            isRetracted: false,
            credibilityScore: 0.9,
            reproducibilityScore: 0.8,
            temporalScore: 0.9
        };

        const result = computeVACS(meta, { ...mockCitationStats, supportRatio: 0.9 }, [mockEvidenceSpan]);

        expect(result.vacs).toBeGreaterThanOrEqual(75);
        expect(result.verdict).toBe('Verified');
    });

    it('should mark a valid paper with low scores as Questionable', () => {
        const meta: Metadata = {
            title: 'Valid Low Score',
            isRetracted: false,
            credibilityScore: 0.1,
            reproducibilityScore: 0.1,
            temporalScore: 0.1
        };

        const result = computeVACS(meta, { ...mockCitationStats, supportRatio: 0.1 }, []);

        expect(result.vacs).toBeLessThan(40);
        expect(result.verdict).toBe('Questionable');
    });

    it('should mark a valid paper with mid scores as Inconclusive', () => {
        const midMeta: Metadata = {
             title: 'Valid Mid Score',
             isRetracted: false,
             credibilityScore: 0.6,
             reproducibilityScore: 0.5,
             temporalScore: 0.5
        };
         const midEvidenceSpan: EvidenceSpan = {
            source: 'test',
            passage: 'Mid support.',
            score: 0.8
        };

        const result = computeVACS(midMeta, { ...mockCitationStats, supportRatio: 0.5 }, [midEvidenceSpan]);

        expect(result.vacs).toBeGreaterThanOrEqual(40);
        expect(result.vacs).toBeLessThan(75);
        expect(result.verdict).toBe('Inconclusive');
    });
});
