import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { searchByDoi, DoajArticle } from './doajService';

describe('doajService', () => {
  const mockDoi = '10.1234/example.doi';

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return article data when DOAJ finds the article and journal is in DOAJ', async () => {
    const mockResponse = {
      bibjson: {
        title: 'Test Article',
        identifier: [{ type: 'doi', id: mockDoi }],
        journal: {
          in_doaj: true,
          title: 'Test Journal',
        },
      },
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await searchByDoi(mockDoi);

    expect(fetchSpy).toHaveBeenCalledWith(
      `https://doaj.org/api/v4/articles/doi/${encodeURIComponent(mockDoi)}`
    );
    expect(result).toEqual(mockResponse);
  });

  it('should return null when the API returns 404', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    const result = await searchByDoi(mockDoi);

    expect(fetchSpy).toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it('should return null when the journal is not in DOAJ', async () => {
    const mockResponse = {
      bibjson: {
        title: 'Test Article',
        identifier: [{ type: 'doi', id: mockDoi }],
        journal: {
          in_doaj: false,
          title: 'Test Journal',
        },
      },
    };

    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    } as Response);

    const result = await searchByDoi(mockDoi);

    expect(result).toBeNull();
  });

  it('should return null and log warning when API returns non-404 error status', async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
    } as Response);

    const result = await searchByDoi(mockDoi);

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      `DOAJ API returned status 500 for DOI ${mockDoi}`
    );
  });

  it('should return null and log error when fetch throws an error', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Network error');
    const fetchSpy = vi.spyOn(global, 'fetch').mockRejectedValue(error);

    const result = await searchByDoi(mockDoi);

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      `Error querying DOAJ for DOI ${mockDoi}:`,
      error
    );
  });

  it('should return null when response JSON is malformed', async () => {
      // Assuming response.json() throws an error for malformed JSON
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => { throw new Error('Invalid JSON'); }
      } as Response);

      const result = await searchByDoi(mockDoi);

      expect(result).toBeNull();
      expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should return null when response structure is unexpected (missing bibjson)', async () => {
      const mockResponse = {
          someOtherField: 'value'
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
          ok: true,
          status: 200,
          json: async () => mockResponse,
      } as Response);

      const result = await searchByDoi(mockDoi);

      expect(result).toBeNull();
  });
});
