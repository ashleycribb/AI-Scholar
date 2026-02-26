
import { describe, test, expect } from "bun:test";
import { deinvertAbstract } from "./utils";

describe("deinvertAbstract", () => {
    test("should return empty string for null/undefined input", () => {
        expect(deinvertAbstract(null as any)).toBe('');
        expect(deinvertAbstract(undefined as any)).toBe('');
    });

    test("should handle empty object", () => {
        expect(deinvertAbstract({})).toBe('');
    });

    test("should reconstruct simple sentence", () => {
        const input = {
            "Hello": [0],
            "world": [1]
        };
        expect(deinvertAbstract(input)).toBe("Hello world");
    });

    test("should handle correct positioning", () => {
        const input = {
            "world": [1],
            "Hello": [0]
        };
        expect(deinvertAbstract(input)).toBe("Hello world");
    });

    test("should handle duplicate words", () => {
        const input = {
            "test": [0, 2],
            "is": [1]
        };
        expect(deinvertAbstract(input)).toBe("test is test");
    });

    test("should handle gaps (sparse arrays)", () => {
        // If index 1 is missing, it should be an empty string (space)
        const input = {
            "Start": [0],
            "End": [2]
        };
        // Expected: "Start  End" (two spaces because index 1 is empty)
        expect(deinvertAbstract(input)).toBe("Start  End");
    });

    test("should handle large gaps", () => {
        const input = {
            "Start": [0],
            "End": [5]
        };
        // 0: Start, 1: '', 2: '', 3: '', 4: '', 5: End
        // Result: "Start     End"
        expect(deinvertAbstract(input)).toBe("Start     End");
    });
});
