import { describe, expect, test } from 'bun:test';
import { calculateCredibilityScore, calculateTemporalScore, createMetadataFromPaper } from './metadataService';
import type { ResearchPaper } from '../types';

const paper = (overrides: Partial<ResearchPaper> = {}): ResearchPaper => ({
  id: 'doi:10.1234/test',
  title: 'Test paper',
  authors: 'A Author',
  year: 2020,
  abstract: 'Abs',
  ...overrides,
} as ResearchPaper);

describe('metadata scores do not invent values when the input is missing', () => {
  test('temporal score is null without a year, and computed when a year is known', () => {
    expect(calculateTemporalScore(undefined)).toBeNull();
    expect(calculateTemporalScore(null)).toBeNull();
    expect(calculateTemporalScore(new Date().getFullYear())).toBe(1);
    expect(calculateTemporalScore(new Date().getFullYear() - 20)).toBe(0);
  });

  test('credibility score is null without a citation count, and computed when the count is known (including 0)', () => {
    expect(calculateCredibilityScore(undefined)).toBeNull();
    expect(calculateCredibilityScore(null)).toBeNull();
    expect(calculateCredibilityScore(0)).toBe(0.2);
    expect(calculateCredibilityScore(1000)).toBeCloseTo(1.0, 5);
  });

  test('createMetadataFromPaper leaves reproducibility unset and does not fill 0.5 defaults for missing year or citations', () => {
    const meta = createMetadataFromPaper(paper({ year: undefined, citations: undefined }));
    expect(meta.reproducibilityScore).toBeUndefined();
    expect(meta.temporalScore).toBeNull();
    expect(meta.credibilityScore).toBeNull();
  });
});
