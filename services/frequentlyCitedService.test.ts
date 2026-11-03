import { describe, expect, test } from 'bun:test';
import {
  countFrequentlyCitedReferences,
  suggestionToResearchPaper,
  normalizeDoi,
  normalizeTitle,
  type FrequentlyCitedItem
} from './frequentlyCitedService';
import type { ResearchPaper } from '../types';

describe('normalizeDoi and normalizeTitle', () => {
  test('normalizes DOIs with various prefixes and casing', () => {
    expect(normalizeDoi('10.1038/nature123')).toBe('10.1038/nature123');
    expect(normalizeDoi('https://doi.org/10.1038/NATURE123')).toBe('10.1038/nature123');
    expect(normalizeDoi('http://doi.org/10.1038/nature123')).toBe('10.1038/nature123');
    expect(normalizeDoi('doi:10.1038/nature123')).toBe('10.1038/nature123');
    expect(normalizeDoi('')).toBe('');
    expect(normalizeDoi(undefined)).toBe('');
  });

  test('normalizes titles by stripping punctuation, extra spaces, and casing', () => {
    expect(normalizeTitle('Attention Is All You Need!')).toBe('attention is all you need');
    expect(normalizeTitle('  Attention   is all  you need... ')).toBe('attention is all you need');
    expect(normalizeTitle('')).toBe('');
  });
});

describe('countFrequentlyCitedReferences', () => {
  const paperA: ResearchPaper = {
    id: 'paper-a',
    title: 'Graph Neural Networks in Drug Discovery',
    authors: 'Alice Smith',
    year: 2023,
    abstract: 'Abstract A',
    doi: '10.1001/paper-a',
    references: [
      { doi: '10.2000/ref-foundational', title: 'Deep Learning Foundations', authors: 'LeCun et al.', year: 2015 },
      { doi: '10.2000/ref-transformers', title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017 },
      { title: 'A Survey on GNNs', authors: 'Wu et al.', year: 2020 }
    ]
  };

  const paperB: ResearchPaper = {
    id: 'paper-b',
    title: 'Molecular Property Prediction with Transformers',
    authors: 'Bob Jones',
    year: 2024,
    abstract: 'Abstract B',
    doi: '10.1001/paper-b',
    references: [
      { doi: '10.2000/ref-foundational', title: 'Deep Learning Foundations', authors: 'LeCun et al.', year: 2015 },
      { doi: '10.2000/ref-transformers', title: 'Attention Is All You Need', authors: 'Vaswani et al.', year: 2017 },
      { title: 'SMILES Representation Learning', authors: 'Zhang et al.', year: 2021 }
    ]
  };

  const paperC: ResearchPaper = {
    id: 'paper-c',
    title: 'Geometric Deep Learning for Molecules',
    authors: 'Carol White',
    year: 2024,
    abstract: 'Abstract C',
    doi: '10.1001/paper-c',
    references: [
      { doi: '10.2000/ref-foundational', title: 'Deep Learning Foundations', authors: 'LeCun et al.', year: 2015 },
      { title: 'A Survey on GNNs', authors: 'Wu et al.', year: 2020 }
    ]
  };

  test('counts reference frequency across selected papers and records which papers cite them', () => {
    const suggestions = countFrequentlyCitedReferences([paperA, paperB, paperC]);

    expect(suggestions.length).toBeGreaterThan(0);

    // Deep Learning Foundations is cited by all 3 selected papers
    const foundational = suggestions.find((s) => s.doi === '10.2000/ref-foundational');
    expect(foundational).toBeDefined();
    expect(foundational!.count).toBe(3);
    expect(foundational!.citedBy.map((c) => c.id).sort()).toEqual(['paper-a', 'paper-b', 'paper-c']);
    expect(foundational!.citedBy.map((c) => c.title)).toContain('Graph Neural Networks in Drug Discovery');

    // Attention Is All You Need is cited by paperA and paperB
    const transformers = suggestions.find((s) => s.doi === '10.2000/ref-transformers');
    expect(transformers).toBeDefined();
    expect(transformers!.count).toBe(2);
    expect(transformers!.citedBy.map((c) => c.id).sort()).toEqual(['paper-a', 'paper-b']);

    // A Survey on GNNs is cited by paperA and paperC
    const gnnSurvey = suggestions.find((s) => s.title === 'A Survey on GNNs');
    expect(gnnSurvey).toBeDefined();
    expect(gnnSurvey!.count).toBe(2);
    expect(gnnSurvey!.citedBy.map((c) => c.id).sort()).toEqual(['paper-a', 'paper-c']);

    // Highest frequency appears first
    expect(suggestions[0].doi).toBe('10.2000/ref-foundational');
    expect(suggestions[0].count).toBe(3);
  });

  test('deduplicates references within the same citing paper (counts at most once per selected paper)', () => {
    const paperWithDupes: ResearchPaper = {
      id: 'paper-dupe',
      title: 'Review with repeated citations',
      authors: 'Author D',
      year: 2023,
      abstract: 'Abstract',
      references: [
        { doi: '10.3000/unique-ref', title: 'Unique Reference', authors: 'Author E', year: 2019 },
        { doi: '10.3000/unique-ref', title: 'Unique Reference', authors: 'Author E', year: 2019 },
        '10.3000/unique-ref'
      ]
    };

    const suggestions = countFrequentlyCitedReferences([paperWithDupes]);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].count).toBe(1);
    expect(suggestions[0].citedBy.length).toBe(1);
  });

  test('merges references by DOI across papers even if title text slightly differs', () => {
    const p1: ResearchPaper = {
      id: 'p1',
      title: 'Paper 1',
      authors: 'A',
      year: 2022,
      abstract: '',
      references: [{ doi: '10.5555/shared-doi', title: 'Shared Work: A Comprehensive Study' }]
    };
    const p2: ResearchPaper = {
      id: 'p2',
      title: 'Paper 2',
      authors: 'B',
      year: 2023,
      abstract: '',
      references: [{ doi: 'https://doi.org/10.5555/shared-doi', title: 'Shared Work (Study)' }]
    };

    const suggestions = countFrequentlyCitedReferences([p1, p2]);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].doi).toBe('10.5555/shared-doi');
    expect(suggestions[0].count).toBe(2);
    expect(suggestions[0].citedBy.map((c) => c.id).sort()).toEqual(['p1', 'p2']);
  });

  test('merges references by normalized title when DOI is absent', () => {
    const p1: ResearchPaper = {
      id: 'p1',
      title: 'Paper 1',
      authors: 'A',
      year: 2022,
      abstract: '',
      references: ['Reinforcement Learning from Human Feedback']
    };
    const p2: ResearchPaper = {
      id: 'p2',
      title: 'Paper 2',
      authors: 'B',
      year: 2023,
      abstract: '',
      references: [{ title: 'Reinforcement learning from human feedback!', authors: 'Christiano et al.', year: 2017 }]
    };

    const suggestions = countFrequentlyCitedReferences([p1, p2]);
    expect(suggestions.length).toBe(1);
    expect(suggestions[0].count).toBe(2);
    expect(suggestions[0].authors).toBe('Christiano et al.');
    expect(suggestions[0].year).toBe(2017);
  });

  test('excludes references that are already selected in the researcher corpus (not-yet-selected filter)', () => {
    // Already selected in corpus:
    const selectedTransformersPaper: ResearchPaper = {
      id: 'selected-transformers',
      title: 'Attention Is All You Need',
      authors: 'Vaswani et al.',
      year: 2017,
      abstract: 'Transformer paper',
      doi: '10.2000/ref-transformers'
    };

    const selectedList = [paperA, paperB, selectedTransformersPaper];
    const suggestions = countFrequentlyCitedReferences(selectedList);

    // Transformers paper is in selectedList, so it must NOT appear in suggestions
    const foundTransformers = suggestions.find(
      (s) => s.doi === '10.2000/ref-transformers' || normalizeTitle(s.title) === 'attention is all you need'
    );
    expect(foundTransformers).toBeUndefined();

    // Foundational reference is still not selected, so it should still be suggested
    const foundFoundational = suggestions.find((s) => s.doi === '10.2000/ref-foundational');
    expect(foundFoundational).toBeDefined();
    expect(foundFoundational!.count).toBe(2); // cited by paperA and paperB
  });

  test('respects topN option limit', () => {
    const suggestions = countFrequentlyCitedReferences([paperA, paperB, paperC], { topN: 2 });
    expect(suggestions.length).toBe(2);
    expect(suggestions[0].count).toBeGreaterThanOrEqual(suggestions[1].count);
  });

  test('no AI judgment: counts frequencies purely and deterministically', () => {
    const res1 = countFrequentlyCitedReferences([paperA, paperB, paperC]);
    const res2 = countFrequentlyCitedReferences([paperA, paperB, paperC]);
    expect(res1).toEqual(res2);
    for (const item of res1) {
      expect(typeof item.count).toBe('number');
      expect((item as any).confidence).toBeUndefined();
      expect((item as any).relevanceScore).toBeUndefined();
    }
  });
});

describe('empty-state behavior', () => {
  test('returns empty array when no papers are selected', () => {
    const suggestions = countFrequentlyCitedReferences([]);
    expect(suggestions).toEqual([]);
  });

  test('returns empty array when selected papers have no references', () => {
    const paperNoRefs1: ResearchPaper = {
      id: 'p-no-ref-1',
      title: 'Solo Paper 1',
      authors: 'Author 1',
      year: 2024,
      abstract: 'Abstract'
    };
    const paperNoRefs2: ResearchPaper = {
      id: 'p-no-ref-2',
      title: 'Solo Paper 2',
      authors: 'Author 2',
      year: 2024,
      abstract: 'Abstract',
      references: []
    };

    const suggestions = countFrequentlyCitedReferences([paperNoRefs1, paperNoRefs2]);
    expect(suggestions).toEqual([]);
  });

  test('returns empty array when all cited references are already selected in the corpus', () => {
    const p1: ResearchPaper = {
      id: 'p1',
      title: 'Paper 1',
      authors: 'Author 1',
      year: 2023,
      abstract: '',
      doi: '10.1111/p1',
      references: [{ doi: '10.2222/p2', title: 'Paper 2' }]
    };
    const p2: ResearchPaper = {
      id: 'p2',
      title: 'Paper 2',
      authors: 'Author 2',
      year: 2024,
      abstract: '',
      doi: '10.2222/p2',
      references: [{ doi: '10.1111/p1', title: 'Paper 1' }]
    };

    // Both p1 and p2 cite each other, and both are in the selected corpus
    const suggestions = countFrequentlyCitedReferences([p1, p2]);
    expect(suggestions).toEqual([]);
  });
});

describe('suggestionToResearchPaper', () => {
  test('converts suggestion into a ResearchPaper suitable for pass 1 selection', () => {
    const item: FrequentlyCitedItem = {
      id: 'doi:10.2000/ref-foundational',
      title: 'Deep Learning Foundations',
      authors: 'LeCun et al.',
      year: 2015,
      doi: '10.2000/ref-foundational',
      count: 3,
      citedBy: [
        { id: 'paper-a', title: 'Paper A' },
        { id: 'paper-b', title: 'Paper B' },
        { id: 'paper-c', title: 'Paper C' }
      ]
    };

    const paper = suggestionToResearchPaper(item);
    expect(paper.id).toBe('doi:10.2000/ref-foundational');
    expect(paper.title).toBe('Deep Learning Foundations');
    expect(paper.authors).toBe('LeCun et al.');
    expect(paper.year).toBe(2015);
    expect(paper.doi).toBe('10.2000/ref-foundational');
    expect(paper.citations).toBe(3);
    expect(paper.sourceURL).toBe('https://doi.org/10.2000/ref-foundational');
  });
});
