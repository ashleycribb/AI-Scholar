import { test, describe } from 'node:test';
import assert from 'node:assert';
import { deinvertAbstract } from '../services/utils';

describe('deinvertAbstract', () => {
    test('should reconstruct a simple sentence', () => {
        const input = {
            "Hello": [0],
            "world": [1]
        };
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "Hello world");
    });

    test('should handle words appearing multiple times', () => {
        const input = {
            "test": [0, 2],
            "is": [1],
            "a": [3]
        };
        // Expect "test is test a"
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "test is test a");
    });

    test('should handle empty input object', () => {
        const input = {};
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "");
    });

    test('should handle null/undefined input', () => {
        // @ts-ignore - Testing runtime behavior for invalid input
        assert.strictEqual(deinvertAbstract(null), "");
        // @ts-ignore - Testing runtime behavior for invalid input
        assert.strictEqual(deinvertAbstract(undefined), "");
    });

    test('should handle non-consecutive indices (sparse array)', () => {
        const input = {
            "Start": [0],
            "End": [5]
        };
        // Array: ["Start", "", "", "", "", "End"]
        // Join ' ': "Start     End" (5 spaces)
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "Start     End");
    });

    test('should handle unordered input keys', () => {
        const input = {
            "world": [1],
            "Hello": [0]
        };
        const result = deinvertAbstract(input);
        assert.strictEqual(result, "Hello world");
    });

    test('should handle large indices', () => {
         const input = {
            "Start": [0],
            "End": [100]
        };
        const result = deinvertAbstract(input);
        assert.ok(result.startsWith("Start"));
        assert.ok(result.endsWith("End"));

        // Between Start (len 5) and End (len 3)
        const middle = result.slice(5, -3);
        // Should be 100 spaces
        assert.strictEqual(middle.length, 100);
        assert.match(middle, /^ +$/);
    });
});
