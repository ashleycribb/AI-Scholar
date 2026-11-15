/**
 * Fix 4: one permanent work id plus aliases. The same paper found via Crossref and via OpenAlex is one queue entry,
 * and its id is identical across two searches. Old (v1) local records are migrated on read.
 */
import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import {
  aliasRows, canonicalWorkId, extractAliases, fingerprint, normalizeArxivId, normalizeDoi, normalizeOpenAlexId,
  normalizePmcid, normalizePmid, sameWork, stableRecordId, withWorkId,
} from './workIds';
import { searchCrossref } from '../services/crossrefService';
import { searchOpenAlex } from '../services/openalexService';
import { deduplicatePapers } from '../services/apiService';
import { addToQueue, removeFromQueue } from '../services/selectionQueue';
import type { ResearchPaper } from '../types';

// Response shapes as the Crossref and OpenAlex APIs return them for "The state of OA" (Piwowar et al. 2018).
const crossrefResponse = {
  status: 'ok',
  message: {
    'total-results': 1,
    items: [{
      DOI: '10.7717/PEERJ.4375',
      URL: 'https://doi.org/10.7717/peerj.4375',
      title: ['The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles'],
      author: [{ given: 'Heather', family: 'Piwowar' }, { given: 'Jason', family: 'Priem' }],
      published: { 'date-parts': [[2018, 2, 13]] },
      'container-title': ['PeerJ'],
      'is-referenced-by-count': 1100,
      type: 'journal-article',
      abstract: '<jats:p>Despite growing interest in Open Access (OA) to scholarly literature, there is an unmet need for large-scale, up-to-date, and reproducible studies assessing the prevalence and characteristics of OA.</jats:p>',
    }],
  },
};
const openalexResponse = {
  meta: { count: 1 },
  results: [{
    id: 'https://openalex.org/W2741809807',
    doi: 'https://doi.org/10.7717/peerj.4375',
    title: 'The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles',
    display_name: 'The state of OA: a large-scale analysis of the prevalence and impact of Open Access articles',
    publication_year: 2018,
    cited_by_count: 1200,
    authorships: [{ author: { id: 'https://openalex.org/A5023888391', display_name: 'Heather Piwowar' } }, { author: { id: 'https://openalex.org/A5011358416', display_name: 'Jason Priem' } }],
    abstract_inverted_index: { Despite: [0], growing: [1], interest: [2], in: [3], Open: [4], Access: [5], to: [6], scholarly: [7], literature: [8], there: [9], is: [10], an: [11], unmet: [12], need: [13] },
    primary_location: { source: { display_name: 'PeerJ' } },
    open_access: { is_oa: true },
  }],
};

const realFetch = globalThis.fetch;
function serve(): void {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('crossref')) return new Response(JSON.stringify(crossrefResponse), { status: 200 });
    if (url.includes('openalex')) return new Response(JSON.stringify(openalexResponse), { status: 200 });
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}
beforeEach(() => {
  (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
  try { (globalThis as any).localStorage?.clear?.(); } catch { /* no localStorage */ }
  serve();
});
afterEach(() => { globalThis.fetch = realFetch; });

describe('normalizers (one module for every scheme)', () => {
  test('DOI', () => {
    for (const raw of ['10.7717/PEERJ.4375', 'https://doi.org/10.7717/peerj.4375', 'http://dx.doi.org/10.7717/PeerJ.4375', 'doi:10.7717/peerj.4375', ' 10.7717/peerj.4375 ']) {
      expect(normalizeDoi(raw)).toBe('10.7717/peerj.4375');
    }
    expect(normalizeDoi('not a doi')).toBeNull();
  });
  test('OpenAlex, arXiv, PMID, PMCID', () => {
    expect(normalizeOpenAlexId('https://openalex.org/w2741809807')).toBe('W2741809807');
    expect(normalizeOpenAlexId('openalex:W2741809807')).toBe('W2741809807');
    expect(normalizeArxivId('https://arxiv.org/pdf/2101.00001v3.pdf')).toBe('2101.00001');
    expect(normalizeArxivId('arxiv:hep-th/9901001v1')).toBe('hep-th/9901001');
    expect(normalizePmid('https://pubmed.ncbi.nlm.nih.gov/29456894/')).toBe('29456894');
    expect(normalizePmcid('pmc5815332')).toBe('PMC5815332');
  });
  test('priority: DOI over OpenAlex over arXiv; fingerprint only when nothing else', () => {
    expect(canonicalWorkId({ id: 'W2741809807', doi: 'https://doi.org/10.7717/PEERJ.4375' })).toBe('doi:10.7717/peerj.4375');
    expect(canonicalWorkId({ id: 'W2741809807' })).toBe('openalex:W2741809807');
    expect(canonicalWorkId({ id: 'arxiv:2101.00001v2' })).toBe('arxiv:2101.00001');
    expect(canonicalWorkId({ id: 'core:98765' })).toBe('core:98765');
    const fp = canonicalWorkId({ id: '', title: 'Über Lernanalytik', authors: 'José Müller', year: 2020 });
    expect(fp).toMatch(/^fp:/);
    // NFC: a decomposed "é" gives the same fingerprint as the composed one.
    expect(fingerprint('Über Lernanalytik', 'Jose\u0301 Müller', 2020)).toBe(fingerprint('Über Lernanalytik', 'José Müller', 2020));
  });
  test('no random ids: the same record always gets the same id', () => {
    const a = stableRecordId('gs', undefined, { title: 'Learning analytics dashboards', authors: 'A. Author', year: 2021 });
    const b = stableRecordId('gs', undefined, { title: 'Learning analytics dashboards', authors: 'A. Author', year: 2021 });
    expect(a).toBe(b);
    expect(stableRecordId('gs', undefined, { title: 'A different paper title', authors: 'A. Author', year: 2021 })).not.toBe(a);
    expect(stableRecordId('core', 123, { title: 'x' })).toBe('core:123');
  });
});

describe('the same paper from Crossref and OpenAlex', () => {
  test('is one queue entry, with the same id across two searches', async () => {
    const search = async () => {
      const [cr, oa] = await Promise.all([searchCrossref('state of oa'), searchOpenAlex('state of oa', {} as any)]);
      expect(cr.papers.length).toBe(1);
      expect(oa.papers.length).toBe(1);
      return { cr: cr.papers, oa: oa.papers, merged: deduplicatePapers([...oa.papers, ...cr.papers]) };
    };

    const first = await search();
    expect(first.merged.length).toBe(1);
    const id1 = first.merged[0].id;
    expect(id1).toBe('doi:10.7717/peerj.4375');
    expect(first.merged[0].aliases).toEqual(expect.arrayContaining([
      { scheme: 'doi', value: '10.7717/peerj.4375' }, { scheme: 'openalex', value: 'W2741809807' },
    ]));

    // Queue the Crossref copy from search 1, then the OpenAlex copy from search 2: still one entry.
    let queue: ResearchPaper[] = addToQueue([], first.cr).queue;
    const second = await search();
    queue = addToQueue(queue, second.oa).queue;
    queue = addToQueue(queue, second.merged).queue;
    expect(queue.length).toBe(1);
    expect(queue[0].id).toBe(id1);
    expect(second.merged[0].id).toBe(id1); // stable across searches
    expect(withWorkId(second.cr[0]).id).toBe(id1);
    expect(withWorkId(second.oa[0]).id).toBe(id1);
    expect(sameWork(second.cr[0], second.oa[0])).toBe(true);

    // Deselecting via either copy removes the one entry.
    expect(removeFromQueue(queue, second.oa[0])).toEqual([]);

    const rows = aliasRows(queue);
    expect(rows).toEqual(expect.arrayContaining([
      { work_id: id1, scheme: 'doi', value: '10.7717/peerj.4375' },
      { work_id: id1, scheme: 'openalex', value: 'W2741809807' },
    ]));
  });

  test('different papers stay different', () => {
    const a = withWorkId({ id: 'W1', title: 'Paper A', authors: 'X', year: 2020, abstract: '' });
    const b = withWorkId({ id: 'W2', title: 'Paper B', authors: 'X', year: 2020, abstract: '' });
    expect(addToQueue([], [a, b]).queue.length).toBe(2);
    expect(extractAliases(a as any).map(x => x.value)).toEqual(['W1']);
  });
});

describe('v1 local records are migrated (schemaVersion 1 -> current)', () => {
  test('v1 Crossref + OpenAlex copies rebuild as one entry; removals and decisions follow the new id', async () => {
    const log = await import(`../services/localWorkspaceLog.ts?workids=${Date.now()}`) as typeof import('../services/localWorkspaceLog');
    expect(log.WORKSPACE_LOG_SCHEMA_VERSION).toBe(3);
    const v1 = (seq: number, rec: Record<string, unknown>) => ({ schemaVersion: 1, seq, recordedAt: '2026-11-14T22:00:00.000Z', ...rec });
    const oa = { id: 'W2741809807', openalex_id: 'W2741809807', doi: '10.7717/peerj.4375', title: 'The state of OA', authors: 'Heather Piwowar', year: 2018, abstract: 'x' };
    const cr = { id: 'crossref:10.7717/PEERJ.4375', doi: '10.7717/PEERJ.4375', title: 'The state of OA', authors: 'Heather Piwowar', year: 2018, abstract: 'x' };
    const other = { id: 'W1', title: 'Another paper', authors: 'Y', year: 2020, abstract: 'y' };
    const records = [
      v1(1, { type: 'queue.add', paperId: oa.id, paper: oa, origin: 'researcher' }),
      v1(2, { type: 'queue.add', paperId: cr.id, paper: cr, origin: 'researcher' }),
      v1(3, { type: 'queue.add', paperId: other.id, paper: other, origin: 'researcher' }),
      v1(4, { type: 'note.created', noteId: 'n1', paperId: 'W2741809807', text: 'keep for ch. 3' }),
      v1(5, { type: 'queue.remove', paperId: 'W1', origin: 'researcher' }),
    ];
    const migrated = log.migrateWorkspaceRecords(records);
    expect(migrated.every(r => r.schemaVersion === 3 && r.migratedFrom === 1)).toBe(true);
    expect(migrated.map(r => (r as any).paperId)).toEqual(['doi:10.7717/peerj.4375', 'doi:10.7717/peerj.4375', 'openalex:W1', 'doi:10.7717/peerj.4375', 'openalex:W1']);
    const ws = log.rebuildWorkspace(records as any);
    expect(ws.queue.map(p => p.id)).toEqual(['doi:10.7717/peerj.4375']);
    expect(ws.queue[0].sourceId).toBe('W2741809807');
    expect(ws.notes.n1.paperId).toBe('doi:10.7717/peerj.4375');
    // Stored records are untouched: the input still says version 1.
    expect(records[0].schemaVersion).toBe(1);

    // Stored in IndexedDB as v1 (as fix 1 wrote them), read back upcast; new records are written as v2.
    await log.appendWorkspaceRecords([{ type: 'note.edited', noteId: 'n1', paperId: 'doi:10.7717/peerj.4375', text: 'v2 edit' }]);
    const db: IDBDatabase = await new Promise((res, rej) => { const r = indexedDB.open(log.WORKSPACE_LOG_DB_NAME, log.WORKSPACE_LOG_DB_VERSION); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(log.WORKSPACE_LOG_STORE, 'readwrite');
      records.forEach(r => { const { seq: _s, ...rest } = r as any; tx.objectStore(log.WORKSPACE_LOG_STORE).add(rest); });
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
    db.close();
    const raw = await log.readRawWorkspaceLog();
    expect(raw.map(r => r.schemaVersion)).toEqual([3, 1, 1, 1, 1, 1]);
    const fromDisk = await log.loadWorkspace();
    expect(fromDisk.queue.map(p => p.id)).toEqual(['doi:10.7717/peerj.4375']);
    expect(fromDisk.notes.n1.text).toBe('keep for ch. 3'); // the v1 note was appended after the v2 edit
    expect(() => log.rebuildWorkspace([{ ...records[0], schemaVersion: 4 } as any])).toThrow(/Unsupported workspace log schemaVersion 4/);
  });
});
