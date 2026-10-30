import { describe, it, expect, mock, beforeEach, afterEach, spyOn } from "bun:test";
import { searchOpenAlex } from "./openalexService";
import type { AdvancedSearchOptions } from "../types";

// Mock global fetch
const originalFetch = global.fetch;

describe("searchOpenAlex", () => {
    let fetchMock: any;

    beforeEach(() => {
        fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify({
            results: [],
            meta: { count: 0 }
        }))));
        global.fetch = fetchMock;
    });

    afterEach(() => {
        global.fetch = originalFetch;
        mock.restore();
    });

    const defaultOptions: AdvancedSearchOptions = {
        startYear: "",
        endYear: "",
        authors: "",
        excludeKeywords: "",
        inclusionCriteria: "",
        exclusionCriteria: "",
        studyDesign: "",
        journal: "",
        minCitations: "",
    };

    describe("Query Construction", () => {
        it("should construct correct URL with basic query", async () => {
            await searchOpenAlex("climate change", defaultOptions);

            expect(fetchMock).toHaveBeenCalled();
            const url = new URL(fetchMock.mock.calls[0][0]);
            expect(url.pathname).toBe("/works");
            expect(url.searchParams.get("search")).toBe("climate change");
            expect(url.searchParams.get("mailto")).toBe("contact@ai-research-explorer.com");
        });

        it("should include year filters", async () => {
            const options = { ...defaultOptions, startYear: "2020", endYear: "2023" };
            await searchOpenAlex("test", options);

            const url = new URL(fetchMock.mock.calls[0][0]);
            const filter = url.searchParams.get("filter");
            expect(filter).toContain("publication_year:2020-2023");
        });

        it("should include author filters", async () => {
            const options = { ...defaultOptions, authors: "John Doe" };
            await searchOpenAlex("test", options);

            const url = new URL(fetchMock.mock.calls[0][0]);
            const filter = url.searchParams.get("filter");
            expect(filter).toContain("authorships.author.display_name.search:John Doe");
        });

        it("should include journal filters", async () => {
            const options = { ...defaultOptions, journal: "Nature" };
            await searchOpenAlex("test", options);

            const url = new URL(fetchMock.mock.calls[0][0]);
            const filter = url.searchParams.get("filter");
            expect(filter).toContain("host_venue.display_name.search:Nature");
        });

        it("should include min citations filter", async () => {
            const options = { ...defaultOptions, minCitations: "10" };
            await searchOpenAlex("test", options);

            const url = new URL(fetchMock.mock.calls[0][0]);
            const filter = url.searchParams.get("filter");
            expect(filter).toContain("cited_by_count:>10");
        });

        it("should combine multiple filters correctly", async () => {
            const options = {
                ...defaultOptions,
                startYear: "2022",
                journal: "Science"
            };
            await searchOpenAlex("test", options);

            const url = new URL(fetchMock.mock.calls[0][0]);
            const filter = url.searchParams.get("filter");
            // Check that both filters are present and comma-separated
            expect(filter).toContain("publication_year:2022-");
            expect(filter).toContain("host_venue.display_name.search:Science");
            // The order might depend on implementation, but they should be joined by comma
             // "publication_year:2022-,host_venue.display_name.search:Science"
        });
    });

    describe("Response Parsing", () => {
        it("should correctly parse and map response to ResearchPaper objects", async () => {
            const mockResponse = {
                results: [
                    {
                        id: "https://openalex.org/W123",
                        display_name: "Test Paper Title",
                        publication_year: 2023,
                        authorships: [
                            { author: { display_name: "Author One" } },
                            { author: { display_name: "Author Two" } }
                        ],
                        abstract_inverted_index: {
                            "This": [0], "is": [1, 6], "a": [2], "long": [3], "abstract": [4], "that": [5], "definitely": [7], "longer": [8], "than": [9], "fifty": [10], "characters": [11], "so": [12], "it": [13], "passes": [14], "the": [15], "validation.": [16]
                        },
                        doi: "https://doi.org/10.1234/test",
                        cited_by_count: 42,
                        host_venue: { display_name: "Test Journal" },
                        primary_location: { pdf_url: "https://example.com/paper.pdf" }
                    }
                ],
                meta: { count: 1 }
            };

            fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(mockResponse))));
            global.fetch = fetchMock;

            const { papers } = await searchOpenAlex("parse-test", defaultOptions);

            expect(papers).toHaveLength(1);
            const paper = papers[0];

            expect(paper.title).toBe("Test Paper Title");
            expect(paper.year).toBe(2023);
            expect(paper.authors).toBe("Author One, Author Two");
            expect(paper.abstract).toBe("This is a long abstract that is definitely longer than fifty characters so it passes the validation.");
            expect(paper.citations).toBe(42);
            expect(paper.journal).toBe("Test Journal");
            expect(paper.pdfURL).toBe("https://example.com/paper.pdf");
            expect(paper.doi).toBe("10.1234/test");
            expect(paper.id).toStartWith("doi:10.1234/test");
        });

        it("should handle missing abstract", async () => {
             const mockResponse = {
                results: [
                    {
                        id: "https://openalex.org/W456",
                        display_name: "Paper without Abstract",
                        publication_year: 2022,
                         authorships: [],
                        // No abstract_inverted_index
                    }
                ],
                meta: { count: 1 }
            };

            fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(mockResponse))));
            global.fetch = fetchMock;

             const { papers } = await searchOpenAlex("missing-abstract-test", defaultOptions);
             // Should be filtered out because abstract is missing or too short
             expect(papers).toHaveLength(0);
        });

         it("should handle short abstract", async () => {
             const mockResponse = {
                results: [
                    {
                        id: "https://openalex.org/W789",
                        display_name: "Paper with Short Abstract",
                        publication_year: 2022,
                         authorships: [],
                         abstract_inverted_index: { "Short": [0], "abstract.": [1] }
                    }
                ],
                meta: { count: 1 }
            };

            fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(mockResponse))));
            global.fetch = fetchMock;

             const { papers } = await searchOpenAlex("short-abstract-test", defaultOptions);
             // Should be filtered out because abstract length < 50
             expect(papers).toHaveLength(0);
        });
    });

    describe("Caching", () => {
         it("should cache results and return from cache on subsequent identical calls", async () => {
            const mockResponse = {
                results: [],
                meta: { count: 0 }
            };
            fetchMock = mock(() => Promise.resolve(new Response(JSON.stringify(mockResponse))));
            global.fetch = fetchMock;

            // First call
            await searchOpenAlex("cache-query", defaultOptions);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            // Second call - should use cache
            await searchOpenAlex("cache-query", defaultOptions);
            expect(fetchMock).toHaveBeenCalledTimes(1);

             // Third call with different query - should fetch
            await searchOpenAlex("new-query", defaultOptions);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });
    });

    describe("Error Handling", () => {
        it("should throw error on API failure", async () => {
             fetchMock = mock(() => Promise.resolve(new Response("Internal Server Error", { status: 500, statusText: "Internal Server Error" })));
             global.fetch = fetchMock;

             await expect(searchOpenAlex("error-test", defaultOptions)).rejects.toThrow("Failed to fetch results from OpenAlex");
        });

        it("should throw error on network failure", async () => {
             fetchMock = mock(() => Promise.reject(new Error("Network Error")));
             global.fetch = fetchMock;

             await expect(searchOpenAlex("network-test", defaultOptions)).rejects.toThrow("Failed to fetch results from OpenAlex");
        });
    });
});
