
import { describe, it, expect, mock, beforeAll } from "bun:test";
import type { ResearchPaper, ModelDefinition, AdvancedSearchOptions } from "../types";

// Mock dependencies
const mockCalculateSemanticScores = mock((query: string, papers: ResearchPaper[]) => {
    return Promise.resolve(papers.map(p => ({ ...p, semanticScore: 80 })));
});

const mockBatchEmbedText = mock((texts: string[]) => {
    return Promise.resolve(texts.map(() => Array(768).fill(0.1))); // Mock embeddings
});

const mockEvaluateScreeningFit = mock((paper: ResearchPaper, inclusion: string, exclusion: string, model: ModelDefinition) => {
    return Promise.resolve({ score: 90, rationale: "Good fit" });
});

// Mock modules BEFORE importing apiService
mock.module("./embeddingService", () => ({
    calculateSemanticScores: mockCalculateSemanticScores
}));

mock.module("../utils/embeddings", () => ({
    batchEmbedText: mockBatchEmbedText
}));

mock.module("./geminiService", () => ({
    evaluateScreeningFit: mockEvaluateScreeningFit
}));

// Also mock other services imported by apiService to avoid side effects or missing dependencies
mock.module("./validationService", () => ({}));
mock.module("./extensionService", () => ({ createPaperId: (p: any) => "mock-id" }));
mock.module("./unpaywallService", () => ({}));
mock.module("./openalexService", () => ({}));
mock.module("./arxivService", () => ({}));
mock.module("./crossrefService", () => ({}));
mock.module("./semanticScholarService", () => ({}));
mock.module("../utils/math", () => ({
    cosineSimilarity: () => 0.5
}));


describe("calculatePaperScores", () => {
    let calculatePaperScores: any;

    beforeAll(async () => {
        // Dynamic import to ensure mocks are applied
        const module = await import("./apiService");
        calculatePaperScores = module.calculatePaperScores;
    });

    const mockModel: ModelDefinition = {
        id: "gemini-pro",
        name: "Gemini Pro",
        provider: "gemini",
    };

    const mockOptions: AdvancedSearchOptions = {
        startYear: "",
        endYear: "",
        authors: "",
        excludeKeywords: "",
        inclusionCriteria: "",
        exclusionCriteria: "",
        studyDesign: "",
    };

    const mockPapers: ResearchPaper[] = [
        {
            id: "1",
            title: "Test Paper 1",
            authors: "Author A",
            year: 2023,
            abstract: "This is a test abstract that is long enough to be considered for impact scoring. It needs to be over 50 characters long.",
            citations: 10,
        },
        {
            id: "2",
            title: "Test Paper 2",
            authors: "Author B",
            year: 2020,
            abstract: "Another test abstract for the second paper. Also needs to be long enough.",
            citations: 50,
        },
    ];

    it("should calculate combined scores correctly", async () => {
        const result = await calculatePaperScores(mockPapers, "test query", "hypothetical answer", mockModel, mockOptions);

        expect(result.length).toBe(2);
        expect(result[0].combinedScore).toBeDefined();
        expect(result[1].combinedScore).toBeDefined();
        // Check if sorted descending by combinedScore
        expect(result[0].combinedScore!).toBeGreaterThanOrEqual(result[1].combinedScore!);
    });

    it("should handle screening criteria", async () => {
        const optionsWithScreening = { ...mockOptions, inclusionCriteria: "must cover AI" };
        const result = await calculatePaperScores(mockPapers, "test query", "hypothetical answer", mockModel, optionsWithScreening);

        expect(mockEvaluateScreeningFit).toHaveBeenCalled();
        expect(result[0].screeningFitScore).toBe(90);
    });

    it("should handle empty papers list", async () => {
        const result = await calculatePaperScores([], "test query", "hypothetical answer", mockModel, mockOptions);
        expect(result).toEqual([]);
    });
});
