import { ResearchPaper, SortKey } from '../types';

export interface SortOption {
    key: SortKey;
    label: string;
    available: (papers: ResearchPaper[]) => boolean;
}

const hasProperty = (key: keyof ResearchPaper) => (papers: ResearchPaper[]) =>
    papers.some(p => p[key] !== undefined);

export const sortOptions: SortOption[] = [
    {
        key: 'relevance',
        label: 'Relevance',
        available: hasProperty('combinedScore')
    },
    {
        key: 'year',
        label: 'Year',
        available: () => true
    },
    {
        key: 'citations',
        label: 'Citations',
        available: hasProperty('citations')
    },
    {
        key: 'validationScore',
        label: 'Validation',
        available: hasProperty('validation')
    },
    {
        key: 'screeningFitScore',
        label: 'Screening Fit',
        available: hasProperty('screeningFitScore')
    },
];
