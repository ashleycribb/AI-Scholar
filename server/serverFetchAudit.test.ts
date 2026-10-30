import { test, expect, describe } from "bun:test";
import fs from "node:fs";
import path from "node:path";

/**
 * Regression guard for the SSRF audit. Every server-side HTTP call in server.ts must start with a
 * literal https://<known host>/ so request input can only influence the path or query, never the
 * host. Anything that takes a caller-supplied URL must go through server/safeFetch.ts.
 */
const root = path.resolve(import.meta.dir, "..");
const read = (f: string) => fs.readFileSync(path.join(root, f), "utf8");

const serverFiles = ["server.ts", "services/mcp-server-impl.ts", ...fs.readdirSync(path.join(root, "server")).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => `server/${f}`)];

// Fixed upstreams server.ts proxies. Adding a new host here is a deliberate, reviewed act.
const FIXED_UPSTREAMS = new Set([
  "api.openalex.org", "api.semanticscholar.org", "serpapi.com", "api.datacite.org", "opencitations.net", "api.openaire.eu",
  "www.ebi.ac.uk", "dblp.org", "api.crossref.org", "zenodo.org", "eutils.ncbi.nlm.nih.gov", "doaj.org", "api.ies.ed.gov",
  "api.core.ac.uk", "export.arxiv.org", "ar5iv.labs.arxiv.org", "api.unpaywall.org",
]);

describe("server-side outbound HTTP audit", () => {
  const src = read("server.ts");
  const calls = [...src.matchAll(/axios\.(get|post|put|delete|patch|request|head)\(\s*([^,)]*)/g)];

  test("server.ts has the expected number of axios calls (update this when adding one)", () => {
    expect(calls.length).toBeGreaterThan(25);
  });
  test("every axios call in server.ts starts with a literal https://<fixed host>/", () => {
    for (const m of calls) {
      const arg = m[2].trim();
      const lit = arg.match(/^["`]https:\/\/([a-z0-9.-]+)\//);
      expect(lit).not.toBeNull();
      expect(FIXED_UPSTREAMS.has(lit![1])).toBe(true);
    }
  });
  test("no axios(...) or axios.create/request with a computed target, no http(s).request/get, no node-fetch/undici", () => {
    expect(src).not.toMatch(/axios\(\s*[^)]/);
    expect(src).not.toMatch(/axios\.(request|create)\(/);
    expect(src).not.toMatch(/\bhttps?\.(get|request)\(/);
    expect(src).not.toMatch(/from ["'](node-fetch|undici|got)["']/);
  });
  test("outside server/safeFetch.ts, server modules never call fetch/axios/http(s).request", () => {
    for (const f of serverFiles) {
      if (f === "server.ts" || f === "server/safeFetch.ts") continue;
      const text = read(f);
      expect(text, f).not.toMatch(/\bfetch\(|axios|\bhttps?\.(get|request)\(|from ["']node:https?["']/);
    }
  });
  test("sourceRegistry fetches user-influenced URLs only through safeFetch", () => {
    const text = read("server/sourceRegistry.ts");
    expect(text).toContain("safeFetch");
    expect(text).not.toContain("axios");
  });
});
