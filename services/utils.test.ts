import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should return an empty string for null or undefined input', () => {
        // @ts-ignore
        expect(deinvertAbstract(null)).toBe('');
        // @ts-ignore
        expect(deinvertAbstract(undefined)).toBe('');
    });

    it('should reconstruct a simple abstract correctly', () => {
        const inverted = {
            "Hello": [0],
            "world": [1]
        };
        expect(deinvertAbstract(inverted)).toBe('Hello world');
    });

    it('should handle words appearing multiple times', () => {
        const inverted = {
            "test": [0, 2],
            "is": [1],
            "a": [3]
        };
        expect(deinvertAbstract(inverted)).toBe('test is test a');
    });

    it('should handle out-of-order keys', () => {
        const inverted = {
            "world": [1],
            "Hello": [0]
        };
        expect(deinvertAbstract(inverted)).toBe('Hello world');
    });

    it('should preserve case', () => {
        const inverted = {
            "Hello": [0],
            "WORLD": [1]
        };
        expect(deinvertAbstract(inverted)).toBe('Hello WORLD');
    });

    it('should handle gaps by filling with spaces', () => {
        // If index 0 is "A" and index 2 is "B", index 1 is empty string -> "A  B"
        const inverted = {
            "A": [0],
            "B": [2]
        };
        expect(deinvertAbstract(inverted)).toBe('A  B');
    });

    it('should handle empty object', () => {
        const inverted = {};
        expect(deinvertAbstract(inverted)).toBe('');
    });
});
