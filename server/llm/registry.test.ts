import { test, expect } from "bun:test";
import { ProviderRegistry, LLMConfigError } from "./registry";
import { createLLMService } from "./config";
import { FakeProvider } from "./testing";

test("register, get, resolve, list", () => {
  const r = new ProviderRegistry().register(new FakeProvider("a")).register(new FakeProvider("b"));
  expect(r.list()).toEqual(["a", "b"]);
  expect(r.resolve("a").id).toBe("a");
  expect(r.get("zzz")).toBeUndefined();
  expect(r.has("b")).toBe(true);
});

test("resolve of an unknown id throws a config error that lists what is registered", () => {
  const r = new ProviderRegistry().register(new FakeProvider("a"));
  expect(() => r.resolve("nope")).toThrow(LLMConfigError);
  expect(() => r.resolve("nope")).toThrow(/Registered: a/);
});

test("duplicate and malformed ids are rejected", () => {
  const r = new ProviderRegistry().register(new FakeProvider("a"));
  expect(() => r.register(new FakeProvider("a"))).toThrow(/already registered/);
  expect(() => r.register(new FakeProvider("Bad Id"))).toThrow(/Invalid/);
});

test("env config: defaults to gemini only, no fallbacks", () => {
  const svc = createLLMService({ env: {}, gemini: { getApiKey: () => "k" } });
  expect(svc).toBeTruthy(); // constructs: primary "gemini" resolves
});

test("env config: unknown primary, fallback or embed provider fails at startup", () => {
  expect(() => createLLMService({ env: { LLM_PRIMARY_PROVIDER: "openai" } })).toThrow(/Unknown LLM provider "openai"/);
  expect(() => createLLMService({ env: { LLM_FALLBACK_PROVIDERS: "gemini,local" } })).toThrow(/Unknown LLM provider "local"/);
  expect(() => createLLMService({ env: { LLM_EMBED_PROVIDER: "nope" } })).toThrow(/LLM_EMBED_PROVIDER/);
});

test("env config: ids are trimmed, lowercased and parsed from a list; extra providers can be registered", async () => {
  const fake = new FakeProvider("fake");
  const svc = createLLMService({
    env: { LLM_PRIMARY_PROVIDER: " FAKE ", LLM_FALLBACK_PROVIDERS: " gemini , ,fake" },
    extraProviders: [fake],
  });
  expect((await svc.generate({ model: "gemini-x", contents: "hi" })).providerId).toBe("fake");
});
