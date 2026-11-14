import { describe, it, expect } from 'bun:test';
import { deinvertAbstract, MAX_ABSTRACT_POSITION, MAX_ABSTRACT_ENTRIES } from './utils';

describe('deinvertAbstract', () => {
    it('should correctly reconstruct a normal abstract', () => {
        const input = {
            "This": [0],
            "is": [1],
            "a": [2],
            "test": [3],
            ".": [4]
        };
        expect(deinvertAbstract(input)).toBe("This is a test .");
    });

    it('should handle empty input', () => {
        expect(deinvertAbstract({})).toBe("");
        // @ts-expect-error intentional invalid input
        expect(deinvertAbstract(null)).toBe("");
        // @ts-expect-error intentional invalid input
        expect(deinvertAbstract(undefined)).toBe("");
    });

    it('should handle sparse/out-of-order input', () => {
        const input = {
            "start": [0],
            "end": [5]
        };
        // array: ["start", "", "", "", "", "end"] -> "start     end"
        expect(deinvertAbstract(input)).toBe("start     end");
    });

    it('should ignore a hostile huge position instead of allocating a giant array', () => {
        const largeIndex = 100000;
        const input = {
            "Normal": [0],
            "Huge": [largeIndex]
        };

        const result = deinvertAbstract(input);
        expect(result).toBe("Normal");
        expect(result.length).toBeLessThan(50_000);
    });

    it('should cap reconstruction at MAX_ABSTRACT_POSITION words', () => {
        const input = {
            "first": [0],
            "last-allowed": [MAX_ABSTRACT_POSITION - 1],
            "too-far": [MAX_ABSTRACT_POSITION],
            "way-too-far": [MAX_ABSTRACT_POSITION + 500]
        };
        const result = deinvertAbstract(input);
        expect(result.startsWith("first")).toBe(true);
        expect(result.endsWith("last-allowed")).toBe(true);
        expect(result.includes("too-far")).toBe(false);
        expect(result.includes("way-too-far")).toBe(false);
        // "first" + (MAX-2) spaces + "last-allowed"
        expect(result.length).toBeLessThan(MAX_ABSTRACT_POSITION + 20);
    });

    it('should skip negative and non-integer positions', () => {
        const input = {
            "keep": [0, 2],
            "negative": [-1, -100],
            "float": [1.5, 3.9],
            "nan": [Number.NaN],
            "inf": [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
            "mid": [1],
        } as { [key: string]: number[] };

        expect(deinvertAbstract(input)).toBe("keep mid keep");
    });

    it('should skip non-array position lists', () => {
        const input = {
            "ok": [0, 2],
            "bad": "not-an-array",
            "also": { 0: 1 },
            "word": [1],
        } as unknown as { [key: string]: number[] };

        expect(deinvertAbstract(input)).toBe("ok word ok");
    });

    it('should cap the total number of entries processed', () => {
        // All of these positions are in range; once the entry cap is hit,
        // a later valid word must be ignored.
        const input: { [key: string]: number[] } = {
            a: Array(MAX_ABSTRACT_ENTRIES).fill(0),
            b: [1],
        };
        const result = deinvertAbstract(input);
        expect(result).toBe("a");
        expect(result.includes("b")).toBe(false);
    });
});
