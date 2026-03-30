import type { ResearchPaper, SortKey } from '../types';

export interface SortOption {
  key: SortKey;
  label: string;
  available: (papers: ResearchPaper[]) => boolean;
}

export const hasRelevance = (papers: ResearchPaper[]): boolean =>
  papers.some(p => p.combinedScore !== undefined);

export const hasCitations = (papers: ResearchPaper[]): boolean =>
  papers.some(p => p.citations !== undefined);

export const hasValidation = (papers: ResearchPaper[]): boolean =>
  papers.some(p => p.validation !== undefined);

export const hasScreeningFit = (papers: ResearchPaper[]): boolean =>
  papers.some(p => p.screeningFitScore !== undefined);

export const sortOptions: SortOption[] = [
    { key: 'relevance', label: 'Relevance', available: hasRelevance },
    { key: 'year', label: 'Year', available: () => true },
    { key: 'citations', label: 'Citations', available: hasCitations },
    { key: 'validationScore', label: 'Validation', available: hasValidation },
    { key: 'screeningFitScore', label: 'Screening Fit', available: hasScreeningFit },
];
