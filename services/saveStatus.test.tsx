/**
 * Fix 2 (no silent saves), browser side: forced server and browser-storage failures show "Not saved" with Retry,
 * and no "saved" text appears anywhere until a write confirms.
 */
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

import fs from 'fs';
import path from 'path';

// Same binding as the other S3A tests: the CDN URL resolves to the vendored engine build (hermetic, offline).
const wasmModule = require('./wasm/s3a_wasm_snapshot.js');
wasmModule.initSync({ module: fs.readFileSync(path.resolve('public/s3a_wasm_snapshot_bg.wasm')) });
mock.module('https://cdn.jsdelivr.net/gh/ashleycribb/s3a-wasm-dist@v0.1.56/v0.1.56/s3a_wasm_snapshot.js', () => ({
  default: async () => {},
  WasmAgentSnapshot: wasmModule.WasmAgentSnapshot,
  new_session: wasmModule.new_session,
  from_bytes: wasmModule.from_bytes,
  iri_for_verb_id: wasmModule.iri_for_verb_id,
  verb_id_for_iri: wasmModule.verb_id_for_iri,
}));
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResearchPaper } from '../types';
import { SaveStatusView } from '../components/SaveStatusBanner';
import { failedChannels, getSaveStatus, resetSaveStatus } from './saveStatus';
import { saveAccountCopy, saveQueueChanges } from './workspaceSaves';
import { LrsError } from './lrsClient';
import { loadWorkspace } from './localWorkspaceLog';

const paper = (id: string): ResearchPaper => ({ id, title: `Paper ${id}`, authors: 'Ada Lovelace', year: 2021, abstract: 'x' });
const realAdd = FakeIDBObjectStore.prototype.add;
const realPut = FakeIDBObjectStore.prototype.put;

/** Visible text with the "Not saved" phrase removed: whatever is left must not claim anything was saved. */
const savedClaims = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/Not saved/g, '').match(/\bsaved\b/gi) ?? [];

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  resetSaveStatus();
});
afterEach(() => {
  FakeIDBObjectStore.prototype.add = realAdd;
  FakeIDBObjectStore.prototype.put = realPut;
});

const render = () => renderToStaticMarkup(<SaveStatusView failures={failedChannels(getSaveStatus())} />);

describe('browser storage failure', () => {
  test('a failed IndexedDB write shows Not saved + Retry, and Retry writes it once storage works', async () => {
    FakeIDBObjectStore.prototype.add = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    let retried = 0;
    const result = await saveQueueChanges([], [paper('W1')], () => { retried += 1; });
    expect(result).toBeNull();
    expect(getSaveStatus()['local-queue'].state).toBe('error');
    const html = render();
    expect(html).toContain('Not saved');
    expect(html).toContain('Retry');
    expect(savedClaims(html)).toEqual([]);
    expect((await loadWorkspace()).queue).toEqual([]); // nothing was written

    getSaveStatus()['local-queue'].retry!();
    expect(retried).toBe(1);
    FakeIDBObjectStore.prototype.add = realAdd;
    expect(await saveQueueChanges([], [paper('W1')], () => {})).toBe(1);
    expect(getSaveStatus()['local-queue'].state).toBe('saved');
    expect(render()).toBe(''); // the banner goes away only after the write confirmed
    expect((await loadWorkspace()).queue.map(p => p.id)).toEqual(['W1']);
  });

  test('a failed S3A session cache write is reported, not only logged', async () => {
    const { saveSnapshotToIdbBySessionId } = await import('./s3aWasmService');
    FakeIDBObjectStore.prototype.put = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    await saveSnapshotToIdbBySessionId('0193f0a0-0000-7000-8000-000000000001', new Uint8Array([1, 2, 3]));
    expect(getSaveStatus()['session-cache'].state).toBe('error');
    const html = render();
    expect(html).toContain('Not saved');
    expect(html).toContain('S3A session copy');
    expect(savedClaims(html)).toEqual([]);
    FakeIDBObjectStore.prototype.put = realPut;
    await saveSnapshotToIdbBySessionId('0193f0a0-0000-7000-8000-000000000001', new Uint8Array([1, 2, 3]));
    expect(getSaveStatus()['session-cache'].state).toBe('saved');
  });
});

describe('server failure', () => {
  const payload = { papers: [paper('W1')], projects: [] };

  test('a 500 from the server is Not saved, never saved', async () => {
    const r = await saveAccountCopy(payload, null, { onRetry: () => {} }, { put: async () => { throw new LrsError(500, 'State document was not saved'); } });
    expect(r).toEqual({ state: 'error', status: 500 });
    const html = render();
    expect(html).toContain('Not saved');
    expect(html).toContain('Copy in your account');
    expect(html).toContain('Retry');
    expect(savedClaims(html)).toEqual([]);
  });

  test('a conflict retries with a fresh ETag; an expired sign-in asks to sign in again', async () => {
    let refresh: boolean | null = null;
    await saveAccountCopy(payload, '"old"', { onRetry: r => { refresh = r; } }, { put: async () => { throw new LrsError(409, 'conflict'); } });
    getSaveStatus()['server-copy'].retry!();
    expect(refresh).toBe(true);
    let sentIfMatch: string | null | undefined;
    const ok = await saveAccountCopy(payload, '"old"', { refreshEtag: true, onRetry: () => {} }, {
      get: async () => ({ data: {}, etag: '"current"' }),
      put: async (_a, _s, _d, etag) => { sentIfMatch = etag; return { etag: '"next"' }; },
    });
    expect(sentIfMatch).toBe('"current"');
    expect(ok).toEqual({ state: 'saved', etag: '"next"' });

    await saveAccountCopy(payload, null, { onRetry: () => {} }, { put: async () => { throw new LrsError(401, 'authentication_required'); } });
    expect(getSaveStatus()['server-copy'].message).toContain('Sign in again');
  });

  test('signed out (nothing sent) is neither saved nor an error', async () => {
    const r = await saveAccountCopy(payload, null, { onRetry: () => {} }, { put: async () => ({ etag: null, skipped: true }) });
    expect(r).toEqual({ state: 'skipped' });
    expect(getSaveStatus()['server-copy'].state).toBe('idle');
    expect(render()).toBe('');
  });

  test('putState itself throws on a refused save instead of returning an empty ETag', async () => {
    const { putState } = await import('./lrsClient');
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 })) as unknown as typeof fetch;
    try {
      await expect(putState(undefined, undefined, { papers: [] }, null, { endpoint: 'https://lrs.example.org/xapi/', username: 'u', password: 'p' } as any)).rejects.toMatchObject({ status: 403 });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
