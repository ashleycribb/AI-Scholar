/**
 * Fix 6: the open export bundle. Checksums verify, and every queued paper appears in works.jsonl, references.bib
 * and the engine-written .s3a.
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
mock.module('https://cdn.jsdelivr.net/gh/ashleycribb/s3a-wasm-dist@v0.1.56/v0.1.56/s3a_wasm_snapshot.js', () => ({
  default: async () => {},
  WasmAgentSnapshot: wasmModule.WasmAgentSnapshot,
  new_session: wasmModule.new_session,
  from_bytes: wasmModule.from_bytes,
  iri_for_verb_id: wasmModule.iri_for_verb_id,
  verb_id_for_iri: wasmModule.verb_id_for_iri,
}));

const s3a = await import('./s3aWasmService');
const log = (await import('./localWorkspaceLog.ts?export-bundle=1')) as typeof import('./localWorkspaceLog');
const { createExportBundle } = await import('./exportBundleDownload');
const { verifyExportBundle, MANIFEST_FILE, sha256Bytes } = await import('./exportBundle');
const { scholarPackPaperKey } = await import('../utils/scholarPackKey');

const queue: ResearchPaper[] = [
  { id: 'doi:10.7717/peerj.4375', doi: '10.7717/peerj.4375', openalex_id: 'W2741809807', title: 'The state of OA: a large-scale analysis', authors: 'Heather Piwowar, Jason Priem', year: 2018, citations: 900, abstract: 'Open access.', journal: 'PeerJ' },
  { id: 'arxiv:1706.03762', arxivId: '1706.03762', title: 'Attention Is All You Need', authors: 'Ashish Vaswani, Noam Shazeer', year: 2017, abstract: 'Transformers.' },
  // Accented and CJK names, no year, DOI only: nothing may be invented for it.
  { id: 'doi:10.5555/zoe.2026', doi: '10.5555/zoe.2026', title: 'Études sur 学習', authors: 'Zoë Ångström, 山田 太郎', abstract: '' },
];

let bundle: Awaited<ReturnType<typeof createExportBundle>>;
const NOW = new Date('2026-11-15T04:00:00.000Z');

beforeAll(async () => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  s3a.resetDualSession({ actor_uuid: '018f3a54-629a-7a1a-9f5b-111111111111', agent_uuid: '018f3a54-629a-7a1a-9f5b-222222222222', sessionId: '018f3a54-629a-7a1a-9f5b-333333333333' });
  // What the app does when the researcher adds papers: stage in the engine session and append to the local log.
  for (const p of queue) await s3a.writePaperToScholarPack(p, { researcherSelected: true, recordInclusionStatement: false });
  await log.appendWorkspaceRecords(log.diffQueue([], queue));
  await log.appendWorkspaceRecords([
    { type: 'note.created', noteId: 'notes:default', paperId: null, text: 'Compare OA rates by field.' },
    { type: 'note.created', noteId: 'note:zoe', paperId: queue[2].id, text: 'Zoë: check the 学習 corpus.' },
    { type: 'paper.decision', paperId: queue[0].id, decision: 'keep', origin: 'researcher' },
  ]);
  bundle = await createExportBundle({ queue, query: 'open access', fileName: 'oa study', now: NOW }, { readLog: log.readWorkspaceLog });
});

describe('export bundle', () => {
  test('contains the .s3a, the six text files and a SHA-256 manifest', () => {
    const names = Object.keys(unzipSync(bundle.zip)).sort();
    const s3aName = names.find(n => n.endsWith('.s3a'));
    expect(s3aName).toBeDefined();
    expect(names).toEqual([s3aName!, MANIFEST_FILE, 'SCHEMA.md', 'aliases.csv', 'events.jsonl', 'notes.md', 'references.bib', 'works.jsonl'].sort());
    expect(bundle.filename).toMatch(/^scholar-oa-study-\d{4}-\d{2}-\d{2}-export\.zip$/);
  });

  test('checksums verify, and a changed byte is caught', async () => {
    const check = await verifyExportBundle(bundle.zip);
    expect(check).toMatchObject({ ok: true, mismatched: [], missing: [], unlisted: [] });
    const manifest = strFromU8(check.files[MANIFEST_FILE]).trim().split('\n');
    expect(manifest.length).toBe(7);
    for (const line of manifest) {
      const [hash, name] = line.split('  ');
      expect(await sha256Bytes(check.files[name])).toBe(hash);
    }
    const tampered = { ...check.files, 'works.jsonl': new TextEncoder().encode(strFromU8(check.files['works.jsonl']).replace('PeerJ', 'Nature')) };
    const bad = await verifyExportBundle(zipSync(tampered));
    expect(bad.ok).toBe(false);
    expect(bad.mismatched).toEqual(['works.jsonl']);
  });

  test('every queued paper appears in works.jsonl, references.bib and the .s3a', () => {
    const files = unzipSync(bundle.zip);
    const works = strFromU8(files['works.jsonl']).trim().split('\n').map(l => JSON.parse(l));
    expect(works.map(w => w.work_id)).toEqual(queue.map(p => p.id));
    expect(works[2].authors).toBe('Zoë Ångström, 山田 太郎');
    expect('year' in works[2]).toBe(false);

    const bib = strFromU8(files['references.bib']);
    for (const p of queue) expect(bib).toContain(`@article{${p.id.replace(/[^A-Za-z0-9:_-]/g, '_')},`);
    expect(bib).toContain('title = {Études sur 学習}');
    expect(bib.match(/year = /g)?.length).toBe(2);

    const s3aName = Object.keys(files).find(n => n.endsWith('.s3a'))!;
    // The engine itself must load the file.
    expect(() => s3a.parseParticipantSnapshot(files[s3aName])).not.toThrow();
    const pack = s3a.readScholarPack(files[s3aName]);
    const ids = new Set(pack.papers.map(p => p.paper_id));
    for (const w of works) {
      expect(w.s3a_paper_key).toBe(scholarPackPaperKey(queue.find(p => p.id === w.work_id)!).key);
      expect(ids.has(s3a.hashIri(w.s3a_paper_key))).toBe(true);
    }
    // Restaging the queue for export does not duplicate papers already staged when they were added.
    expect(pack.papers.length).toBe(queue.length);
  });

  test('events, aliases and notes are complete, NFC and UTC', () => {
    const files = unzipSync(bundle.zip);
    const events = strFromU8(files['events.jsonl']).trim().split('\n').map(l => JSON.parse(l));
    expect(events.map(e => e.type)).toEqual(['queue.add', 'queue.add', 'queue.add', 'note.created', 'note.created', 'paper.decision']);
    for (const e of events) {
      expect(e.recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(e.schemaVersion).toBe(log.WORKSPACE_LOG_SCHEMA_VERSION);
    }
    const text = strFromU8(files['events.jsonl']);
    expect(text).toBe(text.normalize('NFC'));

    const aliases = strFromU8(files['aliases.csv']).trim().split('\n');
    expect(aliases[0]).toBe('work_id,scheme,value');
    expect(aliases).toContain('doi:10.7717/peerj.4375,openalex,W2741809807');
    expect(aliases).toContain('arxiv:1706.03762,arxiv,1706.03762');

    const notes = strFromU8(files['notes.md']);
    expect(notes).toContain('Compare OA rates by field.');
    expect(notes).toContain('Zoë: check the 学習 corpus.');
    expect(notes).toContain('Études sur 学習');

    const schema = strFromU8(files['SCHEMA.md']);
    expect(schema).toContain('2026-11-15T04:00:00.000Z');
    expect(schema).toMatch(/no API to store a paper's readable title, authors or abstract/);
  });
});
