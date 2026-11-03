import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FrequentlyCitedPanel } from './FrequentlyCitedPanel';
import { suggestionToResearchPaper, countFrequentlyCitedReferences } from '../services/frequentlyCitedService';
import type { ResearchPaper } from '../types';

describe('FrequentlyCitedPanel empty states', () => {
  test('renders empty state when no papers are selected in workspace', () => {
    const html = renderToStaticMarkup(
      <FrequentlyCitedPanel selectedPapers={[]} onSelectPaper={() => {}} />
    );

    expect(html).toContain('Frequently Cited in Selected Works');
    expect(html).toContain('No papers selected yet');
    expect(html).toContain('Add candidate papers to your selection queue');
    expect(html).not.toContain('Select paper');
  });

  test('renders empty state when selected papers have no reference lists', () => {
    const selected: ResearchPaper[] = [
      {
        id: 'p1',
        title: 'Single Paper Without References',
        authors: 'Author One',
        year: 2024,
        abstract: 'Abstract',
        references: []
      }
    ];

    const html = renderToStaticMarkup(
      <FrequentlyCitedPanel selectedPapers={selected} onSelectPaper={() => {}} />
    );

    expect(html).toContain('No reference lists available');
    expect(html).not.toContain('Select paper');
  });

  test('renders empty state when all cited references are already in the corpus', () => {
    const selected: ResearchPaper[] = [
      {
        id: 'p1',
        title: 'First Corpus Paper',
        authors: 'Author 1',
        year: 2023,
        abstract: '',
        doi: '10.1000/p1',
        references: [{ doi: '10.1000/p2', title: 'Second Corpus Paper' }]
      },
      {
        id: 'p2',
        title: 'Second Corpus Paper',
        authors: 'Author 2',
        year: 2024,
        abstract: '',
        doi: '10.1000/p2',
        references: [{ doi: '10.1000/p1', title: 'First Corpus Paper' }]
      }
    ];

    const html = renderToStaticMarkup(
      <FrequentlyCitedPanel selectedPapers={selected} onSelectPaper={() => {}} />
    );

    expect(html).toContain('All cited works are in your corpus');
    expect(html).not.toContain('Select paper');
  });
});

describe('FrequentlyCitedPanel suggestions rendering and behavior', () => {
  const selectedPapers: ResearchPaper[] = [
    {
      id: 'p-alpha',
      title: 'Deep Learning in Chemistry',
      authors: 'Alpha Author',
      year: 2023,
      abstract: '',
      references: [
        { doi: '10.5000/shared-paper', title: 'Foundational Molecular Network', authors: 'Smith et al.', year: 2018 },
        { title: 'Secondary Reference', authors: 'Doe et al.', year: 2020 }
      ]
    },
    {
      id: 'p-beta',
      title: 'Neural Message Passing for Molecules',
      authors: 'Beta Author',
      year: 2024,
      abstract: '',
      references: [
        { doi: '10.5000/shared-paper', title: 'Foundational Molecular Network', authors: 'Smith et al.', year: 2018 }
      ]
    }
  ];

  test('renders suggestions with citation counts and which selected papers cite them', () => {
    const html = renderToStaticMarkup(
      <FrequentlyCitedPanel selectedPapers={selectedPapers} onSelectPaper={() => {}} />
    );

    expect(html).toContain('Foundational Molecular Network');
    expect(html).toContain('Smith et al.');
    expect(html).toContain('2018');
    expect(html).toContain('2 citations');
    expect(html).toContain('Cited in:');
    expect(html).toContain('Deep Learning in Chemistry');
    expect(html).toContain('Neural Message Passing for Molecules');
    expect(html).toContain('Select paper');
    expect(html).toContain('no AI relevance scoring');
    expect(html).toContain('Suggestions only');
  });

  test('nothing is added automatically on render; suggestions only convert to paper upon selection', () => {
    const selected: ResearchPaper[] = [];
    const html = renderToStaticMarkup(
      <FrequentlyCitedPanel
        selectedPapers={selectedPapers}
        onSelectPaper={(p) => selected.push(p)}
      />
    );

    // Rendering alone MUST NOT add any papers
    expect(selected).toEqual([]);
    expect(html).toContain('Select paper');

    // When a suggestion is selected, it converts via suggestionToResearchPaper and passes to onSelectPaper
    const suggestions = countFrequentlyCitedReferences(selectedPapers);
    expect(suggestions.length).toBeGreaterThan(0);
    const converted = suggestionToResearchPaper(suggestions[0]);
    expect(converted.title).toBe('Foundational Molecular Network');
    expect(converted.doi).toBe('10.5000/shared-paper');
    expect(converted.citations).toBe(2);
  });
});
