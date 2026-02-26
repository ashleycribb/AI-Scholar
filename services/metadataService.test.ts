import { describe, test, expect, spyOn, beforeEach, afterEach } from "bun:test";
import { fetchMetadataByDOI } from "./metadataService";
import type { Metadata } from "../types";

describe("fetchMetadataByDOI", () => {
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = spyOn(global, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const mockOpenAlexResponse = {
    id: "https://openalex.org/W2741809807",
    doi: "https://doi.org/10.1234/test.doi",
    title: "Test Paper Title",
    publication_year: 2023,
    cited_by_count: 15,
    is_retracted: false,
    host_venue: {
      display_name: "Journal of Testing",
    },
    authorships: [
      {
        author: {
          display_name: "Author One",
        },
      },
      {
        author: {
          display_name: "Author Two",
        },
      },
    ],
    open_access: {
      is_oa: true,
    },
  };

  test("successfully fetches and transforms metadata", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify(mockOpenAlexResponse), { status: 200 }));

    const doi = "10.1234/test.doi";
    const result = await fetchMetadataByDOI(doi);

    expect(fetchSpy).toHaveBeenCalledWith(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);

    expect(result.doi).toBe(doi);
    expect(result.title).toBe("Test Paper Title");
    expect(result.year).toBe(2023);
    expect(result.citations).toBe(15);
    expect(result.isRetracted).toBe(false);
    expect(result.journal).toBe("Journal of Testing");
    expect(result.authors).toEqual(["Author One", "Author Two"]);
    expect(result.isOpenAccess).toBe(true);

    // Check calculated scores
    expect(result.temporalScore).toBeDefined();
    expect(result.credibilityScore).toBeDefined();
    expect(result.reproducibilityScore).toBe(0.5); // Default placeholder
  });

  test("handles missing optional fields gracefully", async () => {
    const incompleteResponse = {
      title: "Paper with Missing Fields",
      publication_year: 2020,
      cited_by_count: 0,
      is_retracted: false,
      // Missing authorships, host_venue, open_access
    };

    fetchSpy.mockResolvedValue(new Response(JSON.stringify(incompleteResponse), { status: 200 }));

    const doi = "10.1234/missing.fields";
    const result = await fetchMetadataByDOI(doi);

    expect(result.title).toBe("Paper with Missing Fields");
    expect(result.authors).toBeUndefined();
    expect(result.journal).toBeUndefined();
    expect(result.isOpenAccess).toBeUndefined();

    // Scores should still be calculated
    expect(result.temporalScore).toBeDefined();
    expect(result.credibilityScore).toBeDefined();
  });

  test("throws error when OpenAlex API returns non-200 status", async () => {
    fetchSpy.mockResolvedValue(new Response("Not Found", { status: 404 }));

    const doi = "10.1234/not.found";

    // Expect the function to throw the specific error defined in the catch block
    await expect(fetchMetadataByDOI(doi)).rejects.toThrow(`Could not retrieve metadata for DOI: ${doi}.`);
  });

  test("throws error when fetch fails (network error)", async () => {
    fetchSpy.mockRejectedValue(new Error("Network Error"));

    const doi = "10.1234/network.error";

    await expect(fetchMetadataByDOI(doi)).rejects.toThrow(`Could not retrieve metadata for DOI: ${doi}.`);
  });
});
