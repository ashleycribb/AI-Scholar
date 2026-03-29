import { describe, expect, test } from "bun:test";
import { computeVACS } from "./scoringService";
import { Metadata, CitationStats, EvidenceSpan, VerificationResult } from "../types";
import { MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";

describe("computeVACS", () => {
  const dummyMeta: Metadata = {
    doi: "10.1234/test",
    title: "Test Paper",
    authors: ["Author A"],
    journal: "Journal of Testing",
    year: 2023,
    citations: 100,
    isRetracted: false,
    isOpenAccess: true,
    hasData: true,
    hasCode: true,
    credibilityScore: 0.8,
    reproducibilityScore: 0.8,
    temporalScore: 0.9
  };

  const dummyCitationStats: CitationStats = {
    total: 50,
    supportCount: 40,
    contradictCount: 5,
    supportRatio: 0.8
  };

  const strongEvidence: EvidenceSpan[] = [
    { source: "Ref1", passage: "Supporting text 1", score: 0.85 },
    { source: "Ref2", passage: "Supporting text 2", score: 0.90 }
  ];

  test("should classify high-quality paper as Verified", () => {
    const result = computeVACS(dummyMeta, dummyCitationStats, strongEvidence);
    expect(result.verdict).toBe("Verified");
    expect(result.vacs).toBeGreaterThanOrEqual(75);
    expect(result.evidence.length).toBeGreaterThan(0);
  });

  test("should classify low-quality paper as Questionable", () => {
    const lowQualityMeta: Metadata = {
      ...dummyMeta,
      credibilityScore: 0.2,
      reproducibilityScore: 0.1,
      temporalScore: 0.1
    };
    const lowQualityStats: CitationStats = {
      ...dummyCitationStats,
      supportRatio: 0.1
    };
    // Even with some evidence, if the overall score is low (<40), it should be Questionable.
    // However, if evidence is valid (>0.75), it contributes significantly (0.30 weight).
    // Let's ensure the total score is < 40.
    // C=0.2, R=0.1, I=0.1, T=0.1. E_valid=0 (no evidence provided here or weak evidence).
    const weakEvidence: EvidenceSpan[] = [
        { source: "Ref1", passage: "Weak text", score: 0.4 }
    ];

    const result = computeVACS(lowQualityMeta, lowQualityStats, weakEvidence);

    // E_valid will be 0 because 0.4 < 0.75.
    // Total = 0.25*0.2 + 0.30*0 + 0.20*0.1 + 0.15*0.1 + 0.10*0.1
    // Total = 0.05 + 0 + 0.02 + 0.015 + 0.01 = 0.095 -> 9.5 -> 10
    expect(result.vacs).toBeLessThan(40);
    expect(result.verdict).toBe("Questionable");
  });

  test("should classify retracted paper as Questionable regardless of score", () => {
    const retractedMeta: Metadata = {
      ...dummyMeta,
      isRetracted: true
    };
    // Even with high scores otherwise
    const result = computeVACS(retractedMeta, dummyCitationStats, strongEvidence);
    expect(result.verdict).toBe("Questionable");
    expect(result.rationale[0]).toContain("CRITICAL: This paper has been marked as retracted.");
  });

  test("should classify paper as Inconclusive if evidence is insufficient (average < threshold)", () => {
    const weakEvidence: EvidenceSpan[] = [
      { source: "Ref1", passage: "Maybe supporting", score: 0.70 },
      { source: "Ref2", passage: "Possibly supporting", score: 0.74 }
    ];
    // Average is 0.72 < 0.75. So E_valid = 0.
    // With high other scores:
    // C=0.8, R=0.8, I=0.8, T=0.9
    // Total = 0.25*0.8 + 0 + 0.20*0.8 + 0.15*0.8 + 0.10*0.9
    // Total = 0.2 + 0 + 0.16 + 0.12 + 0.09 = 0.57 -> 57
    // Verdict rules: Verified if E_valid > 0 && vacs >= 75. Here E_valid=0.
    // Questionable if vacs < 40. Here vacs=57.
    // So default is Inconclusive.

    const result = computeVACS(dummyMeta, dummyCitationStats, weakEvidence);
    expect(result.breakdown.evidence).toBe(0);
    expect(result.verdict).toBe("Inconclusive");
  });

  test("should classify paper as Inconclusive if no evidence is provided", () => {
    const result = computeVACS(dummyMeta, dummyCitationStats, []);
    expect(result.breakdown.evidence).toBe(0);
    // Similar score to above (57), so Inconclusive.
    expect(result.verdict).toBe("Inconclusive");
  });

  test("should use evidence score if it meets the threshold exactly", () => {
    const thresholdEvidence: EvidenceSpan[] = [
        { source: "Ref1", passage: "Exact threshold", score: MIN_SUPPORT_EVIDENCE_CONFIDENCE }
    ];
    const result = computeVACS(dummyMeta, dummyCitationStats, thresholdEvidence);
    expect(result.breakdown.evidence).toBe(MIN_SUPPORT_EVIDENCE_CONFIDENCE);
    // If total score >= 75, it should be Verified.
    // C=0.8, E=0.75, R=0.8, I=0.8, T=0.9
    // Total = 0.2 + 0.3*0.75 + 0.16 + 0.12 + 0.09
    // Total = 0.2 + 0.225 + 0.16 + 0.12 + 0.09 = 0.795 -> 80
    expect(result.verdict).toBe("Verified");
  });

  test("should use default values when metadata scores are missing", () => {
    const minimalMeta: Metadata = {
        doi: "10.0000/missing",
        // missing scores
    };
    // Expected defaults: C=0.5, R=0, T=0.5
    // I (citations) comes from citationStats.supportRatio, default 0.5 if missing (but here we pass 0.8)
    // Actually let's test missing supportRatio too.
    const minimalStats: CitationStats = {
        total: 0,
        supportCount: 0,
        contradictCount: 0,
        supportRatio: undefined as any // Force undefined to test default
    };

    const result = computeVACS(minimalMeta, minimalStats, []);

    expect(result.breakdown.credibility).toBe(0.5);
    expect(result.breakdown.reproducibility).toBe(0);
    expect(result.breakdown.temporal).toBe(0.5);
    expect(result.breakdown.citations).toBe(0.5); // Default for supportRatio
  });

  test("should clamp support ratio to [0, 1]", () => {
      const highRatioStats: CitationStats = { ...dummyCitationStats, supportRatio: 1.5 };
      const lowRatioStats: CitationStats = { ...dummyCitationStats, supportRatio: -0.5 };

      const resHigh = computeVACS(dummyMeta, highRatioStats, []);
      expect(resHigh.breakdown.citations).toBe(1);

      const resLow = computeVACS(dummyMeta, lowRatioStats, []);
      expect(resLow.breakdown.citations).toBe(0);
  });
});
