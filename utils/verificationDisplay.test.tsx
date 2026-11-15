import { describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { formatPercentScore, formatVacs, NOT_AVAILABLE } from './verificationDisplay';
import { BreakdownBar, VerificationResultView } from '../components/VerificationModal';
import { VacsScoreBadge } from '../components/VacsScoreBadge';
import type { VerificationResult } from '../types';

const unknownResult: VerificationResult = {
  doi: '10.1234/test',
  title: 'Test paper',
  vacs: 76,
  verdict: 'Inconclusive',
  breakdown: {
    credibility: 0.8,
    evidence: null,
    reproducibility: null,
    citations: null,
    temporal: 0.9,
  },
  evidence: [],
  rationale: [
    'Citation context is not available (no citation-intent source).',
    'Reproducibility is not available (no code/data availability source).',
    'Evidence is not available (no entailment model is integrated).',
  ],
};

describe('formatPercentScore / formatVacs', () => {
  test("unknown values render as 'Not available', never a number or 50%", () => {
    expect(formatPercentScore(null)).toBe(NOT_AVAILABLE);
    expect(formatPercentScore(undefined)).toBe(NOT_AVAILABLE);
    expect(formatPercentScore(Number.NaN)).toBe(NOT_AVAILABLE);
    expect(formatVacs(null)).toBe(NOT_AVAILABLE);
    expect(formatPercentScore(0.5)).toBe('50%');
    expect(formatPercentScore(0)).toBe('0%');
    expect(formatVacs(76)).toBe('76');
  });
});

describe('Verification UI', () => {
  test("unknown citation, reproducibility and evidence scores render 'Not available'", () => {
    const html = renderToStaticMarkup(<VerificationResultView result={unknownResult} />);
    expect(html).toContain('Citation Context');
    expect(html).toContain('Reproducibility');
    expect(html).toContain('Evidence');
    expect(html).toContain(NOT_AVAILABLE);
    expect(html).toContain('Citation context is not available');
    // Known scores still show as percents.
    expect(html).toContain('80%');
    expect(html).toContain('90%');
    // The unknown bars must not show a fabricated 50% or 70%.
    const citationBlock = html.split('Citation Context')[1].split('Temporal')[0];
    expect(citationBlock).toContain(NOT_AVAILABLE);
    expect(citationBlock).not.toMatch(/50%|70%|5%/);
  });

  test("BreakdownBar shows 'Not available' when the score is null", () => {
    const html = renderToStaticMarkup(<BreakdownBar label="Citation Context" score={null} />);
    expect(html).toContain('Citation Context');
    expect(html).toContain(NOT_AVAILABLE);
    expect(html).not.toMatch(/50%|70%|0%/);
  });

  test("VacsScoreBadge shows 'Not available' when vacs is null", () => {
    const badge = renderToStaticMarkup(
      <VacsScoreBadge verificationResult={{ ...unknownResult, vacs: null }} />
    );
    expect(badge).toContain(NOT_AVAILABLE);
    expect(badge).not.toMatch(/>50</);
  });
});
