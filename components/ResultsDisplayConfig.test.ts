import { expect, test, describe } from "bun:test";
import { sortOptions, hasRelevance, hasCitations, hasValidation, hasScreeningFit } from "./ResultsDisplayConfig";
import type { ResearchPaper } from "../types";

describe("ResultsDisplayConfig", () => {
    test("hasRelevance checks combinedScore", () => {
        const papers = [{ combinedScore: 10 }] as ResearchPaper[];
        expect(hasRelevance(papers)).toBe(true);
        expect(hasRelevance([])).toBe(false);
        expect(hasRelevance([{}] as ResearchPaper[])).toBe(false);
    });

    test("hasCitations checks citations", () => {
        const papers = [{ citations: 5 }] as ResearchPaper[];
        expect(hasCitations(papers)).toBe(true);
        expect(hasCitations([])).toBe(false);
        expect(hasCitations([{}] as ResearchPaper[])).toBe(false);
    });

    test("hasValidation checks validation", () => {
        // Mocking ValidationResult structure minimally as needed
        const papers = [{ validation: { score: 10 } }] as any as ResearchPaper[];
        expect(hasValidation(papers)).toBe(true);
        expect(hasValidation([])).toBe(false);
        expect(hasValidation([{}] as ResearchPaper[])).toBe(false);
    });

    test("hasScreeningFit checks screeningFitScore", () => {
        const papers = [{ screeningFitScore: 0.8 }] as ResearchPaper[];
        expect(hasScreeningFit(papers)).toBe(true);
        expect(hasScreeningFit([])).toBe(false);
        expect(hasScreeningFit([{}] as ResearchPaper[])).toBe(false);
    });

    test("sortOptions contains all expected options", () => {
        expect(sortOptions.length).toBe(5);
        expect(sortOptions.map(o => o.key)).toEqual(['relevance', 'year', 'citations', 'validationScore', 'screeningFitScore']);

        // Test Year availability (always true)
        const yearOption = sortOptions.find(o => o.key === 'year');
        expect(yearOption?.available([])).toBe(true);
    });
});
