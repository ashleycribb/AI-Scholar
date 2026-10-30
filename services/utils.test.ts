import { describe, it, expect } from 'bun:test';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should return an empty string for null input', () => {
        // @ts-ignore
        expect(deinvertAbstract(null)).toBe('');
    });

    it('should return an empty string for undefined input', () => {
        // @ts-ignore
        expect(deinvertAbstract(undefined)).toBe('');
    });

    it('should return an empty string for an empty object', () => {
        expect(deinvertAbstract({})).toBe('');
    });

    it('should correctly reconstruct a simple abstract', () => {
        const input = {
            'Hello': [0],
            'world': [1]
        };
        expect(deinvertAbstract(input)).toBe('Hello world');
    });

    it('should correctly reconstruct an abstract with mixed indices', () => {
        const input = {
            'world': [1],
            'Hello': [0]
        };
        expect(deinvertAbstract(input)).toBe('Hello world');
    });

    it('should handle words appearing multiple times', () => {
        const input = {
            'a': [0, 2],
            'b': [1]
        };
        expect(deinvertAbstract(input)).toBe('a b a');
    });

    it('should handle gaps in indices by filling with spaces', () => {
        // "Hello" at 0, "World" at 2.
        // Array: ["Hello", "", "World"] -> join(" ") -> "Hello  World"
        const input = {
            'Hello': [0],
            'World': [2]
        };
        expect(deinvertAbstract(input)).toBe('Hello  World');
    });

    it('should handle large gaps', () => {
        const input = {
            'Start': [0],
            'End': [5]
        };
        // Array: ["Start", "", "", "", "", "End"] -> join(" ") -> "Start     End"
        expect(deinvertAbstract(input)).toBe('Start     End');
    });

    it('should trim leading spaces if index 0 is missing', () => {
        const input = {
            'World': [2]
        };
        // Array: ["", "", "World"] -> join(" ") -> "  World" -> trim() -> "World"
        expect(deinvertAbstract(input)).toBe('World');
    });
});
