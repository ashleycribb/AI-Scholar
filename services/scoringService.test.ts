import { describe, expect, test } from "bun:test";
import { computeVACS } from "./scoringService";
import { Metadata, CitationStats, EvidenceSpan } from "../types";
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";

describe("computeVACS", () => {
  // Helper to create mock metadata with defaults
  const createMetadata = (overrides: Partial<Metadata> = {}): Metadata => ({
    title: "Test Paper",
    doi: "10.1234/test",
    credibilityScore: 0.5,
    reproducibilityScore: 0.5,
    temporalScore: 0.5,
    isRetracted: false,
    ...overrides,
  });

  // Helper to create mock citation stats with defaults
  const createCitationStats = (overrides: Partial<CitationStats> = {}): CitationStats => ({
    total: 10,
    supportCount: 5,
    contradictCount: 1,
    supportRatio: 0.5,
    ...overrides,
  });

  // Helper to create mock evidence spans
  const createEvidenceSpans = (scores: number[]): EvidenceSpan[] =>
    scores.map((score) => ({
      source: "source",
      passage: "passage",
      score,
    }));

  test("Case 1: Verified Paper (High scores)", () => {
    const meta = createMetadata({
      credibilityScore: 0.9,
      reproducibilityScore: 0.8,
      temporalScore: 0.9,
    });
    const stats = createCitationStats({ supportRatio: 0.8 });
    const evidence = createEvidenceSpans([0.8, 0.9]); // Avg = 0.85 > 0.75

    const result = computeVACS(meta, stats, evidence);

    expect(result.vacs).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toBe("Verified");
    expect(result.breakdown.evidence).toBeCloseTo(0.85);
  });

  test("Case 2: Questionable Paper (Low scores)", () => {
    const meta = createMetadata({
      credibilityScore: 0.1,
      reproducibilityScore: 0.1,
      temporalScore: 0.1,
    });
    const stats = createCitationStats({ supportRatio: 0.1 });
    const evidence = createEvidenceSpans([0.1, 0.2]); // Avg = 0.15

    const result = computeVACS(meta, stats, evidence);

    expect(result.vacs).toBeLessThan(40);
    expect(result.verdict).toBe("Questionable");
    expect(result.breakdown.evidence).toBe(0); // Valid evidence should be 0 because avg < 0.75
  });

  test("Case 3: Retracted Paper (Should be Questionable regardless of scores)", () => {
    const meta = createMetadata({
      credibilityScore: 0.9,
      reproducibilityScore: 0.9,
      temporalScore: 0.9,
      isRetracted: true,
    });
    const stats = createCitationStats({ supportRatio: 0.9 });
    const evidence = createEvidenceSpans([0.9]);

    const result = computeVACS(meta, stats, evidence);

    expect(result.verdict).toBe("Questionable");
    expect(result.rationale[0]).toContain("CRITICAL: This paper has been marked as retracted.");
  });

  test("Case 4: Inconclusive (Insufficient Evidence Confidence)", () => {
    const meta = createMetadata({
      credibilityScore: 0.9,
      reproducibilityScore: 0.9,
      temporalScore: 0.9,
    });
    const stats = createCitationStats({ supportRatio: 0.9 });
    const evidence = createEvidenceSpans([0.7, 0.7]); // Avg = 0.7 < 0.75

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.evidence).toBe(0);
    // Even with high other scores, if E_valid is 0, it shouldn't be verified.
    expect(result.verdict).not.toBe("Verified");
    // Should be inconclusive unless total score drops below 40 (which it shouldn't with high other scores)
    expect(result.verdict).toBe("Inconclusive");
  });

  test("Case 5: Inconclusive (No Evidence)", () => {
    const meta = createMetadata({
      credibilityScore: 0.9,
      reproducibilityScore: 0.9,
      temporalScore: 0.9,
    });
    const stats = createCitationStats({ supportRatio: 0.9 });
    const evidence: EvidenceSpan[] = [];

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.evidence).toBe(0);
    expect(result.verdict).toBe("Inconclusive");
  });

  test("Case 6: Boundary Condition (Evidence Avg = 0.75)", () => {
    const meta = createMetadata({
      credibilityScore: 0.9,
      reproducibilityScore: 0.8,
      temporalScore: 0.9,
    });
    const stats = createCitationStats({ supportRatio: 0.8 });
    const evidence = createEvidenceSpans([0.75]); // Avg = 0.75

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.evidence).toBe(0.75);
    expect(result.verdict).toBe("Verified");
  });

  test("Case 7: Defaults (Missing Metadata)", () => {
    // Provide minimal metadata
    const meta: Metadata = {
        title: "Default Paper",
    };
    const stats: CitationStats = {
        total: 0,
        supportCount: 0,
        contradictCount: 0,
        supportRatio: 0.5 // Default usually handled by service logic?
        // Actually computeVACS handles supportRatio ?? 0.5
    };
    // Let's pass undefined/nullish for stats.supportRatio
    const result = computeVACS(
        meta,
        { ...stats, supportRatio: undefined as any },
        []
    );

    // Expected defaults from code:
    // C = meta.credibilityScore ?? 0.5 -> 0.5
    // R = meta.reproducibilityScore ?? 0 -> 0
    // T = meta.temporalScore ?? 0.5 -> 0.5
    // I = citationStats.supportRatio ?? 0.5 -> 0.5

    expect(result.breakdown.credibility).toBe(0.5);
    expect(result.breakdown.reproducibility).toBe(0);
    expect(result.breakdown.temporal).toBe(0.5);
    expect(result.breakdown.citations).toBe(0.5);
  });
});
