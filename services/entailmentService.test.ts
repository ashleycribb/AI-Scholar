import { describe, test, expect } from "bun:test";
import { checkEntailment } from "./entailmentService";

describe("entailmentService", () => {
    test("checkEntailment - high overlap should return SUPPORT", async () => {
        // Words > 3 chars: "quick", "brown", "jumps", "over", "lazy"
        const claim = "The quick brown fox jumps over the lazy dog";
        const passage = "The quick brown fox jumps over the lazy dog";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("SUPPORT");
        expect(result.confidence).toBeGreaterThan(0.85); // 100% match -> 0.85 + (1.0 - 0.5)*0.2 = 0.95
    });

    test("checkEntailment - partial overlap (NEI)", async () => {
        // Claim keywords: "apple", "banana", "cherry", "date" (4 words)
        // Passage has only "apple"
        // Match: 1/4 = 0.25 <= 0.5 -> NEI
        const claim = "apple banana cherry date";
        const passage = "apple";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("NEI");
        expect(result.confidence).toBeCloseTo(0.6 + 0.25 * 0.2); // 0.65
    });

    test("checkEntailment - no overlap should return NEI", async () => {
        const claim = "Quantum mechanics";
        const passage = "Social studies";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("NEI");
        expect(result.confidence).toBe(0.6); // 0 matches
    });

    test("checkEntailment - case insensitivity", async () => {
        const claim = "QUICK BROWN FOX";
        const passage = "quick brown fox";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("SUPPORT");
    });

    test("checkEntailment - ignores punctuation", async () => {
        // "Hello" (5), "world" (5)
        const claim = "Hello, world!";
        const passage = "Hello world";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("SUPPORT");
    });

    test("checkEntailment - ignores short words (<= 3 chars)", async () => {
        // All words are <= 3 characters.
        // "The" (3), "cat" (3), "sat" (3), "on" (2), "the" (3), "mat" (3).
        // claimKeywords = []
        // matchRatio = 0
        const claim = "The cat sat on the mat";
        const passage = "The cat sat on the mat";
        const result = await checkEntailment(claim, passage);

        expect(result.verdict).toBe("NEI");
    });
});
