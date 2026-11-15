/**
 * Fix 3: the researcher's own decisions are recorded whether or not they joined a study. Consent gates only
 * study statements; unknown verbs throw instead of being recorded as 'experienced'.
 */
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import type { ResearchPaper } from '../types';

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

const s3a = await import('./s3aWasmService');
const { getResearchLoggingConsent } = await import('./lrsCredentialsService');
const { recordPaperDecision, researcherEventsFromLog } = await import('./researcherDecisions');
const { getSaveStatus, resetSaveStatus } = await import('./saveStatus');

type LogModule = typeof import('./localWorkspaceLog');
let instance = 0;
/** A fresh copy of the log module (no cached connection): a simulated page reload. */
async function freshLog(): Promise<LogModule> {
  instance += 1;
  return (await import(`./localWorkspaceLog.ts?decisions-reload=${instance}`)) as LogModule;
}

const paper: ResearchPaper = {
  id: 'W2741809807', openalex_id: 'W2741809807', doi: '10.7717/peerj.4375',
  title: 'The state of OA: a large-scale analysis', authors: 'Heather Piwowar, Jason Priem', year: 2018, citations: 900, abstract: 'Open access.',
};

const realAdd = FakeIDBObjectStore.prototype.add;
beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  resetSaveStatus();
  s3a.resetDualSession({ actor_uuid: '018f3a54-629a-7a1a-9f5b-111111111111', agent_uuid: '018f3a54-629a-7a1a-9f5b-222222222222', sessionId: '018f3a54-629a-7a1a-9f5b-333333333333' });
});
afterEach(() => { FakeIDBObjectStore.prototype.add = realAdd; });

describe('consent off', () => {
  test('select + keep a paper, reload: the selection and decision are in the local log and the exports', async () => {
    expect(await getResearchLoggingConsent()).toBe(false);

    // Select, as App.tsx does: queue.add in the local log, then stage it into the S3A session.
    const before = await freshLog();
    await before.appendWorkspaceRecords(before.diffQueue([], [paper]));
    const staged = await s3a.writePaperToScholarPack(paper);
    expect(staged.tracingEmitted).toBe(false); // no study statement without consent
    expect(await recordPaperDecision(paper.id, 'keep', before.appendWorkspaceRecord)).toBe(true);
    expect(getSaveStatus()['local-decisions'].state).toBe('saved');

    // Reload.
    const after = await freshLog();
    const ws = await after.loadWorkspace();
    expect(ws.queue.map(p => p.id)).toEqual([paper.id]);
    expect(ws.queue[0].researcherScoreDecision).toBe('keep');
    expect(ws.decisions[paper.id].decision).toBe('keep');

    // Export view of the log (researcher_events in the JSON snapshot).
    const events = researcherEventsFromLog(await after.readWorkspaceLog());
    expect(events.map(e => [e.verb, e.paper_id])).toEqual([['selected', paper.id], ['kept', paper.id]]);
    for (const e of events) {
      expect(e.schema).toBe(1);
      expect(e.ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }

    // .s3a export: after the reload the restored queue is restaged (App.tsx does this) and the paper is in tile 12.
    s3a.resetDualSession({ actor_uuid: '018f3a54-629a-7a1a-9f5b-111111111111', agent_uuid: '018f3a54-629a-7a1a-9f5b-222222222222', sessionId: '018f3a54-629a-7a1a-9f5b-444444444444' });
    await s3a.stageQueuePapersInSession(ws.queue);
    const exported = await s3a.exportS3ASession();
    const pack = s3a.readScholarPack(exported.bytes);
    expect(pack.papers.map(p => p.paper_id)).toContain(s3a.hashIri(paper.id));
  });

  test('a deselection is recorded as its own event, not erased', async () => {
    const log = await freshLog();
    await log.appendWorkspaceRecords(log.diffQueue([], [paper]));
    await log.appendWorkspaceRecords(log.diffQueue([paper], []));
    const events = researcherEventsFromLog(await log.readWorkspaceLog());
    expect(events.map(e => e.verb)).toEqual(['selected', 'deselected']);
    expect((await log.loadWorkspace()).queue).toEqual([]);
  });

  test('a decision that cannot be written shows Not saved with Retry', async () => {
    const log = await freshLog();
    FakeIDBObjectStore.prototype.add = function () { throw new DOMException('Quota exceeded', 'QuotaExceededError'); };
    expect(await recordPaperDecision(paper.id, 'drop', log.appendWorkspaceRecord)).toBe(false);
    const st = getSaveStatus()['local-decisions'];
    expect(st.state).toBe('error');
    FakeIDBObjectStore.prototype.add = realAdd;
    st.retry!();
    await new Promise(r => setTimeout(r, 20));
    expect(getSaveStatus()['local-decisions'].state).toBe('saved');
    expect((await log.loadWorkspace()).decisions[paper.id].decision).toBe('drop');
  });
});

describe('unknown verbs fail loudly', () => {
  test('an unknown verb throws, with or without consent, and is never recorded as experienced', async () => {
    await expect(s3a.emitStatement('viewed-log', { id: 'https://example.org/x', name: 'x' })).rejects.toBeInstanceOf(s3a.UnknownVerbError);
    await expect(s3a.emitStatement('made-up-verb', { id: 'https://example.org/x', name: 'x' })).rejects.toThrow(/Unknown xAPI verb "made-up-verb"/);
  });

  test('a known verb without consent records nothing and does not throw', async () => {
    expect(await s3a.emitStatement('viewed', { id: 'https://example.org/x', name: 'x' })).toBe('');
  });

  test('the export mapping rejects record types it does not know', () => {
    expect(() => researcherEventsFromLog([{ type: 'queue.reorder', schemaVersion: 1, recordedAt: '2026-11-15T03:00:00.000Z' } as any])).toThrow(/No export mapping/);
  });
});
