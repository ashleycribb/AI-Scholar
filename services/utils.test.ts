import { describe, it, expect } from 'vitest';
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
            'This': [0],
            'is': [1],
            'a': [2],
            'test': [3],
            '.': [4]
        };
        expect(deinvertAbstract(input)).toBe('This is a test .');
    });

    it('should handle non-contiguous indices by inserting spaces', () => {
        const input = {
            'Word': [0],
            'skipped': [2]
        };
        // index 1 is missing, so it should be empty string, resulting in double space
        expect(deinvertAbstract(input)).toBe('Word  skipped');
    });

    it('should handle words appearing multiple times', () => {
        const input = {
            'test': [0, 2],
            'is': [1]
        };
        expect(deinvertAbstract(input)).toBe('test is test');
    });

    it('should handle large indices', () => {
        const input = {
            'Start': [0],
            'End': [100]
        };
        const result = deinvertAbstract(input);
        expect(result.startsWith('Start')).toBe(true);
        expect(result.endsWith('End')).toBe(true);
        // logic check: array size 101, filled with '' except at 0 and 100.
        // join(' ') adds 100 spaces.
        // 'Start' + 99 spaces + 'End'.
        // Wait, index 0 is Start, index 100 is End.
        // Array length 101.
        // join(' ') puts space between each element.
        // So 100 spaces total.
        // 'Start' + space + '' + space + '' ... + space + 'End'
    });

    it('should handle special characters in keys', () => {
        const input = {
            '@#$': [0],
            '123': [1]
        };
        expect(deinvertAbstract(input)).toBe('@#$ 123');
    });
});
