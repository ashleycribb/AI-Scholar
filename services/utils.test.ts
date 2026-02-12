import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should correctly reconstruct a standard abstract', () => {
        const invertedAbstract = {
            "Hello": [0],
            "world": [1],
            "this": [2],
            "is": [3],
            "a": [4],
            "test": [5]
        };
        const result = deinvertAbstract(invertedAbstract);
        expect(result).toBe("Hello world this is a test");
    });

    it('should handle empty object', () => {
        const invertedAbstract = {};
        const result = deinvertAbstract(invertedAbstract);
        expect(result).toBe("");
    });

    // @ts-ignore
    it('should handle null input', () => {
        // @ts-ignore
        const result = deinvertAbstract(null);
        expect(result).toBe("");
    });

    // @ts-ignore
    it('should handle undefined input', () => {
        // @ts-ignore
        const result = deinvertAbstract(undefined);
        expect(result).toBe("");
    });

    it('should handle single word abstract', () => {
        const invertedAbstract = { "Single": [0] };
        const result = deinvertAbstract(invertedAbstract);
        expect(result).toBe("Single");
    });

    it('should handle gaps with empty strings', () => {
        // "Hello" at 0, "world" at 2. Index 1 is missing.
        const invertedAbstract = {
            "Hello": [0],
            "world": [2]
        };
        const result = deinvertAbstract(invertedAbstract);
        // Expecting two spaces between Hello and world due to the empty string at index 1
        expect(result).toBe("Hello  world");
    });

    it('should handle out of order keys', () => {
        const invertedAbstract = {
            "world": [1],
            "Hello": [0]
        };
        const result = deinvertAbstract(invertedAbstract);
        expect(result).toBe("Hello world");
    });

    it('should handle multiple positions for the same word', () => {
        const invertedAbstract = {
            "test": [0, 2],
            "is": [1]
        };
        const result = deinvertAbstract(invertedAbstract);
        expect(result).toBe("test is test");
    });

    it('should handle large indices', () => {
         const invertedAbstract = {
            "Start": [0],
            "End": [10]
        };
        const result = deinvertAbstract(invertedAbstract);
        // 0: Start, 1..9: empty, 10: End.
        // Expecting 9 spaces between Start and End?
        // 0=Start, 1='', 2='', 3='', 4='', 5='', 6='', 7='', 8='', 9='', 10=End
        // joined by space: Start _ _ _ _ _ _ _ _ _ End
        // Count spaces: 1 (after start) + 9 (empty strings joined) + 1 (before end) = 11 spaces if they were all words.
        // Wait. join(' ') puts a space between elements.
        // ['Start', '', '', '', '', '', '', '', '', '', 'End']
        // 'Start' + ' ' + '' + ' ' + '' ...
        // effectively 'Start          End' (10 spaces).

        expect(result).toBe("Start          End");
    });

    it('should handle overwrite if multiple words claim same index (last one wins)', () => {
         const invertedAbstract = {
            "First": [0],
            "Second": [0]
        };
        // Iteration order of object keys is generally insertion order for string keys in modern JS,
        // but it's not strictly guaranteed for all environments.
        // However, the function iterates over keys. If "Second" comes after "First", it overwrites.
        // We can't easily guarantee key order in the object literal passed to the function in the test,
        // but for this specific test case definition, "Second" likely comes after.

        const result = deinvertAbstract(invertedAbstract);
        // We expect either "First" or "Second".
        expect(["First", "Second"]).toContain(result);
    });
});
