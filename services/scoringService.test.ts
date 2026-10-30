import { expect, test, describe } from "bun:test";
import { computeVACS } from "./scoringService";
import { WEIGHTS, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";
import type { Metadata, CitationStats, EvidenceSpan, VerificationResult } from "../types";

// Mock data helper
const createMetadata = (overrides: Partial<Metadata> = {}): Metadata => ({
  doi: "10.1234/test",
  title: "Test Paper",
  credibilityScore: 0.8,
  reproducibilityScore: 0.6,
  temporalScore: 0.9,
  isRetracted: false,
  ...overrides,
});

const createCitationStats = (overrides: Partial<CitationStats> = {}): CitationStats => ({
  total: 100,
  supportCount: 80,
  contradictCount: 10,
  supportRatio: 0.8,
  ...overrides,
});

const createEvidenceSpans = (count: number, score: number = 0.9): EvidenceSpan[] => {
  return Array(count).fill(null).map((_, i) => ({
    source: "DOI",
    passage: `Passage ${i}`,
    score,
  }));
};

describe("computeVACS", () => {
  test("calculates score correctly with high inputs", () => {
    const meta = createMetadata({ credibilityScore: 1, reproducibilityScore: 1, temporalScore: 1 });
    const stats = createCitationStats({ supportRatio: 1 });
    const evidence = createEvidenceSpans(3, 1.0); // score 1.0 > MIN_SUPPORT_EVIDENCE_CONFIDENCE (0.75)

    const result = computeVACS(meta, stats, evidence);

    // Expected:
    // C=1, E=1, R=1, I=1, T=1
    // Total = 0.25*1 + 0.30*1 + 0.20*1 + 0.15*1 + 0.10*1 = 1.0
    // VACS = 100
    expect(result.vacs).toBe(100);
    expect(result.breakdown.credibility).toBe(1);
    expect(result.breakdown.evidence).toBe(1);
    expect(result.breakdown.reproducibility).toBe(1);
    expect(result.breakdown.citations).toBe(1);
    expect(result.breakdown.temporal).toBe(1);
    expect(result.verdict).toBe("Verified"); // > 75 and E > 0
  });

  test("calculates score correctly with mixed inputs", () => {
    // C=0.5, R=0.5, T=0.5
    // I=0.5
    // E=0.8 (valid since > 0.75)
    const meta = createMetadata({ credibilityScore: 0.5, reproducibilityScore: 0.5, temporalScore: 0.5 });
    const stats = createCitationStats({ supportRatio: 0.5 });
    const evidence = createEvidenceSpans(1, 0.8);

    const result = computeVACS(meta, stats, evidence);

    // Total = 0.25*0.5 + 0.30*0.8 + 0.20*0.5 + 0.15*0.5 + 0.10*0.5
    //       = 0.125 + 0.24 + 0.1 + 0.075 + 0.05
    //       = 0.59
    // VACS = 59
    expect(result.vacs).toBe(59);
    expect(result.breakdown.evidence).toBe(0.8);
    expect(result.verdict).toBe("Inconclusive"); // 40 <= 59 < 75
  });

  test("evidence score is 0 if below threshold", () => {
    const meta = createMetadata();
    const stats = createCitationStats();
    // Evidence score 0.6 < 0.75
    const evidence = createEvidenceSpans(1, 0.6);

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.evidence).toBe(0);
    // Verdict logic checks E_valid > 0 for Verified. Here E_valid is 0.
    expect(result.verdict).not.toBe("Verified");
  });

  test("handles retracted papers", () => {
    const meta = createMetadata({ isRetracted: true, credibilityScore: 1 });
    const stats = createCitationStats({ supportRatio: 1 });
    const evidence = createEvidenceSpans(1, 1.0);

    const result = computeVACS(meta, stats, evidence);

    // VACS calculation proceeds, so it might be 100.
    // But verdict logic: if (vacs < 40 || meta.isRetracted) -> Questionable
    expect(result.verdict).toBe("Questionable");
    expect(result.rationale[0]).toContain("CRITICAL: This paper has been marked as retracted.");
  });

  test("handles empty evidence", () => {
    const meta = createMetadata();
    const stats = createCitationStats();
    const evidence: EvidenceSpan[] = [];

    const result = computeVACS(meta, stats, evidence);

    expect(result.breakdown.evidence).toBe(0);
  });

  test("handles missing metadata fields gracefully (defaults)", () => {
     // Passing undefined explicitly where possible or relying on partial type
     const meta = { doi: "123", title: "Test" } as Metadata;
     const stats = {} as CitationStats;
     const evidence: EvidenceSpan[] = [];

     const result = computeVACS(meta, stats, evidence);

     // Defaults: C=0.5, R=0, T=0.5, I=0.5 (from stats default in code is 0.5)
     // Wait, check code: const I = Math.max(0, Math.min(1, citationStats.supportRatio ?? 0.5));
     // So I=0.5

     // E=0
     // Total = 0.25*0.5 + 0 + 0.20*0 + 0.15*0.5 + 0.10*0.5
     //       = 0.125 + 0 + 0 + 0.075 + 0.05 = 0.25
     // VACS = 25

     expect(result.vacs).toBe(25);
     expect(result.verdict).toBe("Questionable"); // < 40
  });

  test("verdict is Verified if criteria met", () => {
     // Need E_valid > 0 and vacs >= 75
     const meta = createMetadata({ credibilityScore: 0.8, reproducibilityScore: 0.8, temporalScore: 0.8 });
     const stats = createCitationStats({ supportRatio: 0.8 });
     const evidence = createEvidenceSpans(1, 0.8); // > 0.75

     // Total = 0.25*0.8 + 0.30*0.8 + 0.20*0.8 + 0.15*0.8 + 0.10*0.8 = 0.8
     // VACS = 80

     const result = computeVACS(meta, stats, evidence);
     expect(result.vacs).toBe(80);
     expect(result.verdict).toBe("Verified");
  });

   test("verdict is Questionable if vacs < 40", () => {
     const meta = createMetadata({ credibilityScore: 0.2, reproducibilityScore: 0, temporalScore: 0.2 });
     const stats = createCitationStats({ supportRatio: 0 });
     const evidence = createEvidenceSpans(0); // E=0

     // Total = 0.25*0.2 + 0 + 0 + 0 + 0.10*0.2 = 0.05 + 0.02 = 0.07
     // VACS = 7

     const result = computeVACS(meta, stats, evidence);
     expect(result.vacs).toBe(7);
     expect(result.verdict).toBe("Questionable");
  });
});
