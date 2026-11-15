import 'fake-indexeddb/auto';
import { IDBFactory as FakeIDBFactory, IDBObjectStore as FakeIDBObjectStore } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ResearchPaper } from '../types';
import { NoteSaveStatus, saveNoteLocally, NOTE_NOT_SAVED_LABEL, NOTE_SAVED_LABEL } from '../components/NoteSaveStatus';

type LogModule = typeof import('./localWorkspaceLog');

let instance = 0;
/** A fresh copy of the module, with no cached connection or other module state: a simulated page reload. */
async function freshModule(): Promise<LogModule> {
    instance += 1;
    return (await import(`./localWorkspaceLog.ts?reload=${instance}`)) as LogModule;
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function paper(id: string, title: string): ResearchPaper {
    return { id, title, authors: 'Ada Lovelace', year: 2021, abstract: `Abstract of ${title}.` };
}

const realAdd = FakeIDBObjectStore.prototype.add;

beforeEach(() => {
    // Every test starts with an empty browser profile.
    (globalThis as { indexedDB: IDBFactory }).indexedDB = new FakeIDBFactory() as unknown as IDBFactory;
});

afterEach(() => {
    FakeIDBObjectStore.prototype.add = realAdd;
});

describe('local-first queue and notes (signed out)', () => {
    test('3 papers and the note text come back after a reload', async () => {
        const before = await freshModule();
        const p1 = paper('W1', 'First paper');
        const p2 = paper('W2', 'Second paper');
        const p3 = paper('W3', 'Third paper');

        // The researcher adds papers one at a time, as App.tsx records them.
        let queue: ResearchPaper[] = [];
        for (const p of [p1, p2, p3]) {
            const next = [...queue, p];
            await before.appendWorkspaceRecords(before.diffQueue(queue, next));
            queue = next;
        }

        const noteId = before.noteIdForProject('Doctoral Dissertation');
        const noteText = '# My notes\nAccented: José Müller, 王小明 — keep W2 for chapter 3.';
        const saved = await saveNoteLocally({ noteId, text: noteText, exists: false, lastSavedText: null, append: before.appendWorkspaceRecord });
        expect(saved.state).toBe('saved');

        // Reload: new module state, same browser storage.
        const after = await freshModule();
        expect(after).not.toBe(before);
        const ws = await after.loadWorkspace();
        expect(ws.queue.map(p => p.id)).toEqual(['W1', 'W2', 'W3']);
        expect(ws.queue.map(p => p.title)).toEqual(['First paper', 'Second paper', 'Third paper']);
        expect(ws.notes[noteId]?.text).toBe(noteText);
    });

    test('edits and removals are appended, never overwritten, and replay to current state', async () => {
        const log = await freshModule();
        const p1 = paper('W1', 'First paper');
        const p2 = paper('W2', 'Second paper');
        await log.appendWorkspaceRecords(log.diffQueue([], [p1, p2]));
        await log.appendWorkspaceRecords(log.diffQueue([p1, p2], [p2]));
        const noteId = log.noteIdForProject('P');
        await saveNoteLocally({ noteId, text: 'v1', exists: false, lastSavedText: null, append: log.appendWorkspaceRecord });
        await saveNoteLocally({ noteId, text: 'v2', exists: true, lastSavedText: 'v1', append: log.appendWorkspaceRecord });
        const unchanged = await saveNoteLocally({ noteId, text: 'v2', exists: true, lastSavedText: 'v2', append: log.appendWorkspaceRecord });
        expect(unchanged.state).toBe('unchanged');

        const records = await (await freshModule()).readWorkspaceLog();
        expect(records.map(r => r.type)).toEqual(['queue.add', 'queue.add', 'queue.remove', 'note.created', 'note.edited']);
        const ws = log.rebuildWorkspace(records);
        expect(ws.queue.map(p => p.id)).toEqual(['W2']);
        expect(ws.notes[noteId].text).toBe('v2');
        expect(ws.notes[noteId].createdAt <= ws.notes[noteId].updatedAt).toBe(true);
    });

    test('every record carries schemaVersion and a UTC ISO timestamp', async () => {
        const log = await freshModule();
        await log.appendWorkspaceRecords(log.diffQueue([], [paper('W1', 'A')]));
        await log.appendWorkspaceRecord({ type: 'note.created', noteId: 'notes:x', paperId: 'W1', text: 'about W1' });
        const records = await log.readWorkspaceLog();
        expect(records.length).toBe(2);
        for (const r of records) {
            expect(r.schemaVersion).toBe(log.WORKSPACE_LOG_SCHEMA_VERSION);
            expect(r.schemaVersion).toBe(2);
            expect(r.recordedAt).toMatch(ISO_UTC);
            expect(new Date(r.recordedAt).toISOString()).toBe(r.recordedAt);
            expect(typeof r.seq).toBe('number');
        }
        const add = records[0];
        expect(add.type === 'queue.add' && add.paperId).toBe('W1');
        const note = records[1];
        expect(note.type === 'note.created' && note.paperId).toBe('W1');
    });

    test('transient UI loading flags are not written to the log', async () => {
        const log = await freshModule();
        const p = { ...paper('W1', 'A'), keyConceptsState: 'loading', isLaymanLoading: true } as ResearchPaper;
        const [entry] = log.diffQueue([], [p]);
        expect(entry.type).toBe('queue.add');
        if (entry.type !== 'queue.add') throw new Error('expected queue.add');
        expect('keyConceptsState' in entry.paper).toBe(false);
        expect('isLaymanLoading' in entry.paper).toBe(false);
    });

    test('an unknown schemaVersion fails loudly instead of being guessed at', async () => {
        const log = await freshModule();
        expect(() => log.rebuildWorkspace([{ schemaVersion: 99, type: 'queue.remove', paperId: 'x', origin: 'researcher', recordedAt: new Date().toISOString() } as never])).toThrow(/schemaVersion/);
    });
});

describe('forced IndexedDB write failure', () => {
    function expectNoSavedText(html: string) {
        expect(html).toContain(NOTE_NOT_SAVED_LABEL);
        expect(html).toContain('Retry');
        expect(html).not.toContain(NOTE_SAVED_LABEL);
        // The only "saved" allowed is inside "Not saved".
        expect(html.replaceAll(NOTE_NOT_SAVED_LABEL, '').toLowerCase()).not.toContain('saved');
        expect(html).not.toContain('S3A');
    }

    test('a failed write (store.add throws) shows "Not saved" with Retry and no saved text', async () => {
        const log = await freshModule();
        FakeIDBObjectStore.prototype.add = function () {
            throw new DOMException('Quota exceeded', 'QuotaExceededError');
        } as typeof realAdd;
        const result = await saveNoteLocally({ noteId: 'notes:P', text: 'typed text', exists: false, lastSavedText: null, append: log.appendWorkspaceRecord });
        expect(result.state).toBe('error');
        const html = renderToStaticMarkup(
            <NoteSaveStatus state={result.state === 'error' ? 'error' : 'saved'} exists={false} onSave={() => {}} onRetry={() => {}} />
        );
        expectNoSavedText(html);

        // Nothing was stored, so a reload must not show the note.
        FakeIDBObjectStore.prototype.add = realAdd;
        const ws = await (await freshModule()).loadWorkspace();
        expect(ws.notes['notes:P']).toBeUndefined();
    });

    test('a database that cannot open rejects the save instead of reporting success', async () => {
        (globalThis as { indexedDB: unknown }).indexedDB = {
            open() { throw new DOMException('denied', 'SecurityError'); },
        };
        const log = await freshModule();
        const result = await saveNoteLocally({ noteId: 'notes:P', text: 'typed text', exists: false, lastSavedText: null, append: log.appendWorkspaceRecord });
        expect(result.state).toBe('error');
        await expect(log.appendWorkspaceRecords(log.diffQueue([], [paper('W1', 'A')]))).rejects.toThrow();
        expectNoSavedText(renderToStaticMarkup(<NoteSaveStatus state="error" exists onSave={() => {}} onRetry={() => {}} />));
    });

    test('"saved" appears only for a confirmed save', () => {
        expect(renderToStaticMarkup(<NoteSaveStatus state="saved" exists onSave={() => {}} onRetry={() => {}} />)).toContain(NOTE_SAVED_LABEL);
        for (const state of ['idle', 'saving'] as const) {
            const html = renderToStaticMarkup(<NoteSaveStatus state={state} exists onSave={() => {}} onRetry={() => {}} />);
            expect(html.toLowerCase()).not.toContain('saved');
        }
    });
});

describe('navigator.storage.persist()', () => {
    test('granted, refused, unsupported and throwing are all handled without failing', async () => {
        const log = await freshModule();
        const nav = (storage: unknown) => ({ storage } as Pick<Navigator, 'storage'>);
        expect(await log.requestPersistentStorage(nav({ persisted: async () => false, persist: async () => true }))).toBe('granted');
        expect(await log.requestPersistentStorage(nav({ persisted: async () => true, persist: async () => false }))).toBe('granted');
        expect(await log.requestPersistentStorage(nav({ persisted: async () => false, persist: async () => false }))).toBe('denied');
        expect(await log.requestPersistentStorage(nav(undefined))).toBe('unsupported');
        expect(await log.requestPersistentStorage(undefined)).toBe('unsupported');
        expect(await log.requestPersistentStorage(nav({ persist: async () => { throw new Error('nope'); } }))).toBe('error');
    });
});

describe('no false save claims in the notes UI', () => {
    test('ResearcherWorkspace no longer claims an S3A save or uses the localStorage "persisted" flag', async () => {
        const src = await Bun.file(new URL('../components/ResearcherWorkspace.tsx', import.meta.url)).text();
        expect(src).not.toContain('Note created & saved in S3A');
        expect(src).not.toContain('note_persisted_');
        expect(src).toContain('<NoteSaveStatus');
    });
});
