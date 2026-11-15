/**
 * Fix 5: only facts and human actions are saved; AI output goes to a rebuildable cache that names its model.
 */
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, mock, test } from 'bun:test';
import fs from 'fs';
import path from 'path';
import type { ResearchPaper } from '../types';

const wasmModule = require('./wasm/s3a_wasm_snapshot.js');
wasmModule.initSync({ module: fs.readFileSync(path.resolve('public/s3a_wasm_snapshot_bg.wasm')) });
// The engine is bundled (services/wasm); initSync above instantiates the same module the service imports.

const s3a = await import('./s3aWasmService');
const { readScholarPack } = s3a;
const { paperFacts, nonFactFields, PAPER_FACT_FIELDS } = await import('./paperFacts');
const derived = await import('./derivedCache');
const { semanticScorePapers } = await import('./embeddingService');
const { saveAccountCopy } = await import('./workspaceSaves');
const { buildDiscoveryContract } = await import('./discoveryContract');
const { exportToBibTeX, exportToRIS, exportToCSV } = await import('../utils/sourceExport');
const { generateLaymanSummary } = await import('./geminiService');
const { resetSaveStatus } = await import('./saveStatus');

type LogModule = typeof import('./localWorkspaceLog');
let instance = 0;
async function freshLog(): Promise<LogModule> {
  instance += 1;
  return (await import(`./localWorkspaceLog.ts?facts-reload=${instance}`)) as LogModule;
}

/** Any key that is model output, a check result or UI state. */
const AI_OR_UI_KEY = /score|summary|explanation|highlight|keyConcept|knowledgeGraph|validation|verification|analysis|State$|Loading$|scite|scoreModel|researcherScoreDecision/i;

function keysDeep(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach(x => keysDeep(x, out));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.push(k); keysDeep(x, out); }
  return out;
}

/** A paper as it looks on screen after scoring and a plain-language summary. */
const shown: ResearchPaper = {
  id: 'doi:10.7717/peerj.4375', openalex_id: 'W2741809807', doi: '10.7717/peerj.4375',
  aliases: [{ scheme: 'doi', value: '10.7717/peerj.4375' }, { scheme: 'openalex', value: 'W2741809807' }],
  title: 'The state of OA: a large-scale analysis', authors: 'Heather Piwowar, Jason Priem', year: 2018, citations: 900,
  abstract: 'Open access.', journal: 'PeerJ',
  semanticScore: 87, keywordMatch: 60, rawSemanticSimilarity: 92, rawKeywordScore: 4, rawRecencyScore: 0.4, scoreSource: 'semantic',
  scoreModel: 'BAAI/bge-small-en-v1.5:q8', scoreExplanation: { method: 'x', summary: 'y', inputs: [] } as never,
  semanticHighlights: [{ text: 'Open access.', score: 80 }] as never,
  laymanSummary: 'A plain summary.', laymanSummaryModel: 'gemini-3-flash-preview', isLaymanLoading: false,
  keyConcepts: ['oa'], keyConceptsState: 'loaded', doiState: 'loaded', researcherScoreDecision: 'keep',
};

beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  resetSaveStatus();
});

describe('saved JSON holds facts only', () => {
  test('paperFacts keeps the bibliographic facts and drops every AI / UI field', () => {
    const facts = paperFacts(shown) as Record<string, unknown>;
    expect(facts.title).toBe(shown.title);
    expect(facts.year).toBe(2018);
    expect(facts.doi).toBe('10.7717/peerj.4375');
    expect(keysDeep(facts).filter(k => AI_OR_UI_KEY.test(k))).toEqual([]);
    expect(nonFactFields(facts)).toEqual([]);
    for (const k of Object.keys(facts)) expect(PAPER_FACT_FIELDS as readonly string[]).toContain(k);
  });

  test('a missing year stays missing (no default year), and an invalid one is not saved', () => {
    expect('year' in paperFacts({ ...shown, year: undefined })).toBe(false);
    expect('year' in paperFacts({ ...shown, year: 0 })).toBe(false);
  });

  test('the local log record written for a queue add has no score, summary or *State fields', async () => {
    const log = await freshLog();
    await log.appendWorkspaceRecords(log.diffQueue([], [shown]));
    const raw = await log.readRawWorkspaceLog();
    expect(raw.length).toBe(1);
    expect(raw[0].schemaVersion).toBe(3);
    const stored = JSON.parse(JSON.stringify(raw[0]));
    expect(keysDeep(stored.paper).filter(k => AI_OR_UI_KEY.test(k))).toEqual([]);
    expect(stored.paper.title).toBe(shown.title);
    // The keep decision is a human action: it is a record of its own, not a field on the saved paper.
    await log.appendWorkspaceRecords([{ type: 'paper.decision', paperId: shown.id, decision: 'keep', origin: 'researcher' }]);
    const rebuilt = log.rebuildWorkspace(await log.readWorkspaceLog());
    expect(rebuilt.decisions[shown.id].decision).toBe('keep');
  });

  test('an older v2 record that saved AI output is upcast to facts only (stored record unchanged)', async () => {
    const log = await freshLog();
    const v2 = { schemaVersion: 2, seq: 1, recordedAt: '2026-11-14T22:00:00.000Z', type: 'queue.add', paperId: shown.id, paper: shown, origin: 'researcher' };
    const [up] = log.migrateWorkspaceRecords([v2]);
    expect(up.schemaVersion).toBe(3);
    expect(up.migratedFrom).toBe(2);
    expect(keysDeep((up as { paper: unknown }).paper).filter(k => AI_OR_UI_KEY.test(k))).toEqual([]);
    expect((v2.paper as ResearchPaper).semanticScore).toBe(87);
  });

  test('the server copy document carries schemaVersion and fact-only papers', async () => {
    let sent: any = null;
    const res = await saveAccountCopy({ papers: [shown], projects: [] }, null, { onRetry: () => {} }, {
      put: async (_a, _s, doc) => { sent = JSON.parse(JSON.stringify(doc)); return { etag: '"1"' }; },
    });
    expect(res.state).toBe('saved');
    expect(sent.schemaVersion).toBe(1);
    expect(sent.paperFactsSchemaVersion).toBe(1);
    expect(keysDeep(sent.papers).filter(k => AI_OR_UI_KEY.test(k))).toEqual([]);
    expect(sent.papers[0].title).toBe(shown.title);
    expect(sent.lastModified).toMatch(/Z$/);
  });
});

describe('every AI result names its model', () => {
  test('a derived record without a model is refused', async () => {
    await expect(derived.derivedRecord({ workId: 'x', kind: 'match-score', model: '', input: {}, value: 1 })).rejects.toThrow(derived.MissingModelError);
    await expect(derived.derivedRecord({ workId: 'x', kind: 'plain-language-summary', model: undefined, input: {}, value: 's' })).rejects.toThrow(/does not name the model/);
    await expect(derived.putDerived([{ key: 'k', workId: 'x', kind: 'match-score', model: '', modelRevision: null, inputHash: 'h', createdAt: '', schemaVersion: 1, value: 1 }])).rejects.toThrow(derived.MissingModelError);
  });

  test('meaning-match scores carry the model the server reported, and every cached record names it with an input hash', async () => {
    const papers: ResearchPaper[] = [
      { id: 'doi:10.5555/a', doi: '10.5555/a', title: 'Graph neural networks for molecules', authors: 'A', abstract: 'Molecules and graphs.' },
      { id: 'doi:10.5555/b', doi: '10.5555/b', title: 'Medieval poetry', authors: 'B', abstract: 'Verse and rhyme.' },
    ];
    const embed = async (body: any) => ({
      model: 'test-embedder-v1', provider: 'test', dims: 2,
      query: [1, 0], documents: body.documents.map((d: { text: string }) => (d.text.includes('Graph') ? [1, 0] : [0, 1])),
    });
    let cached: any[] = [];
    let cacheDone!: () => void;
    const wrote = new Promise<void>(r => { cacheDone = r; });
    const out = await semanticScorePapers(papers, 'graph neural networks', { embed, cache: async recs => { cached = recs; cacheDone(); } });
    expect(out).not.toBeNull();
    for (const p of out!) expect(p.scoreModel).toBe('test-embedder-v1');
    await wrote;
    expect(cached.length).toBe(2);
    for (const r of cached) {
      expect(r.model).toBe('test-embedder-v1');
      expect(r.inputHash).toMatch(/^[0-9a-f]{64}$/);
      expect(r.createdAt).toMatch(/Z$/);
      expect('modelRevision' in r).toBe(true);
    }
    // Different input -> different hash (the hash covers what was sent).
    expect(cached[0].inputHash).not.toBe(cached[1].inputHash);
    // Real input changes output: the on-topic paper scores higher.
    expect(out![0].semanticScore!).toBeGreaterThan(out![1].semanticScore!);
  });

  test('a meaning match from a server that names no model is not used', async () => {
    const embed = async (body: any) => ({ model: '', provider: 'x', dims: 1, query: [1], documents: body.documents.map(() => [1]) });
    const out = await semanticScorePapers([{ id: 'a', title: 't', authors: '', abstract: 'a' }], 'q', { embed, cache: async () => {} });
    expect(out).toBeNull();
  });

  test('derived records are stored in and read back from their own database', async () => {
    const rec = await derived.derivedRecord({ workId: 'doi:10.5555/a', kind: 'plain-language-summary', model: 'm-1', modelRevision: 'm-1-001', input: { prompt: 'p' }, value: 'text' });
    expect(await derived.putDerived([rec])).toBe(1);
    const back = await derived.readDerived({ workId: 'doi:10.5555/a' });
    expect(back).toEqual([rec]);
    expect(back[0].inputHash).toBe(await derived.inputHash({ prompt: 'p' }));
  });

  test('a plain-language summary is labelled with the model the server says answered; an empty answer throws', async () => {
    const realFetch = globalThis.fetch;
    try {
      globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'Simple words.' }] } }], modelVersion: 'gemini-3-flash-preview-11-2026' }), {
        status: 200, headers: { 'Content-Type': 'application/json', 'X-LLM-Provider': 'gemini', 'X-LLM-Model': 'gemini-3-flash-preview' },
      })) as typeof fetch;
      const r = await generateLaymanSummary(shown);
      expect(r.text).toBe('Simple words.');
      expect(r.model).toBe('gemini-3-flash-preview');
      expect(r.modelRevision).toBe('gemini-3-flash-preview-11-2026');
      expect(r.input.prompt).toContain(shown.abstract);

      globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'x' }] } }] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
      expect((await generateLaymanSummary(shown)).model).toMatch(/requested; server did not confirm/);

      globalThis.fetch = (async () => new Response(JSON.stringify({ candidates: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
      await expect(generateLaymanSummary(shown)).rejects.toThrow(/no plain-language summary/);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe('labels come only from real data', () => {
  test('the discovery snapshot has no hardcoded model or approval and lists only models that really ran', () => {
    const plain: ResearchPaper = { id: 'doi:10.5555/x', doi: '10.5555/x', title: 'No year here', authors: 'Zoë Ångström', abstract: '' };
    const c = buildDiscoveryContract({ papers: [shown, plain], researcherEvents: [], query: 'oa', querySettings: {}, services: [], appUrl: 'http://localhost', snapshotId: 's1' });
    const json = JSON.stringify(c);
    expect(json).not.toContain('gemini-flash');
    expect(json).not.toContain('researcher_approved');
    expect(c.provenance.models_used).toEqual([
      { task: 'match-score', model: 'BAAI/bge-small-en-v1.5:q8', work_ids: [shown.id] },
      { task: 'plain-language-summary', model: 'gemini-3-flash-preview', work_ids: [shown.id] },
    ]);
    const none = buildDiscoveryContract({ papers: [plain], researcherEvents: [], query: 'q', querySettings: {}, services: [], appUrl: '', snapshotId: 's2' });
    expect(none.provenance.models_used).toEqual([]);
    expect(none.papers[0].year).toBeNull();
    expect(none.papers[0].openalex_id).toBeNull();
    expect(none.papers[0].source_service).toBeNull();
    expect(c.papers[0].openalex_id).toBe('W2741809807');
    expect(keysDeep(c.papers).filter(k => AI_OR_UI_KEY.test(k))).toEqual([]);
  });

  test('exports never invent a year (no 2024), author or OpenAlex link', () => {
    const plain: ResearchPaper = { id: 'doi:10.5555/x', doi: '10.5555/x', title: 'No year here', authors: '', abstract: '' };
    const bib = exportToBibTeX([plain]);
    expect(bib).not.toMatch(/year\s*=/);
    expect(bib).not.toContain('2024');
    expect(bib).not.toMatch(/author\s*=/);
    expect(bib).not.toContain('openalex.org');
    expect(bib).toContain('doi = {10.5555/x}');
    expect(exportToRIS([plain])).not.toMatch(/^PY {2}-/m);
    expect(exportToCSV([plain]).split('\n')[1]).not.toContain('2024');
    expect(exportToBibTeX([shown])).toContain('year = {2018}');
  });

  test('the .s3a paper flags: researcher approval only when selected, OpenAlex only with a real OpenAlex id', async () => {
    s3a.resetDualSession({ actor_uuid: '018f3a54-629a-7a1a-9f5b-111111111111', agent_uuid: '018f3a54-629a-7a1a-9f5b-222222222222', sessionId: '018f3a54-629a-7a1a-9f5b-333333333333' });
    const doiOnly: ResearchPaper = { id: 'doi:10.5555/only', doi: '10.5555/only', title: 'Crossref only', authors: 'C', abstract: '', enrichmentSource: 'Crossref' };
    await s3a.writePaperToScholarPack(doiOnly, { recordInclusionStatement: false });
    await s3a.writePaperToScholarPack(shown, { recordInclusionStatement: false, researcherSelected: true });
    const parsed = readScholarPack((await s3a.exportS3ASession()).bytes);
    expect(parsed.papers.length).toBe(2);
    const [a, b] = parsed.papers.map(p => Number(p.flags));
    expect(a & s3a.ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED).toBe(0);
    expect(a & s3a.ACADEMIC_PAPER_FLAGS.SOURCE_OPENALEX).toBe(0);
    expect(a & s3a.ACADEMIC_PAPER_FLAGS.SOURCE_CROSSREF).toBe(s3a.ACADEMIC_PAPER_FLAGS.SOURCE_CROSSREF);
    expect(b & s3a.ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED).toBe(s3a.ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED);
    expect(b & s3a.ACADEMIC_PAPER_FLAGS.SOURCE_OPENALEX).toBe(s3a.ACADEMIC_PAPER_FLAGS.SOURCE_OPENALEX);
  });
});


