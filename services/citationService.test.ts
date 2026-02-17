
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dependencies BEFORE importing the module under test
vi.mock('./geminiService', () => ({
  extractCitationMetadata: vi.fn(),
}));

vi.mock('./crossrefService', () => ({
  fetchCslFromCrossref: vi.fn(),
}));

import { analyzeCitations } from './citationService';

describe('citationService', () => {
  describe('analyzeCitations', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      // Reset fetch mock
      global.fetch = vi.fn();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should return correct stats for a successful response', async () => {
      const mockResponse = { citationCount: 100 };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await analyzeCitations('10.1234/test');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.semanticscholar.org/graph/v1/paper/DOI:10.1234%2Ftest?fields=citationCount'
      );
      expect(result).toEqual({
        total: 100,
        supportCount: 70, // 100 * 0.7
        contradictCount: 5, // 100 * 0.05
        supportRatio: (70 - 5) / 100, // 0.65
      });
    });

    it('should handle zero citations', async () => {
      const mockResponse = { citationCount: 0 };
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await analyzeCitations('10.1234/zero');

      expect(result).toEqual({
        total: 0,
        supportCount: 0,
        contradictCount: 0,
        supportRatio: 0.5,
      });
    });

    it('should handle API errors (non-200 status)', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404,
      });
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await analyzeCitations('10.1234/missing');

      expect(result).toEqual({
        total: 0,
        supportCount: 0,
        contradictCount: 0,
        supportRatio: 0.5,
      });
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Semantic Scholar API returned status 404 for DOI: 10.1234/missing'
      );
    });

    it('should handle network errors (fetch throws)', async () => {
      const error = new Error('Network error');
      (global.fetch as any).mockRejectedValue(error);
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await analyzeCitations('10.1234/error');

      expect(result).toEqual({
        total: 0,
        supportCount: 0,
        contradictCount: 0,
        supportRatio: 0.5,
      });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to analyze citations for DOI 10.1234/error:',
        error
      );
    });
  });
});
