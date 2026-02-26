
import { describe, test, expect } from "bun:test";
import { limitConcurrency } from "../../utils/concurrency";
import { validatePapersWithLimit } from "../../services/apiService";
import type { ResearchPaper, ValidationResult } from "../../types";

// Simple test to ensure limitConcurrency is working correctly
describe("Concurrency Utils", () => {
    test("limitConcurrency respects concurrency limit", async () => {
        const items = Array.from({ length: 10 }, (_, i) => i);
        const limit = 3;
        let active = 0;
        let maxActive = 0;

        const results = await limitConcurrency(items, limit, async (item) => {
            active++;
            maxActive = Math.max(maxActive, active);
            // Simulate work
            await new Promise((resolve) => setTimeout(resolve, 50));
            active--;
            return item * 2;
        });

        // The max active should be exactly the limit (or less if not enough items)
        expect(maxActive).toBeLessThanOrEqual(limit);
        // Ensure all results are correct and in order
        expect(results).toEqual(items.map((i) => i * 2));
    });

    test("limitConcurrency handles errors", async () => {
        const items = [1, 2, 3];
        let errorCaught = false;
        try {
            await limitConcurrency(items, 2, async (item) => {
                if (item === 2) throw new Error("Fail");
                return item;
            });
        } catch (e) {
            errorCaught = true;
        }
        expect(errorCaught).toBe(true);
    });
});

describe("validatePapersWithLimit", () => {
    test("respects concurrency limit for validation", async () => {
        // Mock papers
        const papers: ResearchPaper[] = Array.from({ length: 10 }, (_, i) => ({
            id: `p${i}`,
            title: `Paper ${i}`,
            authors: "Author",
            year: 2020,
            abstract: "Abstract",
            sourceURL: "http://example.com"
        }));

        const limit = 4;
        let active = 0;
        let maxActive = 0;

        // Mock validation function
        const validateFn = async (paper: ResearchPaper) => {
            active++;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 50));
            active--;
            return {
                validation: { status: 'validated', score: 100, checks: {
                    crossref_match: false,
                    title_match: false,
                    author_match: false,
                    open_access: false,
                    doaj_indexed: false,
                    source_enriched: false,
                    has_citations: false
                }, log: [] } as ValidationResult,
                updatedPaperData: {}
            };
        };

        const results = await validatePapersWithLimit(papers, validateFn, limit);

        expect(maxActive).toBeLessThanOrEqual(limit);
        expect(results.length).toBe(papers.length);
        expect(results[0].validation).toBeDefined();
    });
});
