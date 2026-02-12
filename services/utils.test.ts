import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should correctly reconstruct an abstract from a valid inverted index', () => {
        const inverted = {
            'This': [0],
            'is': [1],
            'a': [2],
            'test': [3],
            '.': [4]
        };
        const expected = 'This is a test .';
        expect(deinvertAbstract(inverted)).toBe(expected);
    });

    it('should handle unordered positions correctly', () => {
        const inverted = {
            'test': [3],
            'This': [0],
            '.': [4],
            'is': [1],
            'a': [2]
        };
        const expected = 'This is a test .';
        expect(deinvertAbstract(inverted)).toBe(expected);
    });

    it('should return an empty string for null input', () => {
        // @ts-ignore - explicitly testing null
        expect(deinvertAbstract(null)).toBe('');
    });

    it('should return an empty string for undefined input', () => {
        // @ts-ignore - explicitly testing undefined
        expect(deinvertAbstract(undefined)).toBe('');
    });

    it('should return an empty string for an empty object', () => {
        expect(deinvertAbstract({})).toBe('');
    });

    it('should handle words with multiple positions', () => {
        const inverted = {
            'a': [0, 2],
            'test': [1, 3]
        };
        const expected = 'a test a test';
        expect(deinvertAbstract(inverted)).toBe(expected);
    });

    it('should handle gaps in positions', () => {
         const inverted = {
            'Start': [0],
            'End': [2]
        };
        // Expecting double space because of the empty string at index 1
        expect(deinvertAbstract(inverted)).toBe('Start  End');
    });

    it('should handle empty arrays of positions', () => {
        const inverted = {
            'word': [],
            'other': [0]
        };
        expect(deinvertAbstract(inverted)).toBe('other');
    });
});
