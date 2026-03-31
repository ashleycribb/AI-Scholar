
import { describe, test, expect } from "bun:test";
import { limitConcurrency } from "./concurrency";

async function sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

describe("limitConcurrency", () => {
    test("processes all items and returns correct results", async () => {
        const items = [1, 2, 3, 4, 5];
        const results = await limitConcurrency(items, 2, async (x) => x * 2);
        expect(results).toEqual([2, 4, 6, 8, 10]);
    });

    test("respects concurrency limit", async () => {
        let active = 0;
        let peak = 0;
        const items = Array.from({ length: 10 }, (_, i) => i);

        await limitConcurrency(items, 3, async () => {
            active++;
            peak = Math.max(peak, active);
            await sleep(50);
            active--;
            return true;
        });

        expect(peak).toBeLessThanOrEqual(3);
    });

    test("handles errors correctly (fail fast)", async () => {
        const items = [1, 2, 3];
        const process = async (x: number) => {
            if (x === 2) throw new Error("Fail");
            return x;
        };

        // Should reject
        expect(limitConcurrency(items, 2, process)).rejects.toThrow("Fail");
    });

    test("handles empty input", async () => {
        const results = await limitConcurrency([], 5, async () => true);
        expect(results).toEqual([]);
    });

    test("handles limit greater than input length", async () => {
        const items = [1, 2, 3];
        const results = await limitConcurrency(items, 10, async (x) => x * 2);
        expect(results).toEqual([2, 4, 6]);
    });
});
