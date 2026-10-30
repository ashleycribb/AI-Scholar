/**
 * SSRF-safe outbound HTTP GET for URLs that a caller can influence.
 *
 * Rules enforced on EVERY hop (the first request and each redirect):
 *   1. https only, default port (443), no user:password@ in the URL.
 *   2. The host must be a DNS name on an explicit allowlist. IP literals are always refused
 *      (including decimal/hex/octal forms such as https://2130706433/, which the WHATWG URL
 *      parser normalises to 127.0.0.1, and bracketed IPv6 such as https://[::1]/).
 *   3. The name is resolved here, ALL returned addresses must be public, and the socket is then
 *      connected to that exact validated address (the DNS answer is pinned, so a second lookup
 *      cannot "rebind" to a private address between the check and the connect). TLS still
 *      verifies the certificate against the original host name.
 *   4. Redirects are never followed by the HTTP stack; we follow a bounded number manually and
 *      re-run rules 1-3 on each Location.
 *   5. One total deadline, a response size cap, and `Accept-Encoding: identity` (no
 *      decompression bombs). GET only.
 *
 * Callers receive the body as a Buffer and decide what, if anything, to expose. Do not echo it
 * back to the requester.
 */
import dns from "node:dns";
import https from "node:https";
import net from "node:net";
import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";

export type SafeFetchErrorCode =
  | "invalid_url"
  | "scheme_not_allowed"
  | "credentials_not_allowed"
  | "port_not_allowed"
  | "ip_literal_not_allowed"
  | "host_not_allowed"
  | "dns_error"
  | "blocked_address"
  | "too_many_redirects"
  | "bad_redirect"
  | "timeout"
  | "too_large"
  | "network_error";

export class SafeFetchError extends Error {
  constructor(public readonly code: SafeFetchErrorCode, message: string) {
    super(message);
    this.name = "SafeFetchError";
  }
}

// ---------------------------------------------------------------------------------------------
// Address classification
// ---------------------------------------------------------------------------------------------

function parseIPv4(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function isBlockedIPv4(o: number[]): boolean {
  const [a, b, c] = o;
  return (
    a === 0 || // "this" network
    a === 10 || // RFC1918
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64/10
    a === 127 || // loopback
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) || // RFC1918
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 192 && b === 0 && c === 2) || // TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay
    (a === 192 && b === 168) || // RFC1918
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && c === 100) || // TEST-NET-2
    (a === 203 && b === 0 && c === 113) || // TEST-NET-3
    a >= 224 // multicast, reserved, broadcast
  );
}

/** Expand an IPv6 text address to 8 16-bit groups, or null if malformed. */
function parseIPv6(input: string): number[] | null {
  let ip = input.split("%")[0]; // strip zone id
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  if (!net.isIPv6(ip)) return null;
  // Embedded dotted IPv4 tail (::ffff:1.2.3.4) -> two hex groups.
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (!v4) return null;
    ip = ip.slice(0, lastColon + 1) + ((v4[0] << 8) | v4[1]).toString(16) + ":" + ((v4[2] << 8) | v4[3]).toString(16);
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - rest.length : 0;
  if (fill < 0 || (halves.length === 1 && head.length !== 8)) return null;
  const groups = [...head, ...Array(fill).fill("0"), ...rest].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

function v4FromGroups(hi: number, lo: number): number[] {
  return [hi >> 8, hi & 255, lo >> 8, lo & 255];
}

function isBlockedIPv6(g: number[]): boolean {
  const allZeroTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroTo(7) && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
  if (allZeroTo(5) && g[5] === 0xffff) return isBlockedIPv4(v4FromGroups(g[6], g[7])); // ::ffff:a.b.c.d (mapped)
  if (allZeroTo(6)) return true; // ::a.b.c.d (deprecated IPv4-compatible)
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0) {
    return isBlockedIPv4(v4FromGroups(g[6], g[7])); // 64:ff9b::/96 NAT64: judge the embedded v4
  }
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // 64:ff9b:1::/48 local-use NAT64
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard
  if (g[0] === 0x2001 && g[1] === 0) return true; // 2001::/32 Teredo
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation
  if (g[0] === 0x2002) return isBlockedIPv4(v4FromGroups(g[1], g[2])); // 6to4: judge the embedded v4
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** True when the address must never be contacted (private, loopback, link-local, metadata, ...). Unparseable input is blocked. */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4) return isBlockedIPv4(v4);
  const v6 = parseIPv6(address);
  if (v6) return isBlockedIPv6(v6);
  return true;
}

// ---------------------------------------------------------------------------------------------
// Host allowlist
// ---------------------------------------------------------------------------------------------

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

/** Exact-match allowlist of DNS host names (no wildcards: a wildcard would allow attacker-registered subdomains on shared hosts). */
export function createHostAllowlist(hosts: Iterable<string>): ReadonlySet<string> {
  const set = new Set<string>();
  for (const h of hosts) {
    const n = normalizeHost(String(h));
    if (n && !net.isIP(n.replace(/^\[|\]$/g, ""))) set.add(n);
  }
  return set;
}

/** Hosts of the https URLs in `urls`; non-https and unparseable entries are skipped. */
export function hostsOfUrls(urls: Iterable<string | undefined>): string[] {
  const out: string[] = [];
  for (const u of urls) {
    if (!u) continue;
    try {
      const p = new URL(u);
      if (p.protocol === "https:") out.push(p.hostname);
    } catch {
      /* ignore */
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// URL validation
// ---------------------------------------------------------------------------------------------

export function validateUrl(raw: string, allowedHosts: ReadonlySet<string>): URL {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2048) {
    throw new SafeFetchError("invalid_url", "URL is missing or too long");
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SafeFetchError("invalid_url", "URL is not valid");
  }
  if (url.protocol !== "https:") throw new SafeFetchError("scheme_not_allowed", "Only https URLs are allowed");
  if (url.username || url.password) throw new SafeFetchError("credentials_not_allowed", "URLs with credentials are not allowed");
  if (url.port && url.port !== "443") throw new SafeFetchError("port_not_allowed", "Only the default https port is allowed");
  const host = normalizeHost(url.hostname);
  // new URL() already rewrites decimal/hex/octal IPv4 (https://2130706433/, https://0x7f.1/) to dotted
  // form, and IPv6 keeps its brackets, so net.isIP sees every IP-literal spelling.
  if (net.isIP(host.replace(/^\[|\]$/g, "")) !== 0) {
    throw new SafeFetchError("ip_literal_not_allowed", "IP addresses are not allowed, use a host name");
  }
  if (!allowedHosts.has(host)) throw new SafeFetchError("host_not_allowed", `Host is not on the allowlist: ${host}`);
  return url;
}

// ---------------------------------------------------------------------------------------------
// Transport (injectable for tests)
// ---------------------------------------------------------------------------------------------

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}
export type ResolveFn = (hostname: string) => Promise<ResolvedAddress[]>;

export interface TransportRequest {
  url: URL;
  /** The already-validated address to connect to. */
  address: ResolvedAddress;
  headers: Record<string, string>;
  /** Fires when the overall deadline passes. */
  signal: AbortSignal;
}
export interface TransportResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Readable;
}
export type TransportFn = (req: TransportRequest) => Promise<TransportResponse>;

const defaultResolve: ResolveFn = async (hostname) => {
  const results = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

/** `port` and `tlsOptions` exist for tests (local TLS server, test CA); production uses the defaults. */
export function createHttpsTransport(tlsOptions: https.RequestOptions = {}, port = 443): TransportFn {
  return ({ url, address, headers, signal }) =>
    new Promise<TransportResponse>((resolve, reject) => {
      const req = https.request(
        {
          ...tlsOptions,
          protocol: "https:",
          method: "GET",
          hostname: url.hostname, // used for SNI and certificate verification
          port,
          path: url.pathname + url.search,
          headers: { ...headers, Host: url.host },
          agent: false,
          // Connect to the validated address, never to a fresh DNS answer.
          lookup: ((_h: string, opts: any, cb: any) => {
            if (opts && opts.all) cb(null, [{ address: address.address, family: address.family }]);
            else cb(null, address.address, address.family);
          }) as any,
        },
        (res) => resolve({ status: res.statusCode || 0, headers: res.headers, body: res })
      );
      const onAbort = () => req.destroy(new SafeFetchError("timeout", "Request timed out"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
      req.on("error", reject);
      req.on("close", () => signal.removeEventListener("abort", onAbort));
      req.end();
    });
}

// ---------------------------------------------------------------------------------------------
// safeFetch
// ---------------------------------------------------------------------------------------------

export interface SafeFetchOptions {
  allowedHosts: ReadonlySet<string>;
  /** Total deadline across DNS, connect, redirects and body. Default 7000 ms. */
  timeoutMs?: number;
  /** Response body cap in bytes. Default 1 MiB. */
  maxBytes?: number;
  /** "error" (default) throws too_large; "truncate" returns the first maxBytes with truncated=true. */
  onOverflow?: "error" | "truncate";
  /** Redirects followed, each fully re-validated. Default 3; 0 disables redirects. */
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export interface SafeFetchResult {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  truncated: boolean;
  finalUrl: string;
  redirects: number;
}

export interface SafeFetchDeps {
  resolve?: ResolveFn;
  transport?: TransportFn;
  /** Tests only. Production code must use the default. */
  isBlockedAddress?: (address: string) => boolean;
}

const DEFAULT_HEADERS = {
  "User-Agent": "ScholarExplorer-OpenSourceDiscoveryBot/1.0 (+https://scholar-explorer.com)",
  Accept: "*/*",
  "Accept-Encoding": "identity",
};

export function createSafeFetch(deps: SafeFetchDeps = {}) {
  const resolve = deps.resolve ?? defaultResolve;
  const transport = deps.transport ?? createHttpsTransport();
  const blocked = deps.isBlockedAddress ?? isBlockedAddress;

  return async function safeFetch(rawUrl: string, opts: SafeFetchOptions): Promise<SafeFetchResult> {
    const timeoutMs = opts.timeoutMs ?? 7000;
    const maxBytes = opts.maxBytes ?? 1024 * 1024;
    const maxRedirects = opts.maxRedirects ?? 3;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const deadline = new Promise<never>((_, reject) => {
      controller.signal.addEventListener("abort", () => reject(new SafeFetchError("timeout", "Request timed out")), { once: true });
    });
    deadline.catch(() => {}); // avoid unhandled rejection when we finish first

    const run = async (): Promise<SafeFetchResult> => {
      let current = validateUrl(rawUrl, opts.allowedHosts);
      let extraHeaders = opts.headers ?? {};
      for (let hop = 0; ; hop++) {
        // Resolve and validate every address, then pin the connection to one of them.
        let addrs: ResolvedAddress[];
        try {
          addrs = await resolve(normalizeHost(current.hostname));
        } catch {
          throw new SafeFetchError("dns_error", "Host could not be resolved");
        }
        if (!addrs.length) throw new SafeFetchError("dns_error", "Host could not be resolved");
        if (addrs.some((a) => blocked(a.address))) {
          throw new SafeFetchError("blocked_address", "Host resolves to a non-public address");
        }

        let res: TransportResponse;
        try {
          res = await transport({ url: current, address: addrs[0], headers: { ...DEFAULT_HEADERS, ...extraHeaders }, signal: controller.signal });
        } catch (e) {
          if (e instanceof SafeFetchError) throw e;
          if (controller.signal.aborted) throw new SafeFetchError("timeout", "Request timed out");
          throw new SafeFetchError("network_error", "Connection failed");
        }

        if (res.status >= 300 && res.status < 400 && res.headers.location) {
          res.body.destroy();
          if (hop >= maxRedirects) throw new SafeFetchError("too_many_redirects", "Too many redirects");
          let next: URL;
          try {
            next = validateUrl(new URL(String(res.headers.location), current).toString(), opts.allowedHosts);
          } catch (e) {
            if (e instanceof SafeFetchError) throw new SafeFetchError("bad_redirect", `Redirect refused: ${e.message}`);
            throw new SafeFetchError("bad_redirect", "Redirect target is not valid");
          }
          if (next.host !== current.host) extraHeaders = {}; // never carry caller headers to another host
          current = next;
          continue;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let truncated = false;
        try {
          for await (const chunk of res.body) {
            const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (total + buf.length > maxBytes) {
              if ((opts.onOverflow ?? "error") === "error") {
                res.body.destroy();
                throw new SafeFetchError("too_large", `Response exceeds ${maxBytes} bytes`);
              }
              chunks.push(buf.subarray(0, maxBytes - total));
              total = maxBytes;
              truncated = true;
              res.body.destroy();
              break;
            }
            chunks.push(buf);
            total += buf.length;
          }
        } catch (e) {
          if (e instanceof SafeFetchError) throw e;
          if (controller.signal.aborted) throw new SafeFetchError("timeout", "Request timed out");
          throw new SafeFetchError("network_error", "Connection failed while reading the response");
        }
        return { status: res.status, headers: res.headers, body: Buffer.concat(chunks), truncated, finalUrl: current.toString(), redirects: hop };
      }
    };

    try {
      return await Promise.race([run(), deadline]);
    } finally {
      clearTimeout(timer);
      controller.abort(); // release sockets of whichever branch lost the race
    }
  };
}

export const safeFetch = createSafeFetch();
