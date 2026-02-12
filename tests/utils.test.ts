import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { deinvertAbstract } from '../services/utils.ts';

describe('deinvertAbstract', () => {
    it('should return empty string for null input', () => {
        // @ts-expect-error Testing null input for robustness
        const result = deinvertAbstract(null);
        assert.strictEqual(result, '');
    });

    it('should return empty string for undefined input', () => {
        // @ts-expect-error Testing undefined input for robustness
        const result = deinvertAbstract(undefined);
        assert.strictEqual(result, '');
    });

    it('should return empty string for empty object input', () => {
        const result = deinvertAbstract({});
        assert.strictEqual(result, '');
    });

    it('should correctly reconstruct abstract from valid inverted index', () => {
        const input = {
            "The": [0],
            "quick": [1],
            "brown": [2],
            "fox": [3]
        };
        const expected = "The quick brown fox";
        const result = deinvertAbstract(input);
        assert.strictEqual(result, expected);
    });

    it('should handle gaps in positions by filling with empty strings', () => {
        const input = {
            "A": [0],
            "C": [2]
        };
        // Implementation fills array with empty strings, so index 1 is "".
        // join(' ') results in "A  C"
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "A  C");
    });
});
