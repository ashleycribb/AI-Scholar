import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResearchPaper } from '../types';
import {
    ScoutScreeningList,
    SCOUT_SCREENING_HEADING,
    SCOUT_MATCH_SCORE_LABEL,
    SCOUT_UNCERTAINTY_FALLBACK,
    formatMatchToSearchTerm,
} from './ScoutScreeningList';

function paper(partial: Partial<ResearchPaper> & Pick<ResearchPaper, 'id' | 'title'>): ResearchPaper {
    return {
        authors: 'Ada Lovelace, Alan Turing',
        year: 2022,
        abstract: 'An abstract for screening.',
        ...partial,
    };
}

const screeningPapers: ResearchPaper[] = [
    paper({ id: 'w1', title: 'First matching paper', semanticScore: 91, citations: 12, isOpenAccess: true }),
    paper({ id: 'w2', title: 'Second matching paper', semanticScore: 0.64, citations: 4 }),
    paper({ id: 'w3', title: 'Third matching paper', semanticScore: 40 }),
    paper({ id: 'w4', title: 'Fourth matching paper' }),
    paper({ id: 'w5', title: 'Fifth matching paper', semanticScore: 22 }),
];

function renderList(approvedIds?: Set<string>) {
    return renderToStaticMarkup(
        <ScoutScreeningList
            papers={screeningPapers}
            approvedIds={approvedIds}
            rationale="Topical cluster identified via co-citation network for the search terms."
            uncertainty={SCOUT_UNCERTAINTY_FALLBACK}
            onApprove={() => {}}
            onSelectPaper={() => {}}
        />
    );
}

describe('ScoutScreeningList', () => {
    test('renders a neutral screening list heading and keeps result order', () => {
        const html = renderList();
        expect(html).toContain(SCOUT_SCREENING_HEADING);
        expect(html.indexOf('First matching paper')).toBeLessThan(html.indexOf('Second matching paper'));
        expect(html.indexOf('Fourth matching paper')).toBeLessThan(html.indexOf('Fifth matching paper'));
        expect(html).toContain('Fifth matching paper');
    });

    test('shows the score as match to search term, not quality', () => {
        const html = renderList();
        expect(html).toContain(formatMatchToSearchTerm(91));
        expect(html).toContain(formatMatchToSearchTerm(0.64));
        expect(html).toContain(`${SCOUT_MATCH_SCORE_LABEL}: 91%`);
        expect(html).toContain(`${SCOUT_MATCH_SCORE_LABEL}: 64%`);
        expect(html.toLowerCase()).not.toContain('quality');
        expect(html).not.toContain('High Match');
    });

    test('does not render recommend wording', () => {
        const html = renderList();
        expect(html.toLowerCase()).not.toContain('recommend');
        expect(SCOUT_UNCERTAINTY_FALLBACK.toLowerCase()).not.toContain('recommend');
        expect(SCOUT_SCREENING_HEADING.toLowerCase()).not.toContain('recommend');
    });

    test('does not pre-select any result', () => {
        const html = renderList();
        expect(html).not.toContain('Admitted to Ledger');
        expect(html).not.toContain('checked');
        expect(html).not.toContain('aria-pressed="true"');
        expect(html).not.toContain('aria-selected="true"');
        expect((html.match(/Approve &amp; Stage/g) || []).length).toBe(screeningPapers.length);

        const tree = ScoutScreeningList({
            papers: screeningPapers,
            onApprove: () => {},
            onSelectPaper: () => {},
        }) as any;

        const buttons: any[] = [];
        const walk = (node: any) => {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            if (node.type === 'button') buttons.push(node);
            walk(node.props?.children);
        };
        walk(tree);
        expect(buttons.length).toBe(screeningPapers.length);
        for (const button of buttons) {
            expect(button.props.disabled).toBe(false);
            expect(button.props['aria-pressed']).toBe(false);
            expect(button.props.checked).toBeUndefined();
            expect(button.props.defaultChecked).toBeUndefined();
        }
    });

    test('marks a paper admitted only after an explicit approved id is provided', () => {
        const html = renderList(new Set(['w2']));
        expect(html).toContain('Admitted to Ledger');
        expect((html.match(/Approve &amp; Stage/g) || []).length).toBe(screeningPapers.length - 1);
    });
});
