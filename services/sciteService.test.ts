import { afterEach, describe, expect, test } from 'bun:test';
import { sciteService } from './sciteService';

const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });

describe('sciteService', () => {
  test('does not treat missing supporting/contrasting fields as 0', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ doi: '10.1234/test', mentioning: 3, total: 3 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
    expect(await sciteService.getTally('10.1234/test')).toBeNull();
  });

  test('keeps a real 0 supporting count', async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({
      doi: '10.1234/test', supporting: 0, contrasting: 2, mentioning: 1, total: 3,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    const tally = await sciteService.getTally('10.1234/test');
    expect(tally).toEqual({
      doi: '10.1234/test',
      supporting: 0,
      contrasting: 2,
      mentioning: 1,
      total: 3,
    });
  });
});
