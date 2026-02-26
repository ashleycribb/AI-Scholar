import { fetchPaperFromCrossref } from "./crossrefService";
import { test, expect, mock } from "bun:test";

test("finds matching paper", async () => {
    const paper = { title: "My Paper", authors: "Doe, John" } as any;
    const item = { title: ["My Paper"], author: [{ family: "Doe", name: "John Doe" }] };

    global.fetch = mock(() => Promise.resolve({
        ok: true,
        json: async () => ({ message: { items: [item] } })
    } as any));

    const result = await fetchPaperFromCrossref(paper);
    expect(result).toEqual(item as any);
});

test("rejects mismatched paper", async () => {
    const paper = { title: "My Paper", authors: "Doe, John" } as any;
    const item = { title: ["Different Paper"], author: [{ family: "Doe", name: "John Doe" }] };

    global.fetch = mock(() => Promise.resolve({
        ok: true,
        json: async () => ({ message: { items: [item] } })
    } as any));

    const result = await fetchPaperFromCrossref(paper);
    expect(result).toBeNull();
});
