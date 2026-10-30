import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SafeFetchResult } from "./safeFetch";

// sourceRegistry persists to <cwd>/local_engine/source_registry.json: run it in a scratch directory.
let tmp: string;
let origCwd: string;
let reg: typeof import("./sourceRegistry");

beforeAll(async () => {
  origCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "srcreg-"));
  process.chdir(tmp);
  reg = await import("./sourceRegistry");
});
afterAll(() => {
  process.chdir(origCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

const REFUSED = "URL not allowed";

describe("test-endpoint allowlist", () => {
  test("is derived from the sources in code and contains only https DNS hosts", () => {
    const hosts = [...reg.getTestEndpointAllowlist("")];
    expect(hosts).toContain("api.scielo.org");
    expect(hosts).toContain("api.base-search.net");
    expect(hosts).toContain("www.ebi.ac.uk");
    for (const h of hosts) expect(h).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    for (const bad of ["localhost", "127.0.0.1", "169.254.169.254", "metadata.google.internal"]) expect(hosts).not.toContain(bad);
  });
  test("operator extras via SOURCE_TEST_EXTRA_HOSTS are added, IPs are ignored", () => {
    const set = reg.getTestEndpointAllowlist("lib.example.edu, 10.0.0.1 ,");
    expect(set.has("lib.example.edu")).toBe(true);
    expect(set.has("10.0.0.1")).toBe(false);
  });
});

describe("testSourceEndpoint refuses SSRF payloads without touching the network", () => {
  const payloads = [
    "http://127.0.0.1/", "https://127.0.0.1/", "https://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "https://[::1]/", "https://[::ffff:169.254.169.254]/", "https://2130706433/", "https://0x7f000001/", "https://017700000001/",
    "https://127.1/", "https://localhost:3000/api/lrs/status", "http://api.scielo.org/v1/search", "https://api.scielo.org:8443/",
    "https://api.scielo.org@evil.test/", "https://evil.test/", "https://metadata.google.internal/", "file:///etc/passwd",
    "ftp://api.scielo.org/",
  ];
  for (const url of payloads) {
    test(`refuses ${url}`, async () => {
      // Default (real) fetcher: validation rejects these before DNS or any socket is opened.
      const real = await reg.testSourceEndpoint("scielo", url);
      expect(real.online).toBe(false);
      expect(real.status).toBe(400);
      expect(real.error).toBe(REFUSED);
      expect((real as any).dataSnippet).toBeUndefined();
    });
  }
  test("a refused custom URL does not change the stored status of a registered source", async () => {
    const before = JSON.stringify(reg.getAllSources().find((s) => s.id === "scielo"));
    await reg.testSourceEndpoint("scielo", "https://169.254.169.254/");
    expect(JSON.stringify(reg.getAllSources().find((s) => s.id === "scielo"))).toBe(before);
  });
  test("a custom source cannot reuse a built-in id (it gets a new one), and one pointing at the metadata service is refused", async () => {
    const before = JSON.stringify(reg.getAllSources().find((s) => s.id === "scielo"));
    const s = reg.addCustomDiscoveredSource({ id: "scielo", endpointUrl: "https://169.254.169.254/latest/meta-data/" });
    expect(s.id).not.toBe("scielo");
    expect(JSON.stringify(reg.getAllSources().find((x) => x.id === "scielo"))).toBe(before);
    const r = await reg.testSourceEndpoint(s.id);
    expect(r.error).toBe(REFUSED);
    expect(r.status).toBe(400);
  });
  test("a custom source on a host that is not in the code allowlist cannot be probed", async () => {
    const s = reg.addCustomDiscoveredSource({ id: "evil_src", endpointUrl: "https://internal.corp.example/admin" });
    expect((await reg.testSourceEndpoint(s.id)).error).toBe(REFUSED);
  });
  test("missing endpoint", async () => {
    expect((await reg.testSourceEndpoint("nope")).status).toBe(400);
  });
});

describe("testSourceEndpoint response shape", () => {
  const fakeResult = (over: Partial<SafeFetchResult> = {}): any => async () => ({
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: Buffer.from('{"secret":"SENSITIVE-BODY-CONTENT"}'),
    truncated: false,
    finalUrl: "https://api.scielo.org/v1/search",
    redirects: 0,
    ...over,
  });
  test("reports status, latency, content type and byte count but never the body", async () => {
    const r = await reg.testSourceEndpoint("hal_science", undefined, fakeResult());
    expect(r.online).toBe(true);
    expect(r.status).toBe(200);
    expect(r.contentType).toBe("application/json; charset=utf-8");
    expect(r.bytesRead).toBe(Buffer.byteLength('{"secret":"SENSITIVE-BODY-CONTENT"}'));
    expect(JSON.stringify(r)).not.toContain("SENSITIVE-BODY-CONTENT");
    expect(Object.keys(r).sort()).toEqual(["bytesRead", "contentType", "latencyMs", "online", "status"]);
  });
  test("the fetch is made with https-only limits: allowlist, 64 KiB truncate, 3 redirects, 7 s", async () => {
    let seen: any;
    await reg.testSourceEndpoint("hal_science", undefined, (async (u: string, o: any) => { seen = { u, o }; return (await fakeResult()()) as any; }) as any);
    expect(seen.u.startsWith("https://")).toBe(true);
    expect(seen.o.maxBytes).toBe(64 * 1024);
    expect(seen.o.onOverflow).toBe("truncate");
    expect(seen.o.maxRedirects).toBe(3);
    expect(seen.o.timeoutMs).toBe(7000);
    expect(seen.o.allowedHosts.has("api.archives-ouvertes.fr")).toBe(true);
    expect(seen.o.allowedHosts.has("localhost")).toBe(false);
  });
  test("upstream 5xx is reported offline; upstream errors do not leak raw messages", async () => {
    expect((await reg.testSourceEndpoint("hal_science", undefined, fakeResult({ status: 503 }))).online).toBe(false);
    const r = await reg.testSourceEndpoint("hal_science", undefined, (async () => { throw new Error("getaddrinfo ENOTFOUND 10.1.2.3 secret-internal"); }) as any);
    expect(r.error).toBe("Connection failed");
    expect(r.status).toBe(502);
  });
});
