import { describe, expect, test, mock, beforeEach } from "bun:test";
import { searchSemanticScholar } from "./semanticScholarService";

// Mock fetch globally
const originalFetch = global.fetch;

beforeEach(() => {
    global.fetch = mock();
});

describe("searchSemanticScholar", () => {
    test("fetches papers successfully", async () => {
        const mockResponse = {
            total: 100,
            offset: 0,
            next: 10,
            data: [
                {
                    paperId: "12345",
                    title: "Test Paper",
                    abstract: "Test Abstract",
                    year: 2023,
                    authors: [{ name: "Author One" }, { name: "Author Two" }],
                    citationCount: 10,
                    url: "http://example.com/paper",
                    venue: "Test Venue",
                    externalIds: { DOI: "10.1234/test" }
                }
            ]
        };

        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        const result = await searchSemanticScholar("test query", {} as any, 1);

        expect(result.papers.length).toBe(1);
        expect(result.papers[0].title).toBe("Test Paper");
        expect(result.papers[0].authors).toBe("Author One, Author Two");
        expect(result.papers[0].doi).toBe("10.1234/test");
        expect(result.hasMore).toBe(true);
    });

    test("handles API errors gracefully", async () => {
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ message: "Internal Server Error" })
        });

        const result = await searchSemanticScholar("fail", {} as any, 1);
        expect(result.papers).toEqual([]);
        expect(result.hasMore).toBe(false);
    });
});
