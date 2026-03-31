import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test";

// Mock external dependencies to avoid resolution errors
// We need to mock this because geminiService imports it, and even if we mock geminiService,
// the static analysis might still try to resolve it if we were using static imports.
// But with dynamic imports, we should be safer, though mocking it is good practice.
mock.module("@google/genai", () => ({
  GoogleGenAI: class {
    constructor() {}
  },
  Type: {},
}));

// Mock internal services to avoid side effects
mock.module("./geminiService", () => ({
  extractCitationMetadata: mock(),
}));

mock.module("./crossrefService", () => ({
  fetchCslFromCrossref: mock(),
}));

// Import dynamically to ensure mocks are applied first
const { analyzeCitations } = await import("./citationService");

describe("analyzeCitations", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = mock();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test("should return correct stats for a valid response", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ citationCount: 100 }),
    });

    const stats = await analyzeCitations("10.1234/test");

    expect(stats.total).toBe(100);
    // 100 * 0.7 = 70
    expect(stats.supportCount).toBe(70);
    // 100 * 0.05 = 5
    expect(stats.contradictCount).toBe(5);
    // (70 - 5) / 100 = 0.65
    expect(stats.supportRatio).toBe(0.65);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.semanticscholar.org/graph/v1/paper/DOI:10.1234%2Ftest?fields=citationCount"
    );
  });

  test("should return default stats on API error", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const stats = await analyzeCitations("10.1234/test");

    expect(stats).toEqual({
      total: 0,
      supportCount: 0,
      contradictCount: 0,
      supportRatio: 0.5,
    });
  });

  test("should return default stats on network error", async () => {
    (global.fetch as any).mockRejectedValue(new Error("Network error"));

    const stats = await analyzeCitations("10.1234/test");

    expect(stats).toEqual({
      total: 0,
      supportCount: 0,
      contradictCount: 0,
      supportRatio: 0.5,
    });
  });

  test("should handle zero citations correctly", async () => {
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({ citationCount: 0 }),
    });

    const stats = await analyzeCitations("10.1234/test");

    expect(stats.total).toBe(0);
    expect(stats.supportCount).toBe(0);
    expect(stats.contradictCount).toBe(0);
    expect(stats.supportRatio).toBe(0.5);
  });

  test("should handle malformed data (missing citationCount)", async () => {
    (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({}), // Empty object
    });

    const stats = await analyzeCitations("10.1234/test");

    expect(stats.total).toBe(0);
    expect(stats.supportRatio).toBe(0.5);
  });
});
