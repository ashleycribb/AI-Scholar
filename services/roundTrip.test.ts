/**
 * Fix 7: export -> import into an empty profile -> export again gives identical files. Uses recorded OpenAlex and
 * Crossref responses (tests/fixtures/registry) with accented and CJK author names. All text NFC, all times UTC.
 */
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { beforeAll, describe, expect, mock, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import { strFromU8, unzipSync, zipSync } from 'fflate';
import type { ResearchPaper } from '../types';

const wasmModule = require('./wasm/s3a_wasm_snapshot.js');
wasmModule.initSync({ module: fs.readFileSync(path.resolve('public/s3a_wasm_snapshot_bg.wasm')) });
// The engine is bundled (services/wasm); initSync above instantiates the same module the service imports.

const s3a = await import('./s3aWasmService');
const { mapOpenAlexWorkToResearchPaper } = await import('./openalexService');
const { mapCrossrefItemToPaper } = await import('./crossrefService');
const { buildExportBundle, BUNDLE_TEXT_FILES } = await import('./exportBundle');
const { importExportBundle } = await import('./importBundle');
const { addToQueue } = await import('./selectionQueue');
const { withWorkId } = await import('../utils/workIds');
const { isUtcIso } = await import('../utils/nfc');

type LogModule = typeof import('./localWorkspaceLog');
let instance = 0;
/** A new, empty browser profile: its own IndexedDB and a fresh copy of the log module. */
async function newProfile(): Promise<LogModule> {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  instance += 1;
  return (await import(`./localWorkspaceLog.ts?round-trip=${instance}`)) as LogModule;
}

const FIXTURES = path.resolve('tests/fixtures/registry');
const DOIS = ['10.1162/neco.1997.9.8.1735', '10.4992/pacjpa.87.0_ss-039', '10.1038/nmeth.1701'];
const fixture = (kind: 'openalex' | 'crossref', doi: string) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURES, `${kind}-${doi.replace(/\//g, '_')}.json`), 'utf8'));

const NOW = new Date('2026-11-15T04:30:00.000Z');
const nfd = (s: string) => s.normalize('NFD');

let queue: ResearchPaper[];
let zipA: Uint8Array;
let filesA: Record<string, Uint8Array>;
let s3aFile: { filename: string; bytes: Uint8Array };

beforeAll(async () => {
  const fromOpenAlex = DOIS.map(d => withWorkId(mapOpenAlexWorkToResearchPaper(fixture('openalex', d), true)!));
  const fromCrossref = DOIS.map(d => withWorkId(mapCrossrefItemToPaper(fixture('crossref', d).message)));
  // The same three works found in both registries: the queue keeps one entry per work (shared DOI alias).
  queue = addToQueue(addToQueue([], fromOpenAlex).queue, fromCrossref).queue;

  const logA = await newProfile();
  await logA.appendWorkspaceRecords(logA.diffQueue([], queue));
  await logA.appendWorkspaceRecords([
    // Typed in decomposed form (as some keyboards/OSes produce): stored NFC.
    { type: 'note.created', noteId: 'notes:default', paperId: null, text: nfd('Jürgen Schmidhuber, Søren Brunak: compare. 山田先生のデータも確認。') },
    { type: 'note.created', noteId: `note:${queue[1].id}`, paperId: queue[1].id, text: '深層学習と心理学 — 再読する' },
    { type: 'paper.decision', paperId: queue[0].id, decision: 'keep', origin: 'researcher' },
    { type: 'paper.decision', paperId: queue[2].id, decision: 'drop', origin: 'researcher' },
  ]);
  await logA.appendWorkspaceRecords([{ type: 'note.edited', noteId: 'notes:default', paperId: null, text: nfd('Jürgen Schmidhuber, Søren Brunak: compared.') }]);

  s3a.resetDualSession({ actor_uuid: '018f3a54-629a-7a1a-9f5b-111111111111', agent_uuid: '018f3a54-629a-7a1a-9f5b-222222222222', sessionId: '018f3a54-629a-7a1a-9f5b-333333333333' });
  for (const p of queue) await s3a.writePaperToScholarPack(p, { researcherSelected: true, recordInclusionStatement: false });
  s3aFile = await s3a.exportS3ASession({ projectOrSessionName: 'round trip', download: false });

  const recordsA = await logA.readWorkspaceLog();
  const bundleA = await buildExportBundle({ records: recordsA, queue: logA.rebuildWorkspace(recordsA).queue, s3a: s3aFile, now: NOW });
  zipA = bundleA.zip;
  filesA = bundleA.files;
});

describe('round trip through an empty profile', () => {
  test('fixtures map to the expected works with accented and CJK authors', () => {
    expect(queue.map(p => p.id)).toEqual(DOIS.map(d => `doi:${d}`));
    expect(queue[0].authors).toContain('Jürgen Schmidhuber');
    expect(queue[1].authors).toContain('山田');
    expect(queue[2].authors).toContain('Søren Brunak');
  });

  test('export -> import -> export gives byte-identical JSONL, CSV, BibTeX, notes and manifest', async () => {
    const logB = await newProfile();
    expect((await logB.readRawWorkspaceLog()).length).toBe(0);
    const restored = await importExportBundle(zipA, { importRecords: logB.importWorkspaceRecords });
    expect(restored.queue.map(p => p.id)).toEqual(queue.map(p => p.id));

    const recordsB = await logB.readWorkspaceLog();
    const bundleB = await buildExportBundle({ records: recordsB, queue: logB.rebuildWorkspace(recordsB).queue, s3a: s3aFile, now: NOW });
    for (const name of BUNDLE_TEXT_FILES) expect(strFromU8(bundleB.files[name])).toBe(strFromU8(filesA[name]));
    expect(strFromU8(bundleB.files['manifest.sha256'])).toBe(strFromU8(filesA['manifest.sha256']));

    // The rebuilt state is the same too: queue, notes, decisions.
    const a = (await import('./localWorkspaceLog')).rebuildWorkspace(JSON.parse('[' + strFromU8(filesA['events.jsonl']).trim().split('\n').join(',') + ']'));
    const b = logB.rebuildWorkspace(recordsB);
    expect(b.notes).toEqual(a.notes);
    expect(b.decisions).toEqual(a.decisions);
  });

  test('all text is NFC and every timestamp is UTC', () => {
    for (const name of BUNDLE_TEXT_FILES) {
      const text = strFromU8(filesA[name]);
      expect(text).toBe(text.normalize('NFC'));
    }
    const events = strFromU8(filesA['events.jsonl']).trim().split('\n').map(l => JSON.parse(l));
    for (const e of events) expect(isUtcIso(e.recordedAt)).toBe(true);
    const notes = strFromU8(filesA['notes.md']);
    expect(notes).toContain('Jürgen Schmidhuber, Søren Brunak: compared.');
    expect(notes).not.toContain(nfd('Jürgen'));
    const works = strFromU8(filesA['works.jsonl']);
    expect(works).toContain('祐樹 山田');
    expect(works).toContain('Søren Brunak');
  });

  test('import refuses a non-empty profile, a changed file, or a bad timestamp, and writes nothing', async () => {
    const logC = await newProfile();
    await logC.appendWorkspaceRecords([{ type: 'note.created', noteId: 'n', paperId: null, text: 'already here' }]);
    await expect(importExportBundle(zipA, { importRecords: logC.importWorkspaceRecords })).rejects.toThrow(/empty profile/);
    expect((await logC.readRawWorkspaceLog()).length).toBe(1);

    const logD = await newProfile();
    const files = unzipSync(zipA);
    const tampered = zipSync({ ...files, 'events.jsonl': new TextEncoder().encode(strFromU8(files['events.jsonl']).replace('compared', 'COMPARED')) });
    await expect(importExportBundle(tampered, { importRecords: logD.importWorkspaceRecords })).rejects.toThrow(/SHA-256 check \(changed: events\.jsonl\)/);
    expect((await logD.readRawWorkspaceLog()).length).toBe(0);

    const events = strFromU8(files['events.jsonl']).trim().split('\n').map(l => JSON.parse(l));
    events[0].recordedAt = '2026-11-14 23:00:00';
    await expect(logD.importWorkspaceRecords(events)).rejects.toThrow(/UTC recordedAt/);
    expect((await logD.readRawWorkspaceLog()).length).toBe(0);
  });
});
