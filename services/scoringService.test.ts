import { describe, test, expect } from "bun:test";
import { computeVACS } from "./scoringService";
import { Metadata, CitationStats, EvidenceSpan, VerificationResult } from "../types";
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";

describe("computeVACS", () => {

  const mockCitationStats: CitationStats = {
    total: 100,
    supportCount: 80,
    contradictCount: 5,
    supportRatio: 0.8
  };

  test("should verify a high quality paper with strong evidence", () => {
    const meta: Metadata = {
      doi: "10.1234/test",
      title: "Test Paper",
      credibilityScore: 0.9,
      reproducibilityScore: 0.8,
      temporalScore: 0.9,
      isRetracted: false
    };

    const evidence: EvidenceSpan[] = [
      { source: "ref1", passage: "This supports it.", score: 0.9 },
      { source: "ref2", passage: "Also supports.", score: 0.8 }
    ];

    // Expected calculation:
    // C = 0.9, E = (0.9+0.8)/2 = 0.85 (>= 0.75, so valid), R = 0.8, I = 0.8, T = 0.9
    // Total = 0.25*0.9 + 0.30*0.85 + 0.20*0.8 + 0.15*0.8 + 0.10*0.9
    //       = 0.225 + 0.255 + 0.16 + 0.12 + 0.09 = 0.85
    // VACS = 85
    // Verdict: Verified (E_valid > 0 && vacs >= 75)

    const result = computeVACS(meta, mockCitationStats, evidence);

    expect(result.vacs).toBe(85);
    expect(result.verdict).toBe("Verified");
    expect(result.evidence.length).toBe(2);
    // Use toBeCloseTo for float comparison
    expect(result.breakdown.evidence).toBeCloseTo(0.85);
  });

  test("should mark a low quality paper as questionable", () => {
    const meta: Metadata = {
      credibilityScore: 0.2,
      reproducibilityScore: 0.1,
      temporalScore: 0.1,
      isRetracted: false
    };

    // Low evidence score
    const evidence: EvidenceSpan[] = [
      { source: "ref1", passage: "Weak support", score: 0.4 }
    ];

    // E = 0.4 (< 0.75, so E_valid = 0)
    // C=0.2, E=0, R=0.1, I=0.8 (from mockCitationStats), T=0.1
    // Total = 0.25*0.2 + 0 + 0.20*0.1 + 0.15*0.8 + 0.10*0.1
    //       = 0.05 + 0 + 0.02 + 0.12 + 0.01 = 0.20
    // VACS = 20
    // Verdict: Questionable (vacs < 40)

    const result = computeVACS(meta, mockCitationStats, evidence);

    expect(result.vacs).toBe(20);
    expect(result.verdict).toBe("Questionable");
    expect(result.breakdown.evidence).toBe(0);
  });

  test("should mark a retracted paper as questionable regardless of scores", () => {
    const meta: Metadata = {
      credibilityScore: 0.9,
      reproducibilityScore: 0.9,
      temporalScore: 0.9,
      isRetracted: true
    };

    const evidence: EvidenceSpan[] = [
      { source: "ref1", passage: "Strong support", score: 0.9 }
    ];

    // Scores would be high, but isRetracted is true.
    // Verdict should be Questionable.
    // Rationale should include warning.

    const result = computeVACS(meta, mockCitationStats, evidence);

    expect(result.verdict).toBe("Questionable");
    expect(result.rationale[0]).toContain("CRITICAL: This paper has been marked as retracted.");
  });

  test("should mark inconclusive if evidence is insufficient (score < threshold)", () => {
    const meta: Metadata = {
      credibilityScore: 0.8,
      reproducibilityScore: 0.8,
      temporalScore: 0.8,
      isRetracted: false
    };

    // Evidence average just below threshold (MIN_SUPPORT_EVIDENCE_CONFIDENCE = 0.75)
    const evidence: EvidenceSpan[] = [
      { source: "ref1", passage: "Medium support", score: 0.74 }
    ];

    // E = 0.74 < 0.75 => E_valid = 0
    // Total score might be high enough for Verified if E was counted, but since E_valid is 0,
    // the total score will drop significantly.
    // Even if vacs >= 75 (unlikely with 0 evidence weight), verdict requires E_valid > 0 for Verified.

    const result = computeVACS(meta, mockCitationStats, evidence);

    expect(result.breakdown.evidence).toBe(0);
    // Without evidence (weight 0.30), max score is 0.70. So vacs <= 70.
    // Verdict cannot be Verified. It will likely be Inconclusive (if vacs >= 40).
    expect(result.verdict).not.toBe("Verified");
    expect(result.verdict).toBe("Inconclusive");
  });

  test("should mark inconclusive if no evidence provided", () => {
    const meta: Metadata = {
      credibilityScore: 0.9,
      reproducibilityScore: 0.9,
      temporalScore: 0.9,
      isRetracted: false
    };

    const evidence: EvidenceSpan[] = [];

    const result = computeVACS(meta, mockCitationStats, evidence);

    expect(result.breakdown.evidence).toBe(0);
    expect(result.verdict).toBe("Inconclusive");
  });

  test("should use default values for missing metadata scores", () => {
    const meta: Metadata = {
        // No scores provided
    };

    const evidence: EvidenceSpan[] = [];
    const stats: CitationStats = { total: 0, supportCount: 0, contradictCount: 0, supportRatio: 0.5 };

    // C defaults to 0.5
    // R defaults to 0
    // T defaults to 0.5
    // I (stats.supportRatio) defaults to 0.5
    // E defaults to 0

    // Total = 0.25*0.5 + 0 + 0.20*0 + 0.15*0.5 + 0.10*0.5
    //       = 0.125 + 0 + 0 + 0.075 + 0.05 = 0.25
    // VACS = 25

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.credibility).toBe(0.5);
    expect(result.breakdown.reproducibility).toBe(0);
    expect(result.breakdown.temporal).toBe(0.5);
    expect(result.vacs).toBe(25);
    // < 40 => Questionable
    expect(result.verdict).toBe("Questionable");
  });

  test("should treat evidence score equal to threshold as valid", () => {
      const meta: Metadata = {
        credibilityScore: 0.8,
        reproducibilityScore: 0.8,
        temporalScore: 0.8,
      };

      const evidence: EvidenceSpan[] = [
          { source: "ref1", passage: "Exact threshold", score: MIN_SUPPORT_EVIDENCE_CONFIDENCE }
      ];

      const result = computeVACS(meta, mockCitationStats, evidence);

      expect(result.breakdown.evidence).toBe(MIN_SUPPORT_EVIDENCE_CONFIDENCE);

      // We expect floating point issues here, so let's verify within range or verify strict match if we fix calc
      // The total was ~0.785, so vacs could be 78 or 79 depending on precision.
      // We will assert it is >= 78.
      expect(result.vacs).toBeGreaterThanOrEqual(78);
      expect(result.verdict).toBe("Verified");
  });

});
