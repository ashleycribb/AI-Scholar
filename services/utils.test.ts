import { describe, it, expect } from 'bun:test';
import { deinvertAbstract } from './utils';

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
        // @ts-ignore
        expect(deinvertAbstract(null)).toBe("");
        // @ts-ignore
        expect(deinvertAbstract(undefined)).toBe("");
    });

    it('should handle sparse/out-of-order input', () => {
        const input = {
            "start": [0],
            "end": [5]
        };
        // Expected behavior: "start     end" (with 4 spaces/empty strings in between)
        // Actually, the current implementation fills with '', so joining with ' ' results in multiple spaces.
        // "start" at 0. indices 1,2,3,4 are "". "end" at 5.
        // array: ["start", "", "", "", "", "end"]
        // join(' '): "start     end"
        expect(deinvertAbstract(input)).toBe("start     end");
    });

    it('should limit array size to prevent DoS via large index', () => {
        const largeIndex = 100000;
        const input = {
            "Normal": [0],
            "Huge": [largeIndex]
        };

        // This test documents the vulnerability fix expectation.
        // Before fix: It would create an array of length 100001.
        // After fix: It should cap the length (e.g. to 10000) and ignore the huge index.

        // We expect the function to return a truncated string or throw (depending on implementation choice).
        // Let's assume truncation strategy for now.
        // If we truncate at 10000, "Huge" at 100000 is ignored.
        // So result is "Normal" + trailing spaces (if any) or just "Normal".

        // For the purpose of this test running BEFORE the fix, it will allocate a large array.
        // 100,000 is small enough not to crash the test runner but large enough to be noticeable if we were measuring memory.
        // To verify the fix logic specifically, we check if the length is capped.

        const result = deinvertAbstract(input);

        // Once fixed, the result length should be reasonable.
        // "Normal" is length 6.
        // If it allocates 100000 spaces, result length is > 100000.
        // If fixed (capped at e.g. 10000), result length is much smaller.

        // We will assert that the length is < 50000 (arbitrary safe limit for test).
        expect(result.length).toBeLessThan(50000);
    });
});
