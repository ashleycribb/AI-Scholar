import { expect, test, mock, beforeEach } from "bun:test";

// Mock the SDK before importing the module under test
const embedContentMock = mock(async (params: any) => {
    // Return a mocked response based on input
    // If params.contents (plural) is present, return plural embeddings
    if (params.contents) {
        return {
            embeddings: params.contents.map((c: any) => ({
                values: [0.1, 0.2, 0.3] // Mocked embedding vector
            }))
        };
    }
    // If singular content is present (old behavior)
    if (params.content) {
        return {
            embedding: {
                values: [0.1, 0.2, 0.3]
            }
        };
    }
    return {};
});

// Mock the GoogleGenAI class
mock.module("@google/genai", () => {
    return {
        GoogleGenAI: class {
            constructor(params: any) {
                // constructor logic
            }
            models = {
                embedContent: embedContentMock
            };
        }
    };
});

// Import the module under test
// Note: We need to use dynamic import to ensure mock is applied,
// and re-importing might be tricky if it caches.
// Since we already imported it once in the previous step (if running interactively),
// but here we are writing the file fresh.
const { batchEmbedText, embedText } = await import("./embeddings");

test("embedText should use singular content", async () => {
    embedContentMock.mockClear();
    const text = "Hello";
    const result = await embedText(text);

    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(embedContentMock).toHaveBeenCalledTimes(1);
    const callArgs = embedContentMock.mock.calls[0][0];
    expect(callArgs).toHaveProperty("content"); // Singular
    expect(callArgs.content.parts[0].text).toBe("Hello");
});

test("batchEmbedText should use batch contents", async () => {
    embedContentMock.mockClear();

    const texts = ["Hello", "World"];
    const results = await batchEmbedText(texts);

    // Verify results
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual([0.1, 0.2, 0.3]);
    expect(results[1]).toEqual([0.1, 0.2, 0.3]);

    // Verify the mock was called correctly
    // It should be called ONCE with 'contents' array
    expect(embedContentMock).toHaveBeenCalledTimes(1);

    const callArgs = embedContentMock.mock.calls[0][0];
    expect(callArgs).toHaveProperty("contents");
    expect(callArgs.contents).toHaveLength(2);
    expect(callArgs.contents[0].parts[0].text).toBe("Hello");
    expect(callArgs.contents[1].parts[0].text).toBe("World");
});
