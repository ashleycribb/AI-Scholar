import { test, expect, describe, afterAll, beforeAll } from "bun:test";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { AddressInfo } from "node:net";
import {
  isBlockedAddress,
  validateUrl,
  createHostAllowlist,
  hostsOfUrls,
  createSafeFetch,
  createHttpsTransport,
  SafeFetchError,
  type ResolveFn,
  type TransportFn,
  type TransportRequest,
} from "./safeFetch";

const ALLOWED = createHostAllowlist(["api.allowed.test", "other.allowed.test"]);
const PUBLIC = [{ address: "93.184.216.34", family: 4 as const }];

const codeOf = async (p: Promise<unknown> | (() => unknown)): Promise<string> => {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof SafeFetchError) return e.code;
    throw e;
  }
  return "no_error";
};

describe("isBlockedAddress", () => {
  const blocked = [
    "0.0.0.0", "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255",
    "192.168.0.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "192.0.0.1", "192.0.2.1",
    "198.18.0.1", "198.51.100.1", "203.0.113.1", "224.0.0.1", "240.0.0.1", "255.255.255.255",
    "::", "::1", "fe80::1", "fe80::1%eth0", "fc00::1", "fd12:3456::1", "ff02::1", "2001:db8::1", "2001::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "::127.0.0.1",
    "64:ff9b::7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:1::", "2002:a9fe:a9fe::1", "fec0::1",
    "not-an-ip", "", "999.1.1.1", "1.2.3",
  ];
  const allowed = [
    "8.8.8.8", "1.1.1.1", "93.184.216.34", "172.15.255.255", "172.32.0.1", "100.63.255.255", "100.128.0.1",
    "169.253.1.1", "192.169.0.1", "198.20.0.1", "223.255.255.255",
    "2606:4700:4700::1111", "2001:4860:4860::8888", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::1",
  ];
  for (const a of blocked) test(`blocks ${JSON.stringify(a)}`, () => expect(isBlockedAddress(a)).toBe(true));
  for (const a of allowed) test(`allows ${a}`, () => expect(isBlockedAddress(a)).toBe(false));
});

describe("validateUrl payloads", () => {
  const cases: Array<[string, string]> = [
    // non-https
    ["http://api.allowed.test/", "scheme_not_allowed"],
    ["ftp://api.allowed.test/", "scheme_not_allowed"],
    ["file:///etc/passwd", "scheme_not_allowed"],
    ["gopher://api.allowed.test/", "scheme_not_allowed"],
    ["javascript:alert(1)", "scheme_not_allowed"],
    ["data:text/plain,hi", "scheme_not_allowed"],
    ["//api.allowed.test/", "invalid_url"],
    ["", "invalid_url"],
    ["not a url", "invalid_url"],
    ["https://" + "a".repeat(3000), "invalid_url"],
    // IP literals in every spelling
    ["https://127.0.0.1/", "ip_literal_not_allowed"],
    ["https://127.0.0.1:443/", "ip_literal_not_allowed"],
    ["https://169.254.169.254/latest/meta-data/", "ip_literal_not_allowed"],
    ["https://[::1]/", "ip_literal_not_allowed"],
    ["https://[::ffff:127.0.0.1]/", "ip_literal_not_allowed"],
    ["https://[::ffff:7f00:1]/", "ip_literal_not_allowed"],
    ["https://[fe80::1]/", "ip_literal_not_allowed"],
    ["https://[fd00:ec2::254]/", "ip_literal_not_allowed"],
    ["https://2130706433/", "ip_literal_not_allowed"], // decimal 127.0.0.1
    ["https://0x7f000001/", "ip_literal_not_allowed"], // hex
    ["https://0x7f.0.0.1/", "ip_literal_not_allowed"], // mixed hex
    ["https://017700000001/", "ip_literal_not_allowed"], // octal
    ["https://0177.0.0.1/", "ip_literal_not_allowed"],
    ["https://127.1/", "ip_literal_not_allowed"], // short form
    ["https://0/", "ip_literal_not_allowed"], // 0.0.0.0
    ["https://2852039166/", "ip_literal_not_allowed"], // decimal 169.254.169.254
    ["https://0xa9fea9fe/", "ip_literal_not_allowed"],
    ["https://8.8.8.8/", "ip_literal_not_allowed"], // even public IPs are refused
    // not on allowlist
    ["https://localhost/", "host_not_allowed"],
    ["https://localhost.localdomain/", "host_not_allowed"],
    ["https://metadata.google.internal/computeMetadata/v1/", "host_not_allowed"],
    ["https://evil.test/", "host_not_allowed"],
    ["https://allowed.test/", "host_not_allowed"],
    ["https://api.allowed.test.evil.test/", "host_not_allowed"],
    ["https://evilapi.allowed.test/", "host_not_allowed"],
    ["https://evil.test/#@api.allowed.test", "host_not_allowed"],
    ["https://evil.test/?u=api.allowed.test", "host_not_allowed"],
    ["https://api.allowed.test@evil.test/", "credentials_not_allowed"],
    ["https://user:pw@api.allowed.test/", "credentials_not_allowed"],
    // port
    ["https://api.allowed.test:8443/", "port_not_allowed"],
    ["https://api.allowed.test:22/", "port_not_allowed"],
  ];
  for (const [url, code] of cases) {
    test(`${code}: ${url.slice(0, 60)}`, async () => expect(await codeOf(() => validateUrl(url, ALLOWED))).toBe(code));
  }
  test("non-string input is rejected", async () => {
    expect(await codeOf(() => validateUrl(undefined as any, ALLOWED))).toBe("invalid_url");
    expect(await codeOf(() => validateUrl({} as any, ALLOWED))).toBe("invalid_url");
  });
  test("an allowlisted host passes, case and trailing dot normalised", () => {
    expect(validateUrl("https://api.allowed.test/x?y=1", ALLOWED).hostname).toBe("api.allowed.test");
    expect(validateUrl("https://API.Allowed.TEST./x", ALLOWED).hostname).toBe("api.allowed.test.");
    expect(validateUrl("https://api.allowed.test:443/x", ALLOWED).host).toBe("api.allowed.test");
  });
  test("a backslash does not smuggle another host (the URL parser treats it as a path)", () => {
    expect(validateUrl("https://api.allowed.test\\@evil.test/", ALLOWED).hostname).toBe("api.allowed.test");
  });
  test("allowlist drops IPs and blanks; hostsOfUrls keeps only https hosts", () => {
    expect([...createHostAllowlist(["127.0.0.1", "[::1]", "", " X.test. "])]).toEqual(["x.test"]);
    expect(hostsOfUrls(["https://a.test/x", "http://b.test/", "junk", undefined])).toEqual(["a.test"]);
  });
});

// ---- safeFetch with a fake resolver and transport ----------------------------------------------

function fakeTransport(routes: Record<string, (req: TransportRequest) => { status: number; headers?: Record<string, string>; body?: string | Readable }>) {
  const calls: TransportRequest[] = [];
  const transport: TransportFn = async (req) => {
    calls.push(req);
    const route = routes[req.url.toString()];
    if (!route) throw new Error("no route " + req.url);
    const r = route(req);
    const body = r.body instanceof Readable ? r.body : Readable.from([Buffer.from(r.body ?? "")]);
    return { status: r.status, headers: r.headers ?? {}, body };
  };
  return { transport, calls };
}

const resolverFor = (map: Record<string, Array<{ address: string; family: 4 | 6 }>>): ResolveFn & { calls: string[] } => {
  const calls: string[] = [];
  const fn: any = async (host: string) => {
    calls.push(host);
    if (!map[host]) throw new Error("ENOTFOUND");
    return map[host];
  };
  fn.calls = calls;
  return fn;
};

describe("safeFetch: DNS and address checks", () => {
  test("allowlisted host that resolves to a private address is refused before any connection (DNS rebinding style)", async () => {
    for (const bad of ["127.0.0.1", "10.1.2.3", "169.254.169.254", "192.168.1.5", "::1", "fd00::1", "::ffff:127.0.0.1"]) {
      const { transport, calls } = fakeTransport({});
      const sf = createSafeFetch({ resolve: resolverFor({ "api.allowed.test": [{ address: bad, family: bad.includes(":") ? 6 : 4 }] }), transport });
      expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("blocked_address");
      expect(calls).toHaveLength(0);
    }
  });
  test("one private address among public ones is enough to refuse", async () => {
    const { transport, calls } = fakeTransport({});
    const sf = createSafeFetch({
      resolve: resolverFor({ "api.allowed.test": [{ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 }] }),
      transport,
    });
    expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("blocked_address");
    expect(calls).toHaveLength(0);
  });
  test("the connection is pinned to the validated address, and DNS is asked once per hop", async () => {
    let n = 0;
    const resolve: ResolveFn = async () => (n++ === 0 ? PUBLIC : [{ address: "127.0.0.1", family: 4 }]); // a rebinding resolver
    const { transport, calls } = fakeTransport({ "https://api.allowed.test/": () => ({ status: 200, body: "ok" }) });
    const r = await createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED });
    expect(r.status).toBe(200);
    expect(n).toBe(1);
    expect(calls[0].address.address).toBe("93.184.216.34");
  });
  test("resolution failure and empty answers are dns_error", async () => {
    const { transport } = fakeTransport({});
    const sf = createSafeFetch({ resolve: resolverFor({ "api.allowed.test": [] }), transport });
    expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("dns_error");
    expect(await codeOf(sf("https://other.allowed.test/", { allowedHosts: ALLOWED }))).toBe("dns_error");
  });
  test("literal-IP and non-https payloads never reach DNS or the network", async () => {
    const resolve = resolverFor({});
    const { transport, calls } = fakeTransport({});
    const sf = createSafeFetch({ resolve, transport });
    for (const u of ["https://127.0.0.1/", "https://169.254.169.254/", "https://[::1]/", "https://2130706433/", "https://0x7f000001/", "http://api.allowed.test/", "https://localhost/"]) {
      expect(await codeOf(sf(u, { allowedHosts: ALLOWED }))).not.toBe("no_error");
    }
    expect(resolve.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

describe("safeFetch: redirects", () => {
  const resolve = resolverFor({
    "api.allowed.test": PUBLIC,
    "other.allowed.test": PUBLIC,
  });
  const redirect = (to: string) => () => ({ status: 302, headers: { location: to } });

  for (const target of [
    "https://127.0.0.1/", "https://169.254.169.254/latest/meta-data/", "https://[::1]/", "https://2130706433/", "https://0x7f000001/",
    "http://api.allowed.test/", "https://evil.test/", "https://localhost/", "https://user:x@api.allowed.test/", "https://api.allowed.test:8443/",
    "ftp://api.allowed.test/", "file:///etc/passwd",
  ]) {
    test(`redirect to ${target} is refused`, async () => {
      const { transport, calls } = fakeTransport({ "https://api.allowed.test/": redirect(target) });
      expect(await codeOf(createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("bad_redirect");
      expect(calls).toHaveLength(1);
    });
  }
  test("redirect to an allowlisted host that resolves privately is refused (re-resolved on the new hop)", async () => {
    const r = resolverFor({ "api.allowed.test": PUBLIC, "other.allowed.test": [{ address: "10.0.0.8", family: 4 }] });
    const { transport, calls } = fakeTransport({ "https://api.allowed.test/": redirect("https://other.allowed.test/x") });
    expect(await codeOf(createSafeFetch({ resolve: r, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("blocked_address");
    expect(calls).toHaveLength(1);
  });
  test("relative and allowlisted redirects are followed; caller headers are not sent to a different host", async () => {
    const { transport, calls } = fakeTransport({
      "https://api.allowed.test/a": redirect("/b"),
      "https://api.allowed.test/b": redirect("https://other.allowed.test/c"),
      "https://other.allowed.test/c": () => ({ status: 200, body: "done" }),
    });
    const r = await createSafeFetch({ resolve, transport })("https://api.allowed.test/a", { allowedHosts: ALLOWED, headers: { "X-Token": "t" } });
    expect(r.body.toString()).toBe("done");
    expect(r.redirects).toBe(2);
    expect(r.finalUrl).toBe("https://other.allowed.test/c");
    expect(calls[0].headers["X-Token"]).toBe("t");
    expect(calls[1].headers["X-Token"]).toBe("t");
    expect(calls[2].headers["X-Token"]).toBeUndefined();
    expect(calls[0].headers["Accept-Encoding"]).toBe("identity");
  });
  test("redirect loops stop at the limit, and maxRedirects 0 disables redirects", async () => {
    const { transport, calls } = fakeTransport({ "https://api.allowed.test/": redirect("https://api.allowed.test/") });
    const sf = createSafeFetch({ resolve, transport });
    expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED, maxRedirects: 3 }))).toBe("too_many_redirects");
    expect(calls).toHaveLength(4);
    calls.length = 0;
    expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED, maxRedirects: 0 }))).toBe("too_many_redirects");
    expect(calls).toHaveLength(1);
  });
  test("a 3xx without Location is returned as-is", async () => {
    const { transport } = fakeTransport({ "https://api.allowed.test/": () => ({ status: 304 }) });
    expect((await createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED })).status).toBe(304);
  });
});

describe("safeFetch: limits", () => {
  const resolve = resolverFor({ "api.allowed.test": PUBLIC });
  const big = () => ({ status: 200, body: Readable.from([Buffer.alloc(40), Buffer.alloc(40)]) });
  test("size cap errors by default", async () => {
    const { transport } = fakeTransport({ "https://api.allowed.test/": big });
    expect(await codeOf(createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, maxBytes: 50 }))).toBe("too_large");
  });
  test("truncate mode returns exactly maxBytes and flags it", async () => {
    const { transport } = fakeTransport({ "https://api.allowed.test/": big });
    const r = await createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, maxBytes: 50, onOverflow: "truncate" });
    expect(r.body.length).toBe(50);
    expect(r.truncated).toBe(true);
  });
  test("a body under the cap is returned whole", async () => {
    const { transport } = fakeTransport({ "https://api.allowed.test/": () => ({ status: 200, body: "hello" }) });
    const r = await createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, maxBytes: 50 });
    expect(r.body.toString()).toBe("hello");
    expect(r.truncated).toBe(false);
  });
  test("timeout while connecting", async () => {
    const transport: TransportFn = ({ signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
    const t0 = Date.now();
    expect(await codeOf(createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, timeoutMs: 60 }))).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(1000);
  });
  test("timeout while a slow server drips the body forever", async () => {
    const body = new Readable({ read() {} });
    body.push("x");
    const { transport } = fakeTransport({ "https://api.allowed.test/": () => ({ status: 200, body }) });
    expect(await codeOf(createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, timeoutMs: 60 }))).toBe("timeout");
    body.destroy();
  });
  test("the deadline covers the DNS step", async () => {
    const slow: ResolveFn = () => new Promise(() => {});
    const { transport } = fakeTransport({});
    expect(await codeOf(createSafeFetch({ resolve: slow, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED, timeoutMs: 60 }))).toBe("timeout");
  });
  test("transport errors become network_error without leaking details", async () => {
    const transport: TransportFn = async () => { throw new Error("connect ECONNREFUSED 10.0.0.1:443"); };
    try {
      await createSafeFetch({ resolve, transport })("https://api.allowed.test/", { allowedHosts: ALLOWED });
      throw new Error("should have thrown");
    } catch (e: any) {
      expect(e.code).toBe("network_error");
      expect(e.message).not.toContain("10.0.0.1");
    }
  });
});

// ---- the real https transport against a local TLS server --------------------------------------

describe("default https transport (local TLS server, pinned address)", () => {
  let tmp: string;
  let server: https.Server;
  let port: number;
  let ca: string;
  let hasOpenssl = true;
  const seen: Array<{ host?: string; url?: string }> = [];

  beforeAll(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "safefetch-"));
    try {
      execFileSync("openssl", [
        "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", path.join(tmp, "k.pem"), "-out", path.join(tmp, "c.pem"),
        "-days", "2", "-subj", "/CN=api.allowed.test", "-addext", "subjectAltName=DNS:api.allowed.test",
      ], { stdio: "ignore" });
    } catch {
      hasOpenssl = false;
      return;
    }
    ca = fs.readFileSync(path.join(tmp, "c.pem"), "utf8");
    server = https.createServer({ key: fs.readFileSync(path.join(tmp, "k.pem")), cert: ca }, (req, res) => {
      seen.push({ host: req.headers.host, url: req.url });
      if (req.url === "/redir") { res.writeHead(302, { Location: "https://127.0.0.1/secret" }); return res.end(); }
      if (req.url === "/big") { res.writeHead(200); return res.end("y".repeat(10_000)); }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"hello":"world"}');
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => { server?.close(); if (tmp) fs.rmSync(tmp, { recursive: true, force: true }); });

  // The guard is switched off here ONLY because the test server lives on 127.0.0.1.
  const make = (tls: https.RequestOptions) =>
    createSafeFetch({
      resolve: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedAddress: () => false,
      transport: createHttpsTransport(tls, port),
    });

  test("connects to the pinned address (name is not in DNS), sends the right Host, verifies the certificate", async () => {
    if (!hasOpenssl) return;
    const r = await make({ ca })("https://api.allowed.test/ping?x=1", { allowedHosts: ALLOWED });
    expect(r.status).toBe(200);
    expect(r.body.toString()).toBe('{"hello":"world"}');
    expect(seen.at(-1)).toEqual({ host: "api.allowed.test", url: "/ping?x=1" });
  });
  test("a certificate that does not match the host name fails", async () => {
    if (!hasOpenssl) return;
    expect(await codeOf(make({ ca })("https://other.allowed.test/", { allowedHosts: ALLOWED }))).toBe("network_error");
  });
  test("an untrusted certificate fails", async () => {
    if (!hasOpenssl) return;
    expect(await codeOf(make({})("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("network_error");
  });
  test("a redirect to a private IP literal is refused over the real transport too", async () => {
    if (!hasOpenssl) return;
    expect(await codeOf(make({ ca })("https://api.allowed.test/redir", { allowedHosts: ALLOWED }))).toBe("bad_redirect");
  });
  test("size cap over the real transport", async () => {
    if (!hasOpenssl) return;
    const sf = make({ ca });
    expect(await codeOf(sf("https://api.allowed.test/big", { allowedHosts: ALLOWED, maxBytes: 100 }))).toBe("too_large");
    const r = await sf("https://api.allowed.test/big", { allowedHosts: ALLOWED, maxBytes: 100, onOverflow: "truncate" });
    expect(r.body.length).toBe(100);
    expect(r.truncated).toBe(true);
  });
  test("the production guard refuses the same loopback server", async () => {
    if (!hasOpenssl) return;
    const sf = createSafeFetch({ resolve: async () => [{ address: "127.0.0.1", family: 4 }], transport: createHttpsTransport({ ca }, port) });
    expect(await codeOf(sf("https://api.allowed.test/", { allowedHosts: ALLOWED }))).toBe("blocked_address");
  });
});
