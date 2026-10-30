import { afterEach, describe, expect, test } from 'bun:test';
import { listenForExtensionMessages } from './extensionService';
import {
    MAX_PAPERS_PER_MESSAGE,
    parseExtensionMessage,
    parsePopupMessage,
    parseWebAppMessage,
} from './extensionMessages';
import type { ResearchPaper } from '../types';

const CHANNEL_NAME = 'ai_research_explorer_channel';

const validPaper = (over: Record<string, unknown> = {}) => ({
    id: 'doi:10.1/abc',
    title: 'A Paper',
    authors: 'A. Author',
    year: 2024,
    abstract: 'Abstract text',
    sourceURL: 'https://example.org/p',
    ...over,
});

describe('parseExtensionMessage (pure validation)', () => {
    test('accepts a valid saved-paper message and keeps extra fields', () => {
        const msg = parseExtensionMessage({
            type: 'paper_saved_to_workspace',
            paper: validPaper({ savedAt: 1, doi: '10.1/abc' }),
        });
        expect(msg?.type).toBe('paper_saved_to_workspace');
        expect((msg as any).paper.doi).toBe('10.1/abc');
        expect((msg as any).paper.savedAt).toBe(1);
    });

    test('accepts paper_removed and all_papers_response', () => {
        expect(parseExtensionMessage({ type: 'paper_removed', paperId: 'x' })).toEqual({
            type: 'paper_removed',
            paperId: 'x',
        });
        const msg = parseExtensionMessage({ type: 'all_papers_response', papers: [validPaper()] });
        expect(msg?.type).toBe('all_papers_response');
    });

    const malformed: Array<[string, unknown]> = [
        ['null', null],
        ['undefined', undefined],
        ['string', 'paper_removed'],
        ['number', 42],
        ['array', []],
        ['empty object', {}],
        ['unknown type', { type: 'rm_rf', paperId: 'x' }],
        ['non-string type', { type: { toString: 'x' } }],
        ['saved without paper', { type: 'paper_saved_to_workspace' }],
        ['paper is string', { type: 'paper_saved_to_workspace', paper: 'x' }],
        ['paper missing id', { type: 'paper_saved_to_workspace', paper: validPaper({ id: undefined }) }],
        ['paper id wrong type', { type: 'paper_saved_to_workspace', paper: validPaper({ id: 123 }) }],
        ['paper empty id', { type: 'paper_saved_to_workspace', paper: validPaper({ id: '' }) }],
        ['paper missing title', { type: 'paper_saved_to_workspace', paper: validPaper({ title: undefined }) }],
        ['paper authors array', { type: 'paper_saved_to_workspace', paper: validPaper({ authors: ['a'] }) }],
        ['paper oversized abstract', { type: 'paper_saved_to_workspace', paper: validPaper({ abstract: 'a'.repeat(50_001) }) }],
        ['paper oversized id', { type: 'paper_saved_to_workspace', paper: validPaper({ id: 'a'.repeat(513) }) }],
        ['removed non-string id', { type: 'paper_removed', paperId: { $ne: 1 } }],
        ['removed empty id', { type: 'paper_removed', paperId: '' }],
        ['all_papers not array', { type: 'all_papers_response', papers: 'nope' }],
        ['all_papers with bad element', { type: 'all_papers_response', papers: [validPaper(), { id: 1 }] }],
        [
            'all_papers too many',
            { type: 'all_papers_response', papers: Array.from({ length: MAX_PAPERS_PER_MESSAGE + 1 }, (_, i) => validPaper({ id: `p${i}` })) },
        ],
    ];
    for (const [name, data] of malformed) {
        test(`rejects ${name}`, () => {
            expect(parseExtensionMessage(data)).toBeNull();
            expect(({} as any).polluted).toBeUndefined();
        });
    }

    test('a __proto__ key in the payload is dropped and does not pollute Object.prototype', () => {
        const data = JSON.parse('{"type":"paper_saved_to_workspace","paper":{"id":"x","title":"t","authors":"a","year":1,"abstract":"b","__proto__":{"polluted":true}}}');
        const msg = parseExtensionMessage(data) as { paper: Record<string, unknown> } | null;
        expect(msg).not.toBeNull();
        expect(({} as any).polluted).toBeUndefined();
        expect((msg!.paper as any).polluted).toBeUndefined();
    });

    test('rejects a message from a different origin', () => {
        const data = { type: 'paper_removed', paperId: 'x' };
        expect(parseExtensionMessage(data, 'https://evil.example', 'https://app.example')).toBeNull();
        expect(parseExtensionMessage(data, 'https://app.example', 'https://app.example')).not.toBeNull();
        // Empty origin is what BroadcastChannel reports in some engines.
        expect(parseExtensionMessage(data, '', 'https://app.example')).not.toBeNull();
    });

    test('strips non-http(s) URLs but keeps the paper', () => {
        for (const bad of ['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd', 'vbscript:x', 'not a url', ' javascript:alert(1)']) {
            const msg = parseExtensionMessage({
                type: 'paper_saved_to_workspace',
                paper: validPaper({ sourceURL: bad, pdfURL: bad }),
            }) as { paper: ResearchPaper } | null;
            expect(msg).not.toBeNull();
            expect(msg!.paper.sourceURL).toBeUndefined();
            expect(msg!.paper.pdfURL).toBeUndefined();
        }
    });

    test('normalises a NaN/garbage year to 0 instead of dropping the paper', () => {
        const msg = parseExtensionMessage({
            type: 'paper_saved_to_workspace',
            paper: validPaper({ year: Number.NaN }),
        }) as { paper: ResearchPaper } | null;
        expect(msg?.paper.year).toBe(0);
    });
});

describe('parseWebAppMessage / parsePopupMessage', () => {
    test('web app messages', () => {
        expect(parseWebAppMessage({ type: 'request_all_papers' })).toEqual({ type: 'request_all_papers' });
        expect(parseWebAppMessage({ type: 'web_app_favorite_toggled', paper: validPaper(), isFavorite: true })?.type).toBe(
            'web_app_favorite_toggled'
        );
        expect(parseWebAppMessage({ type: 'web_app_favorite_toggled', paper: validPaper(), isFavorite: 'yes' })).toBeNull();
        expect(parseWebAppMessage({ type: 'web_app_favorite_toggled', paper: { id: 1 }, isFavorite: true })).toBeNull();
        expect(parseWebAppMessage(null)).toBeNull();
        expect(parseWebAppMessage({ type: 'unknown' })).toBeNull();
    });

    test('popup messages', () => {
        expect(parsePopupMessage({ type: 'paper_saved', paper: validPaper() })?.type).toBe('paper_saved');
        expect(parsePopupMessage({ type: 'paper_removed', paperId: 'x' })?.type).toBe('paper_removed');
        expect(parsePopupMessage({ type: 'paper_saved', paper: null })).toBeNull();
        expect(parsePopupMessage('x')).toBeNull();
    });
});

describe('listenForExtensionMessages over a real BroadcastChannel', () => {
    const cleanups: Array<() => void> = [];
    afterEach(() => {
        while (cleanups.length) cleanups.pop()!();
    });

    const post = async (data: unknown) => {
        const sender = new BroadcastChannel(CHANNEL_NAME);
        sender.postMessage(data);
        await new Promise((r) => setTimeout(r, 100));
        sender.close();
    };

    test('delivers valid messages to the right callbacks', async () => {
        const received: any = { papers: [], removed: [], all: [] };
        cleanups.push(
            listenForExtensionMessages(
                (p) => received.papers.push(p),
                (id) => received.removed.push(id),
                (ps) => received.all.push(ps)
            )
        );
        await post({ type: 'paper_saved_to_workspace', paper: validPaper() });
        await post({ type: 'paper_removed', paperId: 'doi:10.1/abc' });
        await post({ type: 'all_papers_response', papers: [validPaper(), validPaper({ id: 'b' })] });
        expect(received.papers.length).toBe(1);
        expect(received.papers[0].id).toBe('doi:10.1/abc');
        expect(received.removed).toEqual(['doi:10.1/abc']);
        expect(received.all[0].length).toBe(2);
    });

    test('drops malformed messages without calling back or throwing', async () => {
        let calls = 0;
        const bump = () => {
            calls++;
        };
        cleanups.push(listenForExtensionMessages(bump, bump, bump));
        const bad: unknown[] = [
            null,
            'string',
            42,
            {},
            { type: 'paper_saved_to_workspace' },
            { type: 'paper_saved_to_workspace', paper: { id: 123 } },
            { type: 'paper_removed', paperId: 5 },
            { type: 'all_papers_response', papers: [{ nope: true }] },
            { type: 'unknown' },
        ];
        for (const data of bad) await post(data);
        expect(calls).toBe(0);
    });
});
