import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { csrfFetch, csrfHeaders, getCsrfToken, resetCsrfToken, isSameOrigin } from "./csrf";

const realFetch = globalThis.fetch;
const g = globalThis as any;
let calls: { url: string; init: RequestInit }[] = [];
let session: { authenticated: boolean; csrfToken?: string } = { authenticated: true, csrfToken: "tok-1" };
let staleOnce = false;

beforeEach(() => {
  g.window = { location: { origin: "https://app.example" } };
  resetCsrfToken();
  calls = [];
  session = { authenticated: true, csrfToken: "tok-1" };
  staleOnce = false;
  g.fetch = async (input: any, init: RequestInit = {}) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.endsWith("/api/auth/session")) return new Response(JSON.stringify(session), { status: 200 });
    if (staleOnce && new Headers(init.headers).get("x-csrf-token") === "tok-1") {
      staleOnce = false;
      session = { authenticated: true, csrfToken: "tok-2" };
      return new Response(JSON.stringify({ error: "csrf_check_failed" }), { status: 403 });
    }
    return new Response("{}", { status: 200 });
  };
});
afterEach(() => { g.fetch = realFetch; delete g.window; });

const headerOf = (c: { init: RequestInit }) => new Headers(c.init.headers).get("x-csrf-token");

describe("csrf client helper", () => {
  test("unsafe same-origin requests carry the token; safe ones and cross-origin ones do not", async () => {
    await csrfFetch("/api/local/verify", { method: "POST", body: "{}" });
    await csrfFetch("/api/local/vault");
    await csrfFetch("https://lrs.example/xapi/statements", { method: "POST" });
    await csrfFetch("https://app.example/xapi/statements", { method: "DELETE" });
    const sent = calls.filter(c => !c.url.endsWith("/api/auth/session"));
    expect(sent.map(headerOf)).toEqual(["tok-1", null, null, "tok-1"]);
  });
  test("the token is fetched once and reused; with no session no header is sent", async () => {
    await csrfFetch("/api/x", { method: "PUT" });
    await csrfFetch("/api/y", { method: "PUT" });
    expect(calls.filter(c => c.url.endsWith("/api/auth/session")).length).toBe(1);
    resetCsrfToken();
    session = { authenticated: false };
    expect(await getCsrfToken()).toBeNull();
    expect(await csrfHeaders()).toEqual({});
  });
  test("a stale token is refreshed and the request retried once", async () => {
    await getCsrfToken();
    staleOnce = true;
    const res = await csrfFetch("/api/x", { method: "POST" });
    expect(res.status).toBe(200);
    const posts = calls.filter(c => c.init.method === "POST");
    expect(posts.map(headerOf)).toEqual(["tok-1", "tok-2"]);
  });
  test("origin check", () => {
    expect(isSameOrigin("/api/x")).toBe(true);
    expect(isSameOrigin("https://app.example/x")).toBe(true);
    expect(isSameOrigin("https://evil.example/x")).toBe(false);
    expect(isSameOrigin("//evil.example/x")).toBe(false);
  });
});
