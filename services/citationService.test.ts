import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  analyzeCitations,
  citationStatsFromSciteTally,
  UNAVAILABLE_CITATION_STATS,
} from './citationService';
import type { SciteTally } from '../types';

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    return handler(String(input), init);
  }) as typeof fetch;
}

describe('citationStatsFromSciteTally', () => {
  test('uses supporting and contrasting from a real scite tally', () => {
    const tally: SciteTally = {
      doi: '10.1234/test',
      supporting: 10,
      contrasting: 2,
      mentioning: 8,
      total: 20,
    };
    const stats = citationStatsFromSciteTally(tally);
    expect(stats).toEqual({
      total: 20,
      supportCount: 10,
      contradictCount: 2,
      supportRatio: 10 / 12,
      source: 'scite',
    });
  });

  test('ratio is null when both intent counts are 0 (not 0.5)', () => {
    const stats = citationStatsFromSciteTally({
      doi: '10.1234/test',
      supporting: 0,
      contrasting: 0,
      mentioning: 5,
      total: 5,
    });
    expect(stats?.supportRatio).toBeNull();
    expect(stats?.supportCount).toBe(0);
    expect(stats?.contradictCount).toBe(0);
    expect(stats?.source).toBe('scite');
  });

  test('returns null when intent fields are not numbers', () => {
    expect(citationStatsFromSciteTally({ doi: 'x' } as SciteTally)).toBeNull();
  });
});

describe('analyzeCitations', () => {
  test('does not invent 70% supporting or 5% contradicting from a Semantic Scholar total', async () => {
    mockFetch(async (url) => {
      if (url.includes('api.scite.ai')) return jsonResponse(404, { error: 'not found' });
      if (url.includes('api.semanticscholar.org')) return jsonResponse(200, { citationCount: 100 });
      throw new Error(`unexpected fetch: ${url}`);
    });

    const stats = await analyzeCitations('10.1234/test');
    expect(stats.total).toBe(100);
    expect(stats.supportCount).toBeNull();
    expect(stats.contradictCount).toBeNull();
    expect(stats.supportRatio).toBeNull();
    expect(stats.source).toBe('unavailable');
    expect(stats.supportCount).not.toBe(70);
    expect(stats.contradictCount).not.toBe(5);
    expect(stats.supportRatio).not.toBe(0.5);
    expect(stats.supportRatio).not.toBe((70 - 5) / 100);
  });

  test('uses a scite tally already in hand and does not call an intent fabricator', async () => {
    let fetches = 0;
    mockFetch(async () => {
      fetches += 1;
      throw new Error('analyzeCitations should not fetch when a tally is provided');
    });

    const stats = await analyzeCitations('10.1234/test', {
      doi: '10.1234/test',
      supporting: 4,
      contrasting: 1,
      mentioning: 0,
      total: 5,
    });
    expect(fetches).toBe(0);
    expect(stats).toEqual({
      total: 5,
      supportCount: 4,
      contradictCount: 1,
      supportRatio: 4 / 5,
      source: 'scite',
    });
  });

  test('failed fetches return null counts with source unavailable, not zeros and 0.5', async () => {
    mockFetch(async () => {
      throw new Error('network down');
    });
    const stats = await analyzeCitations('10.1234/test');
    expect(stats).toEqual({
      ...UNAVAILABLE_CITATION_STATS,
      total: null,
    });
  });
});

describe('no code path produces 70%/5% intent counts', () => {
  test('citationService source does not scale total by 0.7 or 0.05, or default supportRatio to 0.5', () => {
    const source = readFileSync(join(import.meta.dir, 'citationService.ts'), 'utf8');
    expect(source).not.toMatch(/total\s*\*\s*0\.7/);
    expect(source).not.toMatch(/total\s*\*\s*0\.05/);
    expect(source).not.toMatch(/supportRatio:\s*0\.5/);
    expect(source).not.toMatch(/supportRatio:\s*total\s*===\s*0\s*\?\s*0\.5/);
    expect(source).not.toMatch(/Math\.round\(\s*total\s*\*/);
  });

  test('scoringService no longer defaults supportRatio to 0.5', () => {
    const source = readFileSync(join(import.meta.dir, 'scoringService.ts'), 'utf8');
    expect(source).not.toMatch(/supportRatio\s*\?\?\s*0\.5/);
  });

  test('metadataService no longer assigns a placeholder reproducibility of 0.5', () => {
    const source = readFileSync(join(import.meta.dir, 'metadataService.ts'), 'utf8');
    expect(source).not.toMatch(/reproducibilityScore:\s*0\.5/);
  });

  test('entailmentService no longer invents a keyword-match confidence', () => {
    const source = readFileSync(join(import.meta.dir, 'entailmentService.ts'), 'utf8');
    expect(source).not.toMatch(/0\.85/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).toContain("source: 'unavailable'");
  });
});
