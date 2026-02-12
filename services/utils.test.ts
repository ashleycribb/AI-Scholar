import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should correctly reconstruct an abstract from a valid inverted index', () => {
        const inverted = {
            "The": [0],
            "quick": [1],
            "brown": [2],
            "fox": [3]
        };
        expect(deinvertAbstract(inverted)).toBe("The quick brown fox");
    });

    it('should handle words appearing multiple times', () => {
        const inverted = {
            "test": [0, 2],
            "is": [1]
        };
        expect(deinvertAbstract(inverted)).toBe("test is test");
    });

    it('should return an empty string for an empty object', () => {
        expect(deinvertAbstract({})).toBe("");
    });

    it('should return an empty string for null input', () => {
        // @ts-ignore
        expect(deinvertAbstract(null)).toBe("");
    });

    it('should return an empty string for undefined input', () => {
        // @ts-ignore
        expect(deinvertAbstract(undefined)).toBe("");
    });
});
