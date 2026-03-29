import type { ResearchPaper, SortKey } from '../types';

export interface SortOption {
  key: SortKey;
  label: string;
  available: (papers: ResearchPaper[]) => boolean;
}

export const sortOptions: SortOption[] = [
    { key: 'relevance', label: 'Relevance', available: (papers) => papers.some(p => p.combinedScore !== undefined) },
    { key: 'year', label: 'Year', available: () => true },
    { key: 'citations', label: 'Citations', available: (papers) => papers.some(p => p.citations !== undefined) },
    { key: 'validationScore', label: 'Validation', available: (papers) => papers.some(p => p.validation !== undefined) },
    { key: 'screeningFitScore', label: 'Screening Fit', available: (papers) => papers.some(p => p.screeningFitScore !== undefined) },
];
