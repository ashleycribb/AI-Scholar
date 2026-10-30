import { test, expect, describe } from "bun:test";
import { GeminiProvider, normalizeGeminiError, parseRetryAfterMs } from "./providers/gemini";
import { LLMError, toHttpError } from "./errors";

const KEY = "adapter-secret-DO-NOT-LEAK";
const mk = (models: any, getApiKey: () => string | undefined = () => KEY) =>
  new GeminiProvider({ getApiKey, clientFactory: k => { expect(k).toBe(KEY); return { models } as any; } });
const fail = async (p: Promise<unknown>) => (await p.then(() => null, e => e)) as LLMError;

describe("GeminiProvider contract", () => {
  test("identity and capabilities", () => {
    const p = mk({});
    expect(p.id).toBe("gemini");
    expect(p.capabilities).toEqual({ generate: true, embed: true, functionCalling: true, maxEmbedBatch: 100 });
    expect(p.supportsModel("gemini-3-flash-preview", "generate")).toBe(true);
    expect(p.supportsModel("models/gemini-embedding-2-preview", "embed")).toBe(true);
    expect(p.supportsModel("gpt-4", "generate")).toBe(false);
    expect(p.supportsModel("../evil", "generate")).toBe(false);
  });
  test("generate forwards {model, contents, config} unchanged and returns the SDK response in raw, plus text and usage", async () => {
    let seen: any;
    const sdk = { candidates: [{ content: { role: "model", parts: [{ text: "he" }, { text: "llo" }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2, totalTokenCount: 5 } };
    const p = mk({ generateContent: async (a: any) => { seen = a; return sdk; } });
    const r = await p.generate({ model: "gemini-x", contents: "hi", config: { temperature: 0.1 } });
    expect(seen).toEqual({ model: "gemini-x", contents: "hi", config: { temperature: 0.1 } });
    expect(r.raw).toBe(sdk);
    expect(r).toMatchObject({ providerId: "gemini", model: "gemini-x", text: "hello", usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 } });
  });
  test("embed forwards contents as-is and returns raw", async () => {
    let seen: any; const sdk = { embeddings: [{ values: [1, 2] }] };
    const p = mk({ embedContent: async (a: any) => { seen = a; return sdk; } });
    const r = await p.embed({ model: "gemini-embedding-2-preview", contents: "x", config: { outputDimensionality: 8 } });
    expect(seen).toEqual({ model: "gemini-embedding-2-preview", contents: "x", config: { outputDimensionality: 8 } });
    expect(r.raw).toBe(sdk);
  });
  test("embedBatch sends each text as its own Content and returns one {values} per text, in order", async () => {
    let seen: any;
    const p = mk({ embedContent: async (a: any) => { seen = a; return { embeddings: a.contents.map((_: any, i: number) => ({ values: [i], extra: "dropped" })) }; } });
    const r = await p.embedBatch({ model: "gemini-embedding-2-preview", texts: ["a", "b"] });
    expect(seen.contents).toEqual([{ role: "user", parts: [{ text: "a" }] }, { role: "user", parts: [{ text: "b" }] }]);
    expect(r.embeddings).toEqual([{ values: [0] }, { values: [1] }]);
  });
  test("embedBatch refuses a short or aggregated answer", async () => {
    const p = mk({ embedContent: async () => ({ embeddings: [{ values: [9] }] }) });
    const e = await fail(p.embedBatch({ model: "gemini-embedding-2-preview", texts: ["a", "b", "c"] }));
    expect(e).toBeInstanceOf(LLMError); expect(e.kind).toBe("unavailable");
    expect(toHttpError(e).code).toBe(502);
  });
  test("no API key: misconfigured, and the SDK is never created", async () => {
    let made = false;
    const p = new GeminiProvider({ getApiKey: () => undefined, clientFactory: () => { made = true; return {} as any; } });
    for (const call of [() => p.generate({ model: "gemini-x", contents: "x" }), () => p.embed({ model: "gemini-x", contents: "x" }), () => p.embedBatch({ model: "gemini-x", texts: ["x"] })]) {
      const e = await fail(call());
      expect(e.kind).toBe("misconfigured"); expect(toHttpError(e).code).toBe(503);
    }
    expect(made).toBe(false);
  });
  test("the key is read per call, not captured at construction", async () => {
    let key: string | undefined; let used: string | undefined;
    const p = new GeminiProvider({ getApiKey: () => key, clientFactory: k => { used = k; return { models: { generateContent: async () => ({}) } } as any; } });
    expect((await fail(p.generate({ model: "gemini-x", contents: "x" }))).kind).toBe("misconfigured");
    key = "later"; await p.generate({ model: "gemini-x", contents: "x" });
    expect(used).toBe("later");
  });
});

describe("normalizeGeminiError", () => {
  const cases: [any, string, number, string][] = [
    [{ status: 429 }, "rate_limited", 429, "RESOURCE_EXHAUSTED"],
    [{ status: 404 }, "not_found", 404, "NOT_FOUND"],
    [{ status: 400 }, "bad_request", 400, "INVALID_ARGUMENT"],
    [{ status: 401 }, "auth", 502, "UPSTREAM_AUTH"],
    [{ status: 403 }, "auth", 502, "UPSTREAM_AUTH"],
    [{ status: 400, message: "API_KEY_INVALID" }, "auth", 502, "UPSTREAM_AUTH"],
    [{ status: 500 }, "unavailable", 502, "UPSTREAM_ERROR"],
    [{ status: 503 }, "unavailable", 502, "UPSTREAM_ERROR"],
    [{ code: 503 }, "unavailable", 502, "UPSTREAM_ERROR"],
    [new Error("socket hang up"), "unavailable", 502, "UPSTREAM_ERROR"],
    [{}, "unavailable", 502, "UPSTREAM_ERROR"],
    [{ status: 418 }, "upstream_error", 418, "UPSTREAM_ERROR"],
    [{ status: "weird" }, "unavailable", 502, "UPSTREAM_ERROR"],
  ];
  for (const [input, kind, code, status] of cases) {
    test(`${JSON.stringify(input)} -> ${kind} / HTTP ${code} ${status}`, () => {
      const e = normalizeGeminiError(input);
      expect(e.kind).toBe(kind);
      expect(toHttpError(e)).toMatchObject({ code, status });
    });
  }
  test("raw upstream text and keys never reach the message", () => {
    const e = normalizeGeminiError({ status: 500, message: `boom ${KEY}` });
    expect(e.message).not.toContain(KEY);
  });
  test("an LLMError passes through untouched", () => {
    const orig = new LLMError("timeout", "gemini", "t");
    expect(normalizeGeminiError(orig)).toBe(orig);
  });
});

describe("retry-after extraction (429)", () => {
  test("from Gemini's retryDelay in the error body, headers, or a field", () => {
    expect(parseRetryAfterMs({ message: '{"error":{"details":[{"retryDelay":"33s"}]}}' })).toBe(33_000);
    expect(parseRetryAfterMs({ message: '"retryDelay": "1.5s"' })).toBe(1500);
    expect(parseRetryAfterMs({ headers: { "retry-after": "7" } })).toBe(7000);
    expect(parseRetryAfterMs({ headers: new Headers({ "retry-after": "2" }) })).toBe(2000);
    expect(parseRetryAfterMs({ retryAfterMs: 900 })).toBe(900);
    expect(parseRetryAfterMs({ message: "nothing" })).toBeUndefined();
  });
  test("429 carries it, and toHttpError turns it into whole seconds >= 1", () => {
    const e = normalizeGeminiError({ status: 429, message: '"retryDelay":"33s"' });
    expect(e.retryAfterMs).toBe(33_000);
    expect(toHttpError(e).retryAfterSeconds).toBe(33);
    expect(toHttpError(normalizeGeminiError({ status: 429, retryAfterMs: 100 })).retryAfterSeconds).toBe(1);
    expect(toHttpError(normalizeGeminiError({ status: 429 })).retryAfterSeconds).toBeUndefined();
  });
});
