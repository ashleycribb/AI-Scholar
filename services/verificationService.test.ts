import { afterEach, describe, expect, spyOn, test } from 'bun:test';
import type { ResearchPaper } from '../types';
import * as citationService from './citationService';
import * as retrievalService from './retrievalService';
import { verifyPaper } from './verificationService';
import { computeVACS } from './scoringService';
import { createMetadataFromPaper } from './metadataService';
import { UNAVAILABLE_CITATION_STATS } from './citationService';

const paper = (overrides: Partial<ResearchPaper> = {}): ResearchPaper => ({
  id: 'doi:10.1234/test',
  title: 'A study of outcomes',
  authors: 'A Author',
  year: 2024,
  citations: 40,
  abstract: 'A study of outcomes using machine learning.',
  doi: '10.1234/test',
  ...overrides,
} as ResearchPaper);

describe('verifyPaper', () => {
  const spies: { mockRestore: () => void }[] = [];

  afterEach(() => {
    while (spies.length) spies.pop()!.mockRestore();
  });

  test('missing citation-intent counts do not change the verification result and are not 70%/5%', async () => {
    spies.push(spyOn(retrievalService, 'findSupportingPassages').mockResolvedValue([]));
    spies.push(spyOn(citationService, 'analyzeCitations').mockResolvedValue({
      ...UNAVAILABLE_CITATION_STATS,
      total: 100,
    }));

    const result = await verifyPaper(paper(), 'A study of outcomes');
    const meta = createMetadataFromPaper(paper());
    const expected = computeVACS(meta, { ...UNAVAILABLE_CITATION_STATS, total: 100 }, [], 'unavailable');

    expect(result.vacs).toBe(expected.vacs);
    expect(result.verdict).toBe(expected.verdict);
    expect(result.breakdown.citations).toBeNull();
    expect(result.rationale.join(' ')).toContain('Citation context is not available');
    expect(result.breakdown.citations).not.toBe(0.7);
    expect(result.breakdown.citations).not.toBe(0.5);
  });

  test('a real scite tally on the paper is used and still names the source', async () => {
    spies.push(spyOn(retrievalService, 'findSupportingPassages').mockResolvedValue([]));
    const analyze = spyOn(citationService, 'analyzeCitations');
    spies.push(analyze);

    const result = await verifyPaper(paper({
      sciteTally: { doi: '10.1234/test', supporting: 8, contrasting: 2, mentioning: 0, total: 10 },
    }), 'A study of outcomes');

    expect(analyze).not.toHaveBeenCalled();
    expect(result.breakdown.citations).toBeCloseTo(8 / 10, 5);
    expect(result.rationale.join(' ')).toContain('(scite)');
  });
});
