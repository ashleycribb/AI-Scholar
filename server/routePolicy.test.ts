import { test, expect, describe } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_RULE, ROUTE_POLICY, matchRule, normalizePath } from "./routePolicy";

describe("matching", () => {
  test("every rule has a unique id, upper-case methods and a note", () => {
    const ids = new Set<string>();
    for (const r of ROUTE_POLICY) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      expect(r.note.length).toBeGreaterThan(5);
      for (const m of r.methods) expect(m).toBe(m.toUpperCase());
    }
  });

  test("paths outside /api, /xapi and /mcp are not governed (static app, vite)", () => {
    for (const p of ["/", "/index.html", "/assets/app.js", "/ontologies/agent_traceability.owl", "/mcp-relay-docs", "/apix"]) {
      expect(matchRule("GET", p)).toBeNull();
    }
  });

  test("unlisted API routes and unlisted methods fall to default deny (admin only)", () => {
    for (const [m, p] of [["GET", "/api/new-thing"], ["PUT", "/api/lrs/status"], ["PATCH", "/xapi/statements"], ["POST", "/mcp"], ["GET", "/api"], ["GET", "/mcp/other"]] as const) {
      expect(matchRule(m, p)).toBe(DEFAULT_RULE);
    }
    expect(DEFAULT_RULE.access).toEqual({ kind: "signed-in", roles: [] });
  });

  test("path tricks cannot dodge a rule: case, trailing slashes, HEAD", () => {
    expect(normalizePath("/API/Local/Verify///")).toBe("/api/local/verify");
    expect(matchRule("POST", "/API/Local/Verify/")?.id).toBe("local-verify");
    expect(matchRule("HEAD", "/api/marketplace/capabilities")?.id).toBe("marketplace-get");
    expect(matchRule("POST", "/api//local/verify")).toBe(DEFAULT_RULE); // empty segment never matches a rule
    expect(matchRule("POST", "/api/local/verify/../vault")).toBe(DEFAULT_RULE);
    expect(matchRule("DELETE", "/XAPI/Statements/By-Actor")?.id).toBe("xapi-delete-by-actor");
  });

  test("state-changing and sensitive routes are never public", () => {
    const mustNotBePublic: [string, string][] = [
      ["POST", "/xapi/statements"], ["GET", "/xapi/statements"], ["PUT", "/xapi/activities/state"], ["GET", "/xapi/activities/state"],
      ["DELETE", "/xapi/statements/by-actor"], ["POST", "/xapi/statements/delete-by-actor"], ["DELETE", "/xapi/statements"],
      ["DELETE", "/xapi/actors/abc"], ["DELETE", "/api/lrs/actors/abc"],
      ["GET", "/api/lrs/status"], ["GET", "/api/lrs/sql-lrs/statements"], ["POST", "/api/lrs/sql-lrs/statements"],
      ["GET", "/api/lrs/duckdb-lrs/statements"], ["POST", "/api/lrs/duckdb-lrs/statements"], ["GET", "/api/analytics/duckdb-export"],
      ["POST", "/api/provenance/claims"], ["POST", "/api/provenance/evidence"], ["GET", "/api/provenance/claims/x"], ["GET", "/api/provenance/sessions/x"],
      ["POST", "/api/marketplace/capabilities"], ["GET", "/api/marketplace/capabilities"],
      ["GET", "/mcp"], ["POST", "/mcp/messages"], ["GET", "/api/local/vault"], ["POST", "/api/local/verify"],
      ["POST", "/api/sources/test-endpoint"], ["POST", "/api/sources/propose"], ["POST", "/api/sources/approve/x"],
      ["POST", "/api/sources/reject/x"], ["POST", "/api/sources/custom"],
    ];
    for (const [m, p] of mustNotBePublic) {
      const r = matchRule(m, p)!;
      expect(r.access.kind, `${m} ${p}`).toBe("signed-in");
    }
  });

  test("roles: destructive and tool-running routes are not open to every signed-in user", () => {
    const roles = (m: string, p: string) => { const a = matchRule(m, p)!.access; return a.kind === "signed-in" ? a.roles : "public"; };
    expect(roles("POST", "/api/local/verify")).toEqual(["researcher"]);
    expect(roles("GET", "/mcp")).toEqual(["researcher"]);
    expect(roles("POST", "/api/marketplace/capabilities")).toEqual(["researcher"]);
    expect(roles("POST", "/api/sources/approve/x")).toEqual(["researcher", "committee"]);
    expect(roles("DELETE", "/xapi/statements/by-actor")).toEqual(["participant", "researcher"]); // committee cannot delete
    expect(roles("GET", "/api/analytics/duckdb-export")).toEqual(["researcher", "committee"]);
  });
});

/** Turn the path argument of an `app.<method>(...)` call in source into sample request paths. */
function samplePaths(arg: string): string[] {
  const out: string[] = [];
  const literals = arg.match(/"[^"]*"|'[^']*'/g) || [];
  for (const l of literals) out.push(l.slice(1, -1));
  const re = arg.match(/^\/\^(.*)\/,?$/s); // regex literal route, e.g. /^\/api\/s2\/(.*)/
  if (re) out.push(re[1].replace(/\\\//g, "/").replace(/\(\.\*\)/g, "x"));
  return out.map(p => p.replace(/\*\w*/g, "x").replace(/:\w+/g, "x"));
}

/** Every `app.get("/x", ...)`-style registration in a source file, as [METHOD, path]. */
function registeredRoutes(file: string): [string, string][] {
  const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
  const found: [string, string][] = [];
  const re = /\bapp\.(get|post|put|delete|patch)\(\s*(\[[^\]]*\]|"[^"]*"|'[^']*'|\/\^[^\n]*?\/(?=,))/g;
  for (const m of src.matchAll(re)) {
    for (const p of samplePaths(m[2])) found.push([m[1].toUpperCase(), p]);
  }
  return found;
}

describe("completeness: no route in server.ts or server/lrsRoutes.ts is outside the policy", () => {
  for (const file of ["server.ts", "server/lrsRoutes.ts"]) {
    test(`${file}`, () => {
      const routes = registeredRoutes(file).filter(([, p]) => /^\/(api|xapi|mcp)(\/|$)/.test(p));
      expect(routes.length).toBeGreaterThan(file === "server.ts" ? 30 : 10);
      const unlisted = routes.filter(([m, p]) => matchRule(m, p) === DEFAULT_RULE).map(([m, p]) => `${m} ${p}`);
      expect(unlisted).toEqual([]);
    });
  }

  test("routes mounted through routers are covered too", () => {
    // app.use("/api/local", createLocalVerifyRouter()) -> POST /verify; mcpServer.mount(app, "/mcp"); approval router; gemini; auth.
    for (const [m, p] of [["POST", "/api/local/verify"], ["GET", "/mcp"], ["POST", "/mcp/messages"], ["GET", "/api/sources/approve-token"], ["POST", "/api/sources/approve-token"], ["POST", "/api/gemini/generate"], ["POST", "/api/auth/logout"]] as const) {
      expect(matchRule(m, p), `${m} ${p}`).not.toBe(DEFAULT_RULE);
    }
    const server = fs.readFileSync(path.join(process.cwd(), "server.ts"), "utf8");
    expect(server).toContain('createLocalVerifyRouter()');
    expect(server).toContain('mcpServer.mount(app, "/mcp")');
    // every app.use mount under a governed prefix is one we know about
    const mounts = [...server.matchAll(/\bapp\.use\(\s*"(\/(?:api|xapi|mcp)[^"]*)"/g)].map(m => m[1]).sort();
    expect(mounts).toEqual(["/api/auth", "/api/gemini", "/api/local", "/api/sources", "/xapi"].sort());
  });

  test("the wildcard CORS header is gone", () => {
    for (const file of ["server.ts", "server/lrsRoutes.ts", "server/cors.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/Access-Control-Allow-Origin["'],\s*["']\*/);
    }
  });

  test("no handler reads the caller's role from the request", () => {
    for (const file of ["server.ts", "server/lrsRoutes.ts"]) {
      const src = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(src).not.toMatch(/req\.(query|body)\??\.?\s*(\.|\[["'])?role\b/);
      expect(src).not.toMatch(/=== ?['"]researcher['"]/);
    }
  });
});
