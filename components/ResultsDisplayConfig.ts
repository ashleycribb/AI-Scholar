import { ResearchPaper, SortKey } from '../types';

export interface SortOption {
  key: SortKey;
  label: string;
  available: (papers: ResearchPaper[]) => boolean;
}

const hasField = (papers: ResearchPaper[], field: keyof ResearchPaper): boolean => {
  return papers.some(p => p[field] !== undefined);
};

export const sortOptions: SortOption[] = [
  {
    key: 'relevance',
    label: 'Relevance',
    available: (papers) => hasField(papers, 'combinedScore')
  },
  {
    key: 'year',
    label: 'Year',
    available: () => true
  },
  {
    key: 'citations',
    label: 'Citations',
    available: (papers) => hasField(papers, 'citations')
  },
  {
    key: 'validationScore',
    label: 'Validation',
    available: (papers) => hasField(papers, 'validation')
  },
  {
    key: 'screeningFitScore',
    label: 'Screening Fit',
    available: (papers) => hasField(papers, 'screeningFitScore')
  },
];
