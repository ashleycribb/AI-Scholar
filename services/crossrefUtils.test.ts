import { describe, it, expect } from 'bun:test';
import {
    normalizeString,
    checkAuthorMatch,
    getCrossrefBibliographicUrl,
    getCrossrefTitleAuthorUrl,
    getCrossrefCslUrl,
    CROSSREF_API_BASE
} from './crossrefUtils';

describe('crossrefUtils', () => {
    describe('normalizeString', () => {
        it('should lowercase and remove non-alphanumeric characters', () => {
            expect(normalizeString('Hello World!')).toBe('helloworld');
            expect(normalizeString('A.B. Author')).toBe('abauthor');
            expect(normalizeString('Title: Part 2')).toBe('titlepart2');
        });
    });

    describe('checkAuthorMatch', () => {
        it('should return false if crossref authors list is empty', () => {
            expect(checkAuthorMatch('Smith, John', [])).toBe(false);
        });

        it('should match exact family name', () => {
            const paperAuthors = 'Smith, John';
            const crossrefAuthors = [{ family: 'Smith', given: 'John' }];
            // @ts-ignore
            expect(checkAuthorMatch(paperAuthors, crossrefAuthors)).toBe(true);
        });

        it('should match case insensitive', () => {
            const paperAuthors = 'Smith, John';
            const crossrefAuthors = [{ family: 'smith', given: 'john' }];
            // @ts-ignore
            expect(checkAuthorMatch(paperAuthors, crossrefAuthors)).toBe(true);
        });

        it('should match if full name contains last name', () => {
            const paperAuthors = 'Doe, Jane';
            const crossrefAuthors = [{ name: 'Jane Doe' }]; // name property instead of family
            // @ts-ignore
            expect(checkAuthorMatch(paperAuthors, crossrefAuthors)).toBe(true);
        });

        it('should return false if no match found', () => {
            const paperAuthors = 'Smith, John';
            const crossrefAuthors = [{ family: 'Doe', given: 'Jane' }];
            // @ts-ignore
            expect(checkAuthorMatch(paperAuthors, crossrefAuthors)).toBe(false);
        });

        it('should handle complex author strings', () => {
            const paperAuthors = 'Van der Waals, Johannes';
            // Logic extracts last word of first comma-separated part: 'Waals' (lowercased)
            const crossrefAuthors = [{ family: 'Waals' }];
            // @ts-ignore
            expect(checkAuthorMatch(paperAuthors, crossrefAuthors)).toBe(true);
        });
    });

    describe('URL Builders', () => {
        it('should build bibliographic URL correctly', () => {
            const title = 'My Research Paper';
            const url = getCrossrefBibliographicUrl(title);
            expect(url).toBe(`${CROSSREF_API_BASE}?query.bibliographic=My%20Research%20Paper&rows=3`);
        });

        it('should build bibliographic URL with custom rows', () => {
            const title = 'My Research Paper';
            const url = getCrossrefBibliographicUrl(title, 5);
            expect(url).toBe(`${CROSSREF_API_BASE}?query.bibliographic=My%20Research%20Paper&rows=5`);
        });

        it('should build title author URL correctly', () => {
            const title = 'My Research Paper';
            const author = 'Smith';
            const url = getCrossrefTitleAuthorUrl(title, author);
            expect(url).toBe(`${CROSSREF_API_BASE}?query.title=My%20Research%20Paper&query.author=Smith&rows=1&select=DOI,title,author`);
        });

        it('should build CSL URL correctly', () => {
            const doi = '10.1038/nature12345';
            const url = getCrossrefCslUrl(doi);
            expect(url).toBe(`${CROSSREF_API_BASE}/10.1038%2Fnature12345/transform/application/vnd.citationstyles.csl+json`);
        });
    });
});
