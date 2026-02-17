import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from './utils';

describe('deinvertAbstract', () => {
    it('should return an empty string for null input', () => {
        // @ts-ignore - explicitly testing null
        expect(deinvertAbstract(null)).toBe('');
    });

    it('should return an empty string for undefined input', () => {
        // @ts-ignore - explicitly testing undefined
        expect(deinvertAbstract(undefined)).toBe('');
    });

    it('should return an empty string for empty object', () => {
        expect(deinvertAbstract({})).toBe('');
    });

    it('should reconstruct a simple abstract', () => {
        const input = {
            'Hello': [0],
            'world': [1]
        };
        expect(deinvertAbstract(input)).toBe('Hello world');
    });

    it('should reconstruct a more complex abstract with multiple positions for a word', () => {
        const input = {
            'is': [1, 4],
            'This': [0],
            'a': [2],
            'test': [3],
            '.': [5]
        };
        expect(deinvertAbstract(input)).toBe('This is a test is .');
    });

    it('should handle gaps in indices with empty strings', () => {
        const input = {
            'Start': [0],
            'End': [2]
        };
        // "Start" + " " + "" + " " + "End" -> "Start  End"
        expect(deinvertAbstract(input)).toBe('Start  End');
    });

    it('should handle unordered keys correctly', () => {
        const input = {
            'world': [1],
            'Hello': [0]
        };
        expect(deinvertAbstract(input)).toBe('Hello world');
    });

    it('should handle single word', () => {
        const input = {
            'Word': [0]
        };
        expect(deinvertAbstract(input)).toBe('Word');
    });

    it('should handle large gaps', () => {
        const input = {
            'First': [0],
            'Last': [10]
        };
        // 10 spaces between First and Last
        expect(deinvertAbstract(input)).toBe('First          Last');
    });

    it('should handle non-zero start index', () => {
        const input = {
            'Second': [1]
        };
        // Index 0 is empty. Index 1 is Second.
        // '' + ' ' + 'Second' -> ' Second'. But trim() removes it.
        expect(deinvertAbstract(input)).toBe('Second');
    });
});
