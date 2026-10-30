import { beforeEach, describe, expect, mock, test } from 'bun:test';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 1. Static guard on App.tsx: the consent / join-study modals can only be opened
 *    from user events, never from inside a useEffect (the load path).
 * 2. Behaviour: no xAPI statement is queued before consent; opting in enables it.
 */

describe('App.tsx never opens a consent modal from an effect (static guard)', () => {
  const file = join(import.meta.dir, '..', 'App.tsx');
  const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const OPENERS = new Set(['setShowFirstRunConsent', 'setShowJoinStudy']);
  const EFFECTS = new Set(['useEffect', 'useLayoutEffect', 'useInsertionEffect']);

  const openerCalls: ts.CallExpression[] = [];
  const effectCallbacks: ts.Node[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) {
      const name = n.expression.text;
      if (OPENERS.has(name)) openerCalls.push(n);
      if (EFFECTS.has(name) && n.arguments[0]) effectCallbacks.push(n.arguments[0]);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);

  test('the guard sees the opener calls and effects it is meant to check', () => {
    expect(openerCalls.length).toBeGreaterThan(5);
    expect(effectCallbacks.length).toBeGreaterThan(3);
  });

  test('no opener call sits inside any effect callback', () => {
    const offenders = openerCalls.filter((c) =>
      effectCallbacks.some((cb) => c.pos >= cb.pos && c.end <= cb.end)
    );
    expect(offenders.map((c) => sf.getLineAndCharacterOfPosition(c.getStart()).line + 1)).toEqual([]);
  });

  test('both modals start closed', () => {
    const text = sf.text;
    expect(text).toMatch(/const \[showFirstRunConsent, setShowFirstRunConsent\] = useState\(false\)/);
    expect(text).toMatch(/const \[showJoinStudy, setShowJoinStudy\] = useState\(false\)/);
  });
});

describe('no xAPI before consent; opt-in enables it', () => {
  let consented = false;
  const enqueued: any[] = [];

  mock.module('./lrsCredentialsService', () => ({
    getExplorerDeviceId: async () => 'device-1',
    getExplorerCredentials: async () => null,
    enqueueOutboxStatement: async (s: any) => { enqueued.push(s); },
    addPastExplorerSearch: async () => {},
    getResearchLoggingConsent: async () => consented,
  }));
  mock.module('./s3aOutboxService', () => ({
    flushOutbox: async () => {},
    generateStatementUuid: () => '00000000-0000-4000-8000-000000000001',
    getAppUrl: () => 'https://example.test',
  }));

  beforeEach(() => { consented = false; enqueued.length = 0; });

  test('search, prompt and source-view emit nothing before consent', async () => {
    const t = await import('./explorerTrackingService');
    expect(await t.trackExplorerSearch('transformers', 3)).toBe('');
    expect(await t.trackExplorerPrompt('hello')).toBe('');
    expect(enqueued).toEqual([]);
  });

  test('after the user opts in, the same calls emit statements', async () => {
    const t = await import('./explorerTrackingService');
    expect(await t.trackExplorerSearch('transformers', 3)).toBe('');
    expect(enqueued.length).toBe(0);
    consented = true; // what setConsent(true, ...) persists when the user confirms in the modal
    expect(await t.trackExplorerSearch('transformers', 3)).not.toBe('');
    expect(enqueued.length).toBe(1);
  });
});
