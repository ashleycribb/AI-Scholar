
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { findDoiForPaper } from "./crossrefService";
import type { ResearchPaper } from "../types";

// Mock global fetch
const originalFetch = global.fetch;

describe("findDoiForPaper", () => {
  beforeEach(() => {
    global.fetch = mock(() => Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({})
    } as Response));
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const createMockPaper = (overrides: Partial<ResearchPaper> = {}): ResearchPaper => ({
    id: "test-id",
    title: "Test Paper Title",
    authors: "Smith, John",
    year: 2023,
    abstract: "Test abstract",
    ...overrides,
  } as ResearchPaper);

  it("should return DOI from specific query when successful", async () => {
    const paper = createMockPaper();
    const expectedDoi = "10.1234/test.doi";

    // Mock fetch implementation
    (global.fetch as any).mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      // Check if it's the specific query (contains query.author)
      if (urlStr.includes("query.author")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            message: {
              items: [
                {
                  DOI: expectedDoi,
                  title: ["Test Paper Title"],
                  author: [{ family: "Smith", given: "John" }]
                }
              ]
            }
          })
        } as Response);
      }
      return Promise.resolve({ ok: false, status: 404 } as Response);
    });

    const doi = await findDoiForPaper(paper);
    expect(doi).toBe(expectedDoi);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it("should fallback to broader search if specific query fails (no results)", async () => {
    const paper = createMockPaper();
    const expectedDoi = "10.5678/fallback.doi";

    (global.fetch as any).mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("query.author")) {
        // Specific query returns no items
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ message: { items: [] } })
        } as Response);
      }
      if (urlStr.includes("query.bibliographic")) {
        // Fallback query returns a match
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            message: {
              items: [
                {
                  DOI: expectedDoi,
                  title: ["Test Paper Title"],
                  author: [{ family: "Smith" }]
                }
              ]
            }
          })
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const doi = await findDoiForPaper(paper);
    expect(doi).toBe(expectedDoi);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should fallback to broader search if specific query result is low confidence", async () => {
    const paper = createMockPaper();
    const expectedDoi = "10.5678/fallback.doi";

    (global.fetch as any).mockImplementation((url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr.includes("query.author")) {
        // Specific query returns a mismatch
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            message: {
              items: [
                {
                  DOI: "10.000/wrong",
                  title: ["Different Title"],
                  author: [{ family: "Doe" }]
                }
              ]
            }
          })
        } as Response);
      }
      if (urlStr.includes("query.bibliographic")) {
        // Fallback query returns a match
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            message: {
              items: [
                {
                  DOI: expectedDoi,
                  title: ["Test Paper Title"],
                  author: [{ family: "Smith" }]
                }
              ]
            }
          })
        } as Response);
      }
      return Promise.resolve({ ok: false } as Response);
    });

    const doi = await findDoiForPaper(paper);
    expect(doi).toBe(expectedDoi);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should return null if both attempts fail", async () => {
    const paper = createMockPaper();

    (global.fetch as any).mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ message: { items: [] } })
      } as Response);
    });

    const doi = await findDoiForPaper(paper);
    expect(doi).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("should handle API errors gracefully (throw Error)", async () => {
    const paper = createMockPaper();

    (global.fetch as any).mockImplementation(() => {
      return Promise.reject(new Error("Network Error"));
    });

    // Expect the promise to reject with the specific error message
    // Note: implementation catches error and rethrows new Error("Failed to communicate with Crossref API to find DOI.")
    try {
      await findDoiForPaper(paper);
      expect(true).toBe(false); // Fail if no error thrown
    } catch (e) {
      expect((e as Error).message).toBe("Failed to communicate with Crossref API to find DOI.");
    }
  });

  it("should handle specific query failure (e.g. 500 error) by trying fallback", async () => {
      const paper = createMockPaper();
      const expectedDoi = "10.5678/fallback.doi";

      (global.fetch as any).mockImplementation((url: string | URL) => {
        const urlStr = url.toString();
        if (urlStr.includes("query.author")) {
          return Promise.resolve({ ok: false, status: 500 } as Response);
        }
        if (urlStr.includes("query.bibliographic")) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              message: {
                items: [
                  {
                    DOI: expectedDoi,
                    title: ["Test Paper Title"],
                    author: [{ family: "Smith" }]
                  }
                ]
              }
            })
          } as Response);
        }
        return Promise.resolve({ ok: false } as Response);
      });

      const doi = await findDoiForPaper(paper);
      expect(doi).toBe(expectedDoi);
      expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
