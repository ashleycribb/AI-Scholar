import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { fetchMetadataByDOI } from "./metadataService";

describe("fetchMetadataByDOI", () => {
  const originalFetch = global.fetch;
  const originalConsoleError = console.error;

  beforeEach(() => {
    // Suppress console.error during tests to keep output clean
    console.error = mock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    console.error = originalConsoleError;
  });

  it("should successfully fetch and transform metadata", async () => {
    const mockResponse = {
      title: "Test Paper",
      authorships: [
        { author: { display_name: "Author One" } },
        { author: { display_name: "Author Two" } }
      ],
      host_venue: { display_name: "Test Journal" },
      publication_year: 2023,
      cited_by_count: 10,
      is_retracted: false,
      open_access: { is_oa: true }
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    const result = await fetchMetadataByDOI("10.1234/test");

    // Verify correct URL construction with encoding
    expect(global.fetch).toHaveBeenCalledWith("https://api.openalex.org/works/https://doi.org/10.1234%2Ftest");
    expect(result.doi).toBe("10.1234/test");
    expect(result.title).toBe("Test Paper");
    expect(result.authors).toEqual(["Author One", "Author Two"]);
    expect(result.journal).toBe("Test Journal");
    expect(result.year).toBe(2023);
    expect(result.citations).toBe(10);
    expect(result.isRetracted).toBe(false);
    expect(result.isOpenAccess).toBe(true);
    // temporalScore and credibilityScore are calculated, we can check if they are numbers
    expect(typeof result.temporalScore).toBe("number");
    expect(typeof result.credibilityScore).toBe("number");
    expect(result.reproducibilityScore).toBe(0.5);
  });

  it("should handle missing optional fields gracefully", async () => {
    const mockResponse = {
      title: "Minimal Paper",
      // Missing optional fields
    };

    global.fetch = mock(() =>
      Promise.resolve(new Response(JSON.stringify(mockResponse), { status: 200 }))
    );

    const result = await fetchMetadataByDOI("10.1234/minimal");

    expect(result.title).toBe("Minimal Paper");
    expect(result.authors).toBeUndefined();
    expect(result.journal).toBeUndefined();
    expect(result.year).toBeUndefined();
    expect(result.citations).toBeUndefined();
    expect(result.isRetracted).toBeUndefined();
    expect(result.isOpenAccess).toBeUndefined();

    // Check default scores when data is missing
    expect(result.temporalScore).toBe(0.5); // Default for missing year
    expect(result.credibilityScore).toBe(0.2); // Default for missing/zero citations
  });

  it("should handle API errors (non-200 status)", async () => {
    global.fetch = mock(() =>
      Promise.resolve(new Response("Not Found", { status: 404 }))
    );

    await expect(fetchMetadataByDOI("10.1234/missing")).rejects.toThrow("Could not retrieve metadata for DOI: 10.1234/missing.");
  });

  it("should handle network errors", async () => {
    global.fetch = mock(() => Promise.reject(new Error("Network Error")));

    await expect(fetchMetadataByDOI("10.1234/network-error")).rejects.toThrow("Could not retrieve metadata for DOI: 10.1234/network-error.");
  });
});
