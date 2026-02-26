import { describe, it, expect, mock, beforeEach, beforeAll } from 'bun:test';
import type { ResearchPaper, CrossrefWork } from '../types';

// Mock the dependencies
const mockFetchPaperFromCrossref = mock();
const mockFindOpenAccessPdf = mock();
const mockSearchByDoi = mock();

mock.module('./crossrefService', () => ({
    fetchPaperFromCrossref: mockFetchPaperFromCrossref,
}));

mock.module('./unpaywallService', () => ({
    findOpenAccessPdf: mockFindOpenAccessPdf,
}));

mock.module('./doajService', () => ({
    searchByDoi: mockSearchByDoi,
}));

let validatePaper: typeof import('./validationService').validatePaper;

describe('validationService.validatePaper', () => {
    beforeAll(async () => {
        // Import module AFTER mocks are set up to ensure mocks are used
        const module = await import('./validationService');
        validatePaper = module.validatePaper;
    });

    beforeEach(() => {
        mockFetchPaperFromCrossref.mockReset();
        mockFindOpenAccessPdf.mockReset();
        mockSearchByDoi.mockReset();
    });

    const basePaper: ResearchPaper = {
        id: 'paper-123',
        title: 'Test Paper Title',
        authors: 'Smith, John',
        year: 2023,
        abstract: 'This is a test abstract.',
        citations: 5,
        enrichmentSource: undefined,
    };

    it('should return low score when no external data is found', async () => {
        mockFetchPaperFromCrossref.mockResolvedValue(null);
        mockFindOpenAccessPdf.mockResolvedValue(null);
        mockSearchByDoi.mockResolvedValue(null);

        const result = await validatePaper(basePaper);

        expect(result.validation.score).toBe(0);
        expect(result.validation.checks.crossref_match).toBe(false);
        expect(result.validation.checks.open_access).toBe(false);
        expect(result.validation.checks.doaj_indexed).toBe(false);
        expect(result.updatedPaperData.doi).toBeUndefined();
        expect(result.validation.log).toContain('Could not find a confident match in Crossref.');
    });

    it('should return high score for perfect match', async () => {
        const enrichedPaper = { ...basePaper, enrichmentSource: 'arXiv' as const, citations: 15 };

        const crossrefWork: CrossrefWork = {
            title: ['Test Paper Title'],
            author: [{ family: 'Smith', given: 'John' }],
            URL: 'http://doi.org/10.1234/test',
            DOI: '10.1234/test',
        };

        mockFetchPaperFromCrossref.mockResolvedValue(crossrefWork);
        mockFindOpenAccessPdf.mockResolvedValue('http://example.com/paper.pdf');
        mockSearchByDoi.mockResolvedValue({ bibjson: { title: 'Journal', identifier: [], journal: { in_doaj: true, title: 'Journal' } } });

        const result = await validatePaper(enrichedPaper);

        // Score Calculation:
        // +10 (arXiv)
        // +10 (Citations > 10)
        // +30 (Crossref match)
        // +20 (Title match)
        // +15 (Author match)
        // +20 (DOAJ)
        // +15 (OA confirmed)
        // Total = 120 -> capped at 100
        expect(result.validation.score).toBe(100);
        expect(result.validation.checks.crossref_match).toBe(true);
        expect(result.validation.checks.title_match).toBe(true);
        expect(result.validation.checks.author_match).toBe(true);
        expect(result.validation.checks.open_access).toBe(true);
        expect(result.validation.checks.doaj_indexed).toBe(true);
        expect(result.updatedPaperData.doi).toBe('10.1234/test');
        expect(result.updatedPaperData.pdfURL).toBe('http://example.com/paper.pdf');
    });

    it('should award points for enrichment source and citations', async () => {
        const enrichedPaper = { ...basePaper, enrichmentSource: 'arXiv' as const, citations: 15 };

        mockFetchPaperFromCrossref.mockResolvedValue(null);
        mockFindOpenAccessPdf.mockResolvedValue(null);
        mockSearchByDoi.mockResolvedValue(null);

        const result = await validatePaper(enrichedPaper);

        // +10 (arXiv)
        // +10 (Citations > 10)
        expect(result.validation.score).toBe(20);
        expect(result.validation.checks.source_enriched).toBe(true);
        expect(result.validation.checks.has_citations).toBe(true);
    });

    it('should handle Crossref match with title/author mismatch', async () => {
        const crossrefWork: CrossrefWork = {
            title: ['Different Title'],
            author: [{ family: 'Doe', given: 'Jane' }],
            URL: 'http://doi.org/10.1234/other',
            DOI: '10.1234/other',
        };

        mockFetchPaperFromCrossref.mockResolvedValue(crossrefWork);
        mockFindOpenAccessPdf.mockResolvedValue(null);
        mockSearchByDoi.mockResolvedValue(null);

        const result = await validatePaper(basePaper);

        // Score:
        // +30 (Crossref match)
        // +0 (Title match fail)
        // +0 (Author match fail)
        // Total = 30
        expect(result.validation.score).toBe(30);
        expect(result.validation.checks.crossref_match).toBe(true);
        expect(result.validation.checks.title_match).toBe(false);
        expect(result.validation.checks.author_match).toBe(false);
        expect(result.updatedPaperData.doi).toBe('10.1234/other');
        expect(result.validation.log.some(l => l.includes('Title mismatch'))).toBe(true);
    });

    it('should verify Open Access via Unpaywall when Crossref fails', async () => {
        const paperWithDoi = { ...basePaper, doi: '10.1234/exists' };

        mockFetchPaperFromCrossref.mockResolvedValue(null);
        mockFindOpenAccessPdf.mockResolvedValue('http://example.com/oa.pdf');
        mockSearchByDoi.mockResolvedValue(null);

        const result = await validatePaper(paperWithDoi);

        // Score:
        // +15 (OA confirmed)
        // Total = 15
        expect(result.validation.score).toBe(15);
        expect(result.validation.checks.open_access).toBe(true);
        expect(result.validation.checks.doaj_indexed).toBe(false);
        expect(result.updatedPaperData.pdfURL).toBe('http://example.com/oa.pdf');
        expect(result.validation.log).toContain('Found a direct Open Access PDF link via Unpaywall.');
    });

    it('should verify Open Access via DOAJ when Unpaywall fails', async () => {
        const paperWithDoi = { ...basePaper, doi: '10.1234/exists' };

        mockFetchPaperFromCrossref.mockResolvedValue(null);
        mockFindOpenAccessPdf.mockResolvedValue(null);
        mockSearchByDoi.mockResolvedValue({ bibjson: { title: 'Journal', identifier: [], journal: { in_doaj: true, title: 'Journal' } } });

        const result = await validatePaper(paperWithDoi);

        // Score:
        // +20 (DOAJ)
        // +15 (OA confirmed)
        // Total = 35
        expect(result.validation.score).toBe(35);
        expect(result.validation.checks.doaj_indexed).toBe(true);
        expect(result.validation.checks.open_access).toBe(false); // open_access specifically means PDF link found
        expect(result.validation.log).toContain('+20: Paper is indexed in the Directory of Open Access Journals (DOAJ).');
    });
});
