import { describe, expect, test, mock, beforeEach } from "bun:test";
import type { ResearchPaper, ModelDefinition, AdvancedSearchOptions } from "../types";

// Mock GoogleGenAI to avoid instantiation issues if imported transitively
mock.module("@google/genai", () => {
    return {
        GoogleGenAI: class {
            constructor() {}
            models = {
                embedContent: async () => ({ embedding: { values: [] } }),
                generateContent: async () => ({ text: "{}" })
            };
        },
        Type: {
            OBJECT: "object",
            STRING: "string",
            NUMBER: "number",
            BOOLEAN: "boolean",
            ARRAY: "array"
        }
    };
});

// Mock dependencies
mock.module("./embeddingService", () => ({
    calculateSemanticScores: async (query: string, papers: ResearchPaper[]) => {
        return papers.map(p => ({ ...p, semanticScore: 80 }));
    }
}));

mock.module("../utils/embeddings", () => ({
    batchEmbedText: async (texts: string[]) => {
        return texts.map(() => [0.1, 0.2, 0.3]);
    }
}));

mock.module("./geminiService", () => ({
    evaluateScreeningFit: async () => ({ score: 90, rationale: "Good fit" }),
    parseQueryToStructuredFilters: async () => ({}),
    generateHypotheticalAnswer: async () => "hypothetical",
    findPapersWithGoogleSearch: async () => [],
    generateSummaryForPapers: async () => "",
}));

// Mock openalexService and others used in apiService if needed,
// but calculatePaperScores mainly uses embeddingService and geminiService.
// However, apiService imports them at top level so they must be mockable or present.
mock.module("./openalexService", () => ({}));
mock.module("./arxivService", () => ({}));
mock.module("./unpaywallService", () => ({}));
mock.module("./crossrefService", () => ({}));
mock.module("./semanticScholarService", () => ({}));
mock.module("./validationService", () => ({}));

describe("calculatePaperScores", () => {
    let calculatePaperScores: any;

    beforeEach(async () => {
        // Dynamic import to ensure mocks are applied
        const module = await import("./apiService");
        calculatePaperScores = module.calculatePaperScores;
    });

    const mockModel: ModelDefinition = {
        id: "gemini-1.5-flash",
        name: "Gemini Flash",
        provider: "gemini"
    };

    const mockOptions: AdvancedSearchOptions = {
        startYear: "2020",
        endYear: "2024",
        authors: "",
        excludeKeywords: "",
        inclusionCriteria: "Must be about AI",
        exclusionCriteria: "",
        studyDesign: "any"
    };

    const mockPapers: ResearchPaper[] = [
        {
            id: "1",
            title: "Paper 1",
            authors: "Author A",
            year: 2023,
            abstract: "Abstract 1 about AI. This is a very long abstract to ensure it passes the length check of 50 characters. It talks about artificial intelligence.",
            citations: 10,
            sourceURL: "http://example.com/1"
        },
        {
            id: "2",
            title: "Paper 2",
            authors: "Author B",
            year: 2022,
            abstract: "Abstract 2 about ML. This is also a very long abstract to ensure it passes the length check of 50 characters. It talks about machine learning.",
            citations: 20,
            sourceURL: "http://example.com/2"
        }
    ];

    test("should calculate scores correctly", async () => {
        const result = await calculatePaperScores(mockPapers, "AI", "Hypothetical Abstract", mockModel, mockOptions);

        expect(result).toHaveLength(2);
        expect(result[0].combinedScore).toBeDefined();
        // Since we mocked semantic score to 80
        expect(result[0].semanticScore).toBe(80);
        // Since we mocked screening fit to 90
        expect(result[0].screeningFitScore).toBe(90);

        expect(result[0].impactScore).toBeDefined();

        // Sorting check
        expect(result[0].combinedScore).toBeGreaterThanOrEqual(result[1].combinedScore!);
    });

    test("should handle papers without abstracts gracefully", async () => {
        const noAbstractPaper: ResearchPaper = {
            id: "3",
            title: "Paper 3",
            authors: "Author C",
            year: 2021,
            abstract: "", // No abstract
            citations: 30,
            sourceURL: "http://example.com/3"
        };

        const papers = [...mockPapers, noAbstractPaper];
        const result = await calculatePaperScores(papers, "AI", "Hypothetical Abstract", mockModel, mockOptions);

        const paper3 = result.find(p => p.id === "3");
        expect(paper3).toBeDefined();
        // Should have impact score 0 because it has no abstract, so it's not in impactScoresMap.
        // This matches the original behavior where impact calculation depended on presence in papersWithAbstracts.
        expect(paper3!.impactScore).toBe(0);

        // Ensure others still have scores
        const paper1 = result.find(p => p.id === "1");
        // paper1 has abstract, so it should get a score.
        // Note: batchEmbedText mock returns dummy values so centrality is calculated.
        expect(paper1!.impactScore).toBeGreaterThan(0);
    });
});
