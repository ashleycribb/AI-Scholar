/**
 * Route lockdown, end to end: the real auth router, route policy, CORS, LRS routes, source approval router and
 * local-verify router on a throwaway Express app (server.ts cannot be imported; it starts listening). Routes that
 * live inline in server.ts (marketplace, provenance, sources admin, MCP) are mirrored with the same handler calls.
 */
import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AddressInfo } from "net";
import { createAuth, loadAuthConfig, type Auth } from "./auth";
import { AuthStore } from "./auth/store";
import type { MailMessage, MailSender } from "./auth/mailer";
import { applyLockdown, type Lockdown } from "./lockdown";
import { registerLrsRoutes } from "./lrsRoutes";
import { SqlLrsStore, useSqlLrsStore, buildDuckDbDelete } from "./lrsDatabase";
import { createSourceApprovalRouter } from "./sourceApproval";
import { createLocalVerifyRouter } from "./localVerify";
import * as registry from "./sourceRegistry";
import { loadServiceAuth, MIN_TOKEN_LENGTH } from "./serviceAuth";
import { loadCorsConfig } from "./cors";
import { authorizeRelayUpgrade } from "./relayAuth";
import { resolveDeleteTargets, readScopeFor, ownActorIds } from "./lrsAccess";
import { issueApprovalToken, approvalTokenValid } from "./approvalTokens";

const PUBLIC = "https://scholar.example";
const SVC_TOKEN = "t".repeat(40);
const SVC_RO = "r".repeat(40);
const ENV = {
  NODE_ENV: "test",
  AUTH_PUBLIC_URL: PUBLIC,
  AUTH_EMAIL_PROVIDER: "console",
  AUTH_RESEARCHER_EMAILS: "pi@uni.edu",
  AUTH_COMMITTEE_EMAILS: "chair@uni.edu",
  AUTH_ADMIN_EMAILS: "root@uni.edu",
  AUTH_DB_PATH: ":memory:",
  CORS_ALLOWED_ORIGINS: "https://lab.example",
  SERVICE_TOKENS: `locallab|marketplace:read+marketplace:write+xapi:write+xapi:read+relay+mcp|${SVC_TOKEN};readonly|xapi:read|${SVC_RO}`,
} as unknown as NodeJS.ProcessEnv;

interface Session { cookie: string; csrf: string }
let srv: import("http").Server;
let url = "";
let auth: Auth;
let lock: Lockdown;
let lrs: SqlLrsStore;
let previousStore: SqlLrsStore | null;
let previousRegistry = "";
let tmp = "";
const mails: MailMessage[] = [];
const sessions = new Map<string, Session>();
let verifyCalls: string[][] = [];

const tokenFrom = (m: MailMessage) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

async function signIn(email: string): Promise<Session> {
  const cached = sessions.get(email);
  if (cached) return cached;
  const before = mails.length;
  await fetch(url + "/api/auth/magic-link/request", { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": `10.1.${sessions.size}.7` }, body: JSON.stringify({ email }) });
  await auth.idle();
  expect(mails.length).toBe(before + 1);
  const r = await fetch(url + "/api/auth/magic-link/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: tokenFrom(mails[mails.length - 1]) }) });
  expect(r.status).toBe(200);
  const s = { cookie: r.headers.getSetCookie()[0].split(";")[0], csrf: (await r.json()).csrfToken as string };
  sessions.set(email, s);
  return s;
}

const USERS = { participant: "student@uni.edu", researcher: "pi@uni.edu", committee: "chair@uni.edu", admin: "root@uni.edu" } as const;
type RoleName = keyof typeof USERS;

async function call(method: string, p: string, opts: { as?: RoleName | string; csrf?: boolean; body?: unknown; headers?: Record<string, string>; raw?: string } = {}) {
  const headers: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.as) {
    const email = (USERS as Record<string, string>)[opts.as] ?? opts.as;
    const s = await signIn(email);
    headers.Cookie = s.cookie;
    if (opts.csrf !== false) headers["X-CSRF-Token"] = s.csrf;
  }
  let body: string | undefined = opts.raw;
  if (opts.body !== undefined) { headers["Content-Type"] = headers["Content-Type"] || "application/json"; body = JSON.stringify(opts.body); }
  return fetch(url + p, { method, headers, body, redirect: "manual" });
}
const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const basic = (u: string, t: string) => ({ Authorization: `Basic ${Buffer.from(`${u}:${t}`).toString("base64")}` });

function seedStatement(actorName: string | null, mbox: string | null, id: string, extra: Record<string, unknown> = {}) {
  const payload = { id, actor: { ...(actorName ? { name: actorName } : {}), ...(mbox ? { mbox } : {}) }, verb: { id: "https://example/verbs/selected" }, object: { id: "https://example/obj/" + id }, ...extra };
  lrs.db.prepare(`INSERT INTO xapi_statements (id, timestamp, stored, actor_name, actor_mbox, verb_id, verb_name, object_id, object_name, payload) VALUES (?,?,?,?,?,?,?,?,?,?)`)
    .run(id, new Date(1_800_000_000_000 + Number(id.replace(/\D/g, "") || 0)).toISOString(), "x", actorName, mbox, "https://example/verbs/selected", "selected", payload.object.id, "o", JSON.stringify(payload));
}
const count = () => (lrs.db.prepare("SELECT COUNT(*) c FROM xapi_statements").get() as { c: number }).c;
const ids = () => (lrs.db.prepare("SELECT id FROM xapi_statements ORDER BY id").all() as { id: string }[]).map(r => r.id);

function seedAll() {
  lrs.db.exec("DELETE FROM xapi_statements; DELETE FROM xapi_states;");
  seedStatement("Student", "mailto:student@uni.edu", "s1");
  seedStatement("student@uni.edu", null, "s2");
  seedStatement("Other Person", "mailto:other@uni.edu", "o1");
  seedStatement("a%b", null, "p1");
  seedStatement("axb", null, "p2");
  seedStatement("x_y", null, "u1");
  seedStatement("xzy", null, "u2");
  seedStatement(null, null, "j1", { actor: { account: { name: "Student@Uni.edu", homePage: "https://scholar.example" } } });
}

beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lockdown-"));
  lrs = new SqlLrsStore(new DatabaseSync(":memory:"));
  previousStore = useSqlLrsStore(lrs);
  // Registry in a temp file, with a deep copy of two sources, one carrying an old clear-text token.
  const regFile = path.join(tmp, "registry.json");
  fs.writeFileSync(regFile, JSON.stringify({
    recipientEmail: "owner@example.org",
    lastScanAt: "2026-01-01T00:00:00Z",
    discovered: [
      { id: "src_a", name: "Source A", description: "d", category: "multidisciplinary", categoryLabel: "x", endpointUrl: "https://example.org/a", protocol: "REST", license: "CC0", recordCount: "1", officialUrl: "https://example.org", status: "discovered" },
      { id: "src_b", name: "Source B", description: "d", category: "multidisciplinary", categoryLabel: "x", endpointUrl: "https://example.org/b", protocol: "REST", license: "CC0", recordCount: "1", officialUrl: "https://example.org", status: "proposed", approvalToken: "approve_src_b_1_abc123" },
    ],
  }));
  previousRegistry = registry.useRegistryFile(regFile);

  const config = loadAuthConfig(ENV);
  const mailer: MailSender = { name: "test", async send(m) { mails.push(m); } };
  auth = createAuth({ config, store: new AuthStore(":memory:"), mailer, log: () => {} });
  const app = express();
  app.set("trust proxy", true);
  app.use("/api/auth", auth.router);
  lock = applyLockdown(app, auth, ENV, () => {});
  app.use(express.json());
  registerLrsRoutes(app);

  const P = (req: any) => req.principal;
  // --- mirrors of the inline routes in server.ts ---
  app.get("/api/health", (_q, r) => { r.json({ status: "ok" }); });
  app.post("/api/provenance/claims", (_q, r) => { r.status(201).json({ ok: true }); });
  app.post("/api/provenance/evidence", (_q, r) => { r.status(201).json({ ok: true }); });
  app.get("/api/provenance/claims/:claimId", (_q, r) => { r.json({ ok: true }); });
  app.get("/api/provenance/sessions/:sessionUuid", (_q, r) => { r.json({ ok: true }); });
  app.post("/api/marketplace/capabilities", (req, r) => {
    const p = P(req);
    r.status(201).json({ author: p.kind === "session" ? p.email : `service:${p.name}` });
  });
  app.get("/api/marketplace/capabilities", (_q, r) => { r.json({ packs: [] }); });
  app.get("/mcp", (_q, r) => { r.json({ sse: true }); });
  app.post("/mcp/messages", (_q, r) => { r.json({ ok: true }); });
  app.get("/api/local/vault", (_q, r) => { r.json([]); });
  fs.mkdirSync(path.join(tmp, "vault"));
  fs.writeFileSync(path.join(tmp, "vault", "note.md"), "# hi");
  app.use("/api/local", createLocalVerifyRouter({
    vaultDir: path.join(tmp, "vault"),
    execFile: ((_f: string, args: string[], _o: unknown, cb: (e: Error | null, out: string, err: string) => void) => { verifyCalls.push(args); cb(null, "verified", ""); }) as any,
  }));
  app.get("/api/sources/registry", (_q, r) => { r.json(registry.getSourcesRegistry()); });
  app.post("/api/sources/test-endpoint", (_q, r) => { r.json({ online: true }); });
  app.post("/api/sources/propose", async (req, r) => { try { r.json(await registry.proposeSource(req.body.sourceId, req.body.recipientEmail)); } catch (e: any) { r.status(400).json({ error: e.message }); } });
  app.post("/api/sources/approve/:id", (req, r) => { try { r.json({ success: true, source: registry.approveSource(req.params.id) }); } catch (e: any) { r.status(400).json({ error: e.message }); } });
  app.post("/api/sources/reject/:id", (req, r) => { try { r.json({ success: true, source: registry.rejectSource(req.params.id) }); } catch (e: any) { r.status(400).json({ error: e.message }); } });
  app.post("/api/sources/custom", (req, r) => { r.json({ success: true, source: registry.addCustomDiscoveredSource(req.body) }); });
  app.use("/api/sources", createSourceApprovalRouter());

  srv = await new Promise<import("http").Server>(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});

afterAll(() => {
  srv?.close();
  auth?.close();
  useSqlLrsStore(previousStore);
  registry.useRegistryFile(previousRegistry);
  fs.rmSync(tmp, { recursive: true, force: true });
});

// ------------------------------------------------------------------------------------------------

type Case = { m: string; p: string; body?: unknown; allowed: RoleName[] };
const ALL: RoleName[] = ["participant", "researcher", "committee", "admin"];
const STAFF: RoleName[] = ["researcher", "committee", "admin"];
const RES: RoleName[] = ["researcher", "admin"];
const CASES: Case[] = [
  { m: "POST", p: "/api/local/verify", body: { filePath: "note.md" }, allowed: RES },
  { m: "GET", p: "/api/local/vault", allowed: RES },
  { m: "POST", p: "/api/marketplace/capabilities", body: { manifest: {} }, allowed: RES },
  { m: "GET", p: "/api/marketplace/capabilities", allowed: ALL },
  { m: "GET", p: "/mcp", allowed: RES },
  { m: "POST", p: "/mcp/messages?sessionId=x", body: {}, allowed: RES },
  { m: "POST", p: "/api/sources/test-endpoint", body: { sourceId: "src_a" }, allowed: STAFF },
  { m: "POST", p: "/api/sources/propose", body: { sourceId: "src_a" }, allowed: STAFF },
  { m: "POST", p: "/api/sources/approve/src_a", allowed: STAFF },
  { m: "POST", p: "/api/sources/reject/src_a", allowed: STAFF },
  { m: "POST", p: "/api/sources/custom", body: { name: "N" }, allowed: STAFF },
  { m: "POST", p: "/api/provenance/claims", body: {}, allowed: STAFF },
  { m: "POST", p: "/api/provenance/evidence", body: {}, allowed: STAFF },
  { m: "GET", p: "/api/provenance/claims/c1", allowed: STAFF },
  { m: "GET", p: "/api/provenance/sessions/s1", allowed: STAFF },
  { m: "GET", p: "/api/analytics/duckdb-export", allowed: STAFF },
  { m: "GET", p: "/api/lrs/status", allowed: ALL },
  { m: "GET", p: "/api/lrs/sql-lrs/statements", allowed: ALL },
  { m: "GET", p: "/api/lrs/duckdb-lrs/statements?sessionUuid=x", allowed: ALL },
  { m: "POST", p: "/api/lrs/sql-lrs/statements", body: { actor: {}, verb: {}, object: {} }, allowed: ALL },
  { m: "POST", p: "/api/lrs/duckdb-lrs/statements", body: { actor: {}, verb: {}, object: {} }, allowed: ALL },
  { m: "GET", p: "/xapi/statements", allowed: ALL },
  { m: "POST", p: "/xapi/statements", body: { id: "i", actor: {}, verb: {}, object: {} }, allowed: ALL },
  { m: "GET", p: "/xapi/activities/state?activityId=a&stateId=s", allowed: ALL },
  { m: "PUT", p: "/xapi/activities/state?activityId=a&stateId=s", body: { x: 1 }, allowed: ALL },
  { m: "DELETE", p: "/xapi/statements/by-actor?actor=nobody%40uni.edu", allowed: ["researcher", "admin"] },
  { m: "POST", p: "/xapi/statements/delete-by-actor", body: { actor: "nobody@uni.edu" }, allowed: ["researcher", "admin"] },
  { m: "DELETE", p: "/xapi/actors/nobody%40uni.edu", allowed: ["researcher", "admin"] },
  { m: "DELETE", p: "/api/lrs/actors/nobody%40uni.edu", allowed: ["researcher", "admin"] },
];

describe("401 / 403 / allowed for every governed route", () => {
  beforeEach(seedAll);
  for (const c of CASES) {
    test(`${c.m} ${c.p}`, async () => {
      // anonymous
      expect((await call(c.m, c.p, { body: c.body })).status).toBe(401);
      for (const role of ALL) {
        const r = await call(c.m, c.p, { as: role, body: c.body });
        if (c.allowed.includes(role)) expect(r.status, `${role} should pass`).not.toBeOneOf([401, 403]);
        else expect(r.status, `${role} should be refused`).toBe(403);
      }
    });
  }
  test("participants may use the delete routes, but only for themselves (see own-data tests)", async () => {
    expect((await call("DELETE", "/xapi/statements/by-actor", { as: "participant" })).status).toBe(200);
    expect((await call("DELETE", "/xapi/statements/by-actor", { as: "committee" })).status).toBe(403);
  });
  test("upper-case / trailing-slash variants of a locked route are locked too", async () => {
    expect((await call("POST", "/API/Local/Verify/", { body: { filePath: "note.md" } })).status).toBe(401);
    expect((await call("GET", "/MCP")).status).toBe(401);
    expect((await call("DELETE", "/XAPI/statements/by-actor?actor=x")).status).toBe(401);
  });
  test("an unlisted API route is admin only", async () => {
    expect((await call("GET", "/api/not-a-route")).status).toBe(401);
    expect((await call("GET", "/api/not-a-route", { as: "researcher" })).status).toBe(403);
    expect((await call("GET", "/api/not-a-route", { as: "admin" })).status).toBe(404);
  });
  test("public routes stay public", async () => {
    expect((await call("GET", "/api/health")).status).toBe(200);
    expect((await call("GET", "/api/sources/registry")).status).toBe(200);
    expect((await call("GET", "/xapi/about")).status).toBe(200);
  });
});

describe("CSRF and origin on state-changing routes", () => {
  beforeEach(seedAll);
  const unsafe = CASES.filter(c => c.m !== "GET");
  for (const c of unsafe) {
    test(`${c.m} ${c.p}: needs X-CSRF-Token and a same-site Origin`, async () => {
      const role: RoleName = c.allowed.includes("researcher") ? "researcher" : "participant";
      const noToken = await call(c.m, c.p, { as: role, csrf: false, body: c.body });
      expect(noToken.status).toBe(403);
      expect((await noToken.json()).error).toBe("csrf_check_failed");
      const wrong = await call(c.m, c.p, { as: role, csrf: false, body: c.body, headers: { "X-CSRF-Token": "nope" } });
      expect(wrong.status).toBe(403);
      const cross = await call(c.m, c.p, { as: role, body: c.body, headers: { Origin: "https://evil.example" } });
      expect(cross.status).toBe(403);
      const crossFetchMeta = await call(c.m, c.p, { as: role, body: c.body, headers: { "Sec-Fetch-Site": "cross-site" } });
      expect(crossFetchMeta.status).toBe(403);
    });
  }
  test("a CSRF token from another user's session is refused", async () => {
    const a = await signIn(USERS.researcher);
    const b = await signIn(USERS.committee);
    const r = await fetch(url + "/api/sources/custom", { method: "POST", headers: { Cookie: a.cookie, "X-CSRF-Token": b.csrf, "Content-Type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });
});

describe("?role= and ?userName= are not trusted (LRS reads)", () => {
  beforeEach(seedAll);
  test("participant asking for role=researcher still sees only their own statements", async () => {
    const r = await call("GET", "/api/lrs/sql-lrs/statements?role=researcher&userName=other%40uni.edu&actor=Other", { as: "participant" });
    const j = await r.json();
    expect(j.accessScope).toBe("participant-privacy-scoped");
    const got = j.statements.map((s: any) => s.id).sort();
    expect(got).toEqual(["j1", "s1", "s2"]); // mbox, actor name, and account name, all matched exactly (case-insensitive)
  });
  test("researcher/committee/admin see everything, and ?role=participant does not shrink it", async () => {
    for (const role of STAFF) {
      const j = await (await call("GET", "/api/lrs/sql-lrs/statements?role=participant&userName=student%40uni.edu", { as: role })).json();
      expect(j.accessScope).toBe("researcher-full-system");
      expect(j.count).toBe(8);
    }
  });
  test("researcher search filter is a plain substring, % is not a wildcard", async () => {
    const all = await (await call("GET", "/api/lrs/sql-lrs/statements?actor=%25", { as: "researcher" })).json();
    expect(all.statements.map((s: any) => s.id)).toEqual(["p1"]); // only the one whose name really contains '%'
    const some = await (await call("GET", "/api/lrs/sql-lrs/statements?actor=other", { as: "researcher" })).json();
    expect(some.statements.map((s: any) => s.id)).toEqual(["o1"]);
  });
  test("/xapi/statements is scoped the same way; a read-only service token sees all", async () => {
    const mine = await (await call("GET", "/xapi/statements?role=researcher", { as: "participant" })).json();
    expect(mine.statements.map((s: any) => s.id).sort()).toEqual(["j1", "s1", "s2"]);
    const staff = await (await call("GET", "/xapi/statements", { as: "committee" })).json();
    expect(staff.statements.length).toBe(8);
    const svc = await (await call("GET", "/xapi/statements", { headers: bearer(SVC_RO) })).json();
    expect(svc.statements.length).toBe(8);
  });
  test("limit is clamped", async () => {
    const r = await (await call("GET", "/xapi/statements?limit=-5", { as: "researcher" })).json();
    expect(r.statements.length).toBe(8);
    const r2 = await (await call("GET", "/xapi/statements?limit=abc", { as: "researcher" })).json();
    expect(r2.statements.length).toBe(8);
  });
  test("handlers ignore role even when it is the only thing sent (no session = 401, not researcher access)", async () => {
    expect((await call("GET", "/api/lrs/sql-lrs/statements?role=researcher")).status).toBe(401);
    expect((await call("GET", "/api/lrs/duckdb-lrs/statements?role=researcher")).status).toBe(401);
  });
  test("participants must name a sessionUuid for the DuckDB view; DuckDB is off here so results are empty either way", async () => {
    const r = await (await call("GET", "/api/lrs/duckdb-lrs/statements?role=researcher", { as: "participant" })).json();
    expect(r.accessScope).toBe("participant-privacy-scoped");
    expect(r.sessionUuid).toBe("current-session-only");
  });
});

describe("delete my data: own data only, exact match, parameterized", () => {
  beforeEach(seedAll);

  test("a participant with no actor named deletes their own statements and nothing else", async () => {
    const r = await call("DELETE", "/xapi/statements/by-actor", { as: "participant" });
    expect(r.status).toBe(200);
    expect((await r.json()).deletedCount).toBe(3);
    expect(ids()).toEqual(["o1", "p1", "p2", "u1", "u2"]);
  });
  test("participant naming their own address (any case, or mailto:) is fine", async () => {
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=Student%40UNI.edu", { as: "participant" })).status).toBe(200);
    expect(count()).toBe(5);
    seedAll();
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=mailto%3Astudent%40uni.edu", { as: "participant" })).status).toBe(200);
    expect(count()).toBe(5);
  });
  test("participant naming someone else is refused and nothing is deleted", async () => {
    for (const actor of ["other@uni.edu", "mailto:other@uni.edu", "Other Person", "a%b", "axb", "x_y"]) {
      const r = await call("DELETE", `/xapi/statements/by-actor?actor=${encodeURIComponent(actor)}`, { as: "participant" });
      expect(r.status, actor).toBe(403);
    }
    expect(count()).toBe(8);
  });
  test("participant wildcard attempts: %, _, empty-ish, quotes, repeated params, all refused", async () => {
    for (const q of ["actor=%25", "actor=_", "actor=%25%40uni.edu", "actor=student%40uni.edu%25", "actor=%27%20OR%20%271%27%3D%271", "actor=a&actor=b", "agent=%25", "name=%25"]) {
      const r = await call("DELETE", `/xapi/statements/by-actor?${q}`, { as: "participant" });
      expect([400, 403], q).toContain(r.status);
    }
    expect(count()).toBe(8);
  });
  test("other delete routes bind participants the same way (POST body, path param)", async () => {
    expect((await call("POST", "/xapi/statements/delete-by-actor", { as: "participant", body: { actor: "%" } })).status).toBe(403);
    expect((await call("DELETE", "/xapi/actors/%25", { as: "participant" })).status).toBe(403);
    expect((await call("DELETE", "/api/lrs/actors/other%40uni.edu", { as: "participant" })).status).toBe(403);
    expect((await call("DELETE", "/xapi/statements?actor=other%40uni.edu", { as: "participant" })).status).toBe(403);
    expect(count()).toBe(8);
    expect((await call("DELETE", "/api/lrs/actors/student%40uni.edu", { as: "participant" })).status).toBe(200);
    expect(count()).toBe(5);
  });
  test("researcher: exact match only, so % and _ delete nothing", async () => {
    for (const actor of ["%", "a%", "%b", "x_", "_zy", "x_z", "%@uni.edu", "' OR '1'='1", "'; DROP TABLE xapi_statements; --"]) {
      const r = await call("DELETE", `/xapi/statements/by-actor?actor=${encodeURIComponent(actor)}`, { as: "researcher" });
      expect(r.status, actor).toBe(200);
      expect((await r.json()).deletedCount, actor).toBe(0);
    }
    expect(count()).toBe(8);
  });
  test("researcher: a literal % or _ in a real actor name deletes exactly that actor", async () => {
    expect((await (await call("DELETE", "/xapi/statements/by-actor?actor=a%25b", { as: "researcher" })).json()).deletedCount).toBe(1);
    expect(ids()).not.toContain("p1");
    expect(ids()).toContain("p2");
    expect((await (await call("DELETE", "/xapi/statements/by-actor?actor=x_y", { as: "researcher" })).json()).deletedCount).toBe(1);
    expect(ids()).not.toContain("u1");
    expect(ids()).toContain("u2");
  });
  test("researcher must name an actor; admin may delete any one actor", async () => {
    expect((await call("DELETE", "/xapi/statements/by-actor", { as: "researcher" })).status).toBe(400);
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=" + "z".repeat(300), { as: "researcher" })).status).toBe(400);
    const r = await call("DELETE", "/xapi/statements/by-actor?actor=mailto%3Aother%40uni.edu", { as: "admin" });
    expect((await r.json()).deletedCount).toBe(1);
    expect(ids()).not.toContain("o1");
  });
  test("committee cannot delete; service tokens cannot delete; anonymous cannot delete", async () => {
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=other%40uni.edu", { as: "committee" })).status).toBe(403);
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=other%40uni.edu", { headers: bearer(SVC_TOKEN) })).status).toBe(403); // valid token, but no service scope can delete
    expect((await call("DELETE", "/xapi/statements/by-actor?actor=other%40uni.edu")).status).toBe(401);
    expect(count()).toBe(8);
  });
  test("the stored data is intact after all of the above (table still exists)", () => {
    expect(count()).toBe(8);
  });
});

describe("unit: delete targets and DuckDB delete statement", () => {
  const participant = { kind: "session" as const, email: "Student@Uni.edu", role: "participant" as const };
  test("resolveDeleteTargets", () => {
    expect(resolveDeleteTargets(participant, undefined)).toEqual({ ok: true, actors: ownActorIds("student@uni.edu") });
    expect(resolveDeleteTargets(participant, "x")).toMatchObject({ ok: false, status: 403 });
    expect(resolveDeleteTargets(participant, ["student@uni.edu"])).toMatchObject({ ok: false, status: 400 });
    expect(resolveDeleteTargets(participant, { $ne: 1 })).toMatchObject({ ok: false, status: 400 });
    expect(resolveDeleteTargets({ kind: "session", email: "c@x.io", role: "committee" }, "a")).toMatchObject({ ok: false, status: 403 });
    expect(resolveDeleteTargets({ kind: "service", name: "s", scopes: new Set(["xapi:write"]) }, "a")).toMatchObject({ ok: false, status: 403 });
    expect(resolveDeleteTargets(undefined, "a")).toMatchObject({ ok: false, status: 403 });
  });
  test("readScopeFor", () => {
    expect(readScopeFor(undefined)).toEqual({ kind: "own", actors: [] });
    expect(readScopeFor(participant).kind).toBe("own");
    expect(readScopeFor({ kind: "session", email: "a@b.co", role: "researcher" }).kind).toBe("all");
    expect(readScopeFor({ kind: "service", name: "s", scopes: new Set(["marketplace:read"]) })).toEqual({ kind: "own", actors: [] });
  });
  test("the DuckDB delete is parameterized: no actor text in the SQL, and it runs", async () => {
    const evil = "x' OR 1=1 --";
    const { sql, params } = buildDuckDbDelete([evil, "%"]);
    expect(sql).not.toContain("OR 1=1");
    expect(sql).not.toContain("LIKE");
    expect(sql.match(/\?/g)!.length).toBe(params.length);
    const duckdb = (await import("duckdb")).default;
    const db = new duckdb.Database(":memory:");
    const run = (q: string, ...a: any[]) => new Promise<any>((res, rej) => db.run(q, ...a, (e: any) => (e ? rej(e) : res(null))));
    const all = (q: string) => new Promise<any[]>((res, rej) => db.all(q, (e: any, r: any) => (e ? rej(e) : res(r))));
    await run("CREATE TABLE xapi_audit_trail (session_uuid VARCHAR, agent_name VARCHAR, timestamp VARCHAR, xapi_payload VARCHAR)");
    await run(`INSERT INTO xapi_audit_trail VALUES ('s','alice','t','{"actor":{"name":"alice","mbox":"mailto:alice@x.io"}}'),('s','bob','t','{"actor":{"name":"bob"}}'),('s','bobby','t','{"actor":{"name":"bobby"}}')`);
    const del = buildDuckDbDelete(["%"]);
    await run(del.sql, ...del.params);
    expect((await all("SELECT count(*) c FROM xapi_audit_trail"))[0].c).toBe(3n);
    const del2 = buildDuckDbDelete(["mailto:alice@x.io", "bob"]);
    await run(del2.sql, ...del2.params);
    expect((await all("SELECT agent_name FROM xapi_audit_trail")).map(r => r.agent_name)).toEqual(["bobby"]);
  });
});

describe("xAPI state documents are per user", () => {
  beforeEach(seedAll);
  const q = "?activityId=https%3A%2F%2Fex%2Fa&stateId=workspace";
  test("one user's document is invisible to, and not overwritable by, another", async () => {
    expect((await call("PUT", "/xapi/activities/state" + q, { as: "participant", body: { papers: ["mine"] } })).status).toBe(204);
    expect((await (await call("GET", "/xapi/activities/state" + q, { as: "participant" })).json()).papers).toEqual(["mine"]);
    expect((await call("GET", "/xapi/activities/state" + q, { as: "researcher" })).status).toBe(404);
    expect((await call("PUT", "/xapi/activities/state" + q, { as: "researcher", body: { papers: ["theirs"] } })).status).toBe(204);
    expect((await (await call("GET", "/xapi/activities/state" + q, { as: "participant" })).json()).papers).toEqual(["mine"]);
  });
  test("ETag/If-Match still protects a user's own document", async () => {
    await call("PUT", "/xapi/activities/state" + q, { as: "participant", body: { v: 1 } });
    const first = await call("GET", "/xapi/activities/state" + q, { as: "participant" });
    const etag = first.headers.get("etag")!;
    expect((await call("PUT", "/xapi/activities/state" + q, { as: "participant", body: { v: 2 }, headers: { "If-Match": '"stale"' } })).status).toBe(409);
    expect((await call("PUT", "/xapi/activities/state" + q, { as: "participant", body: { v: 3 }, headers: { "If-Match": etag } })).status).toBe(204);
  });
  test("a service token has its own namespace", async () => {
    await call("PUT", "/xapi/activities/state" + q, { headers: bearer(SVC_TOKEN), body: { svc: true } });
    expect((await call("GET", "/xapi/activities/state" + q, { as: "admin" })).status).toBe(404);
    expect((await (await call("GET", "/xapi/activities/state" + q, { headers: bearer(SVC_TOKEN) })).json()).svc).toBe(true);
  });
});

describe("service tokens (non-browser clients)", () => {
  test("Bearer and Basic work without a cookie or CSRF on scoped routes", async () => {
    const post = { id: "i1", actor: { name: "x" }, verb: { id: "v" }, object: { id: "o" } };
    expect((await call("POST", "/xapi/statements", { headers: bearer(SVC_TOKEN), body: post })).status).toBe(200);
    expect((await call("POST", "/xapi/statements", { headers: basic("locallab", SVC_TOKEN), body: post })).status).toBe(200);
    const m = await call("POST", "/api/marketplace/capabilities", { headers: bearer(SVC_TOKEN), body: { manifest: {} } });
    expect(m.status).toBe(201);
    expect((await m.json()).author).toBe("service:locallab");
  });
  test("wrong token, wrong user name, malformed header: 401", async () => {
    for (const h of [bearer("x".repeat(40)), basic("locallab", "x".repeat(40)), basic("someone-else", SVC_TOKEN), { Authorization: "Bearer" }, { Authorization: "Basic !!!" }, { Authorization: "Token abc" }]) {
      expect((await call("GET", "/xapi/statements", { headers: h })).status).toBe(401);
    }
  });
  test("a valid token without the scope is 403, and never reaches other roles' routes", async () => {
    expect((await call("POST", "/xapi/statements", { headers: bearer(SVC_RO), body: { id: "i", actor: {}, verb: {}, object: {} } })).status).toBe(403);
    expect((await call("POST", "/api/marketplace/capabilities", { headers: bearer(SVC_RO), body: {} })).status).toBe(403);
    expect((await call("POST", "/api/local/verify", { headers: bearer(SVC_TOKEN), body: { filePath: "note.md" } })).status).toBe(403); // no service scope exists for it
    expect((await call("POST", "/api/sources/approve/src_a", { headers: bearer(SVC_TOKEN) })).status).toBe(403);
    expect((await call("GET", "/api/analytics/duckdb-export", { headers: bearer(SVC_TOKEN) })).status).toBe(403);
  });
  test("the MCP endpoint accepts a service token with the mcp scope", async () => {
    expect((await call("GET", "/mcp", { headers: bearer(SVC_TOKEN) })).status).toBe(200);
    expect((await call("GET", "/mcp", { headers: bearer(SVC_RO) })).status).toBe(403);
  });
  test("/xapi/about: no credentials is fine, bad credentials are 401, good ones are fine", async () => {
    expect((await call("GET", "/xapi/about")).status).toBe(200);
    expect((await call("GET", "/xapi/about", { headers: basic("locallab", "wrong".repeat(10)) })).status).toBe(401);
    expect((await call("GET", "/xapi/about", { headers: basic("locallab", SVC_TOKEN) })).status).toBe(200);
    // the old literal passwords no longer matter either way; they are simply invalid credentials
    expect((await call("GET", "/xapi/about", { headers: basic("u", "wrong") })).status).toBe(401);
  });
  test("env parsing: short tokens, unknown scopes and bad names are skipped and reported without echoing the token", () => {
    const short = "s".repeat(MIN_TOKEN_LENGTH - 1);
    const svc = loadServiceAuth({ SERVICE_TOKENS: `a|xapi:read|${short};b|bogus:scope|${"b".repeat(40)};BAD NAME|xapi:read|${"c".repeat(40)};ok|xapi:read|${"d".repeat(40)};ok|xapi:read|${"e".repeat(40)};none||${"f".repeat(40)}` } as any);
    expect(svc.size).toBe(1);
    expect(svc.problems.length).toBe(5);
    expect(svc.problems.join("\n")).not.toMatch(/[a-f]{30}/);
    expect(loadServiceAuth({} as any).size).toBe(0);
    expect(svc.authenticate({ headers: {} })).toEqual({ status: "none" });
  });
});

describe("CORS allowlist", () => {
  const get = (origin?: string, method = "GET", extra: Record<string, string> = {}) =>
    fetch(url + "/api/health", { method, headers: { ...(origin ? { Origin: origin } : {}), ...extra } });

  test("an allowlisted origin gets exactly its own origin back, never *", async () => {
    const r = await get("https://lab.example");
    expect(r.headers.get("access-control-allow-origin")).toBe("https://lab.example");
    expect(r.headers.get("vary")).toContain("Origin");
    expect(r.headers.get("access-control-allow-credentials")).toBeNull();
    const r2 = await get(PUBLIC);
    expect(r2.headers.get("access-control-allow-origin")).toBe(PUBLIC);
  });
  test("other origins, null, and look-alikes get no CORS headers", async () => {
    for (const o of ["https://evil.example", "null", "https://lab.example.evil.example", "http://lab.example", "https://lab.example:8443", "https://LAB.example.evil"]) {
      const r = await get(o);
      expect(r.headers.get("access-control-allow-origin"), o).toBeNull();
    }
    expect((await get()).headers.get("access-control-allow-origin")).toBeNull();
  });
  test("preflight: allowed 204 with the CSRF header permitted; disallowed 403 with no CORS headers", async () => {
    const ok = await get("https://lab.example", "OPTIONS", { "Access-Control-Request-Method": "POST" });
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-headers")).toContain("X-CSRF-Token");
    expect(ok.headers.get("access-control-allow-headers")).toContain("Authorization");
    const bad = await get("https://evil.example", "OPTIONS", { "Access-Control-Request-Method": "DELETE" });
    expect(bad.status).toBe(403);
    expect(bad.headers.get("access-control-allow-origin")).toBeNull();
    expect((await get("null", "OPTIONS")).status).toBe(403);
  });
  test("a wildcard in the environment is rejected and reported, not honoured", () => {
    const c = loadCorsConfig({ CORS_ALLOWED_ORIGINS: "*, https://ok.example, ftp://x.example, not-a-url, null" } as any);
    expect([...c.origins]).toEqual(["https://ok.example"]);
    expect(c.problems.join("|")).toMatch(/wildcard/);
    expect(c.problems.length).toBe(4);
    expect(loadCorsConfig({} as any).origins.size).toBe(0);
    expect([...loadCorsConfig({} as any, [PUBLIC, "", "http://localhost:3000"]).origins]).toEqual([PUBLIC, "http://localhost:3000"]);
  });
  test("a cross-origin site cannot ride a session even from an allowlisted origin without the CSRF token", async () => {
    const s = await signIn(USERS.researcher);
    const r = await fetch(url + "/api/sources/custom", { method: "POST", headers: { Origin: "https://lab.example", Cookie: s.cookie, "Content-Type": "application/json" }, body: "{}" });
    expect(r.status).toBe(403);
  });
});

describe("source approval link", () => {
  const link = (id: string, token: string) => `/api/sources/approve-token?id=${encodeURIComponent(id)}&token=${encodeURIComponent(token)}`;
  const tokenOf = (approvalUrl: string) => new URL(approvalUrl, "http://x").searchParams.get("token")!;
  const form = (id: string, token: string) => ({ method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ id, token }).toString() });
  const statusOf = (id: string) => registry.getAllSources().find(s => s.id === id)?.status;

  test("the registry endpoint never exposes tokens, digests, or the old clear-text token", async () => {
    const j = JSON.stringify(await (await call("GET", "/api/sources/registry")).json());
    expect(j).toContain("src_b");
    expect(j).not.toMatch(/approvalToken|approve_src_b|approvalTokenHash|approvalTokenExpiresAt/);
  });

  test("propose issues a 256-bit token; only its digest is stored; the response carries no digest", async () => {
    const r = await call("POST", "/api/sources/propose", { as: "researcher", body: { sourceId: "src_a" } });
    const j = await r.json();
    const token = tokenOf(j.approvalUrl);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(j.source)).not.toMatch(/approvalToken/);
    const file = fs.readFileSync(path.join(tmp, "registry.json"), "utf8");
    expect(file).not.toContain(token);
    expect(file).toContain("approvalTokenHash");
    expect(file).not.toContain("approve_src_b_1_abc123"); // the legacy clear-text token is gone from the file once the registry is saved
  });

  test("GET shows a confirmation page and changes nothing; POST with the right token approves; reuse fails", async () => {
    const j = await (await call("POST", "/api/sources/propose", { as: "researcher", body: { sourceId: "src_a" } })).json();
    const token = tokenOf(j.approvalUrl);
    const page = await fetch(url + link("src_a", token));
    expect(page.status).toBe(200);
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(page.headers.get("referrer-policy")).toBe("no-referrer");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(await page.text()).toContain('method="post"');
    expect(statusOf("src_a")).toBe("proposed"); // a link scanner fetching the URL approved nothing
    const wrong = await fetch(url + "/api/sources/approve-token", form("src_a", "A".repeat(43)));
    expect(wrong.status).toBe(400);
    expect(statusOf("src_a")).toBe("proposed");
    const ok = await fetch(url + "/api/sources/approve-token", form("src_a", token));
    expect(ok.status).toBe(200);
    expect(statusOf("src_a")).toBe("approved_active");
    expect((await fetch(url + "/api/sources/approve-token", form("src_a", token))).status).toBe(400); // single use
    expect((await fetch(url + link("src_a", token))).status).toBe(400);
  });

  test("missing, junk, other-source, legacy and expired tokens are all refused with the same page", async () => {
    const j = await (await call("POST", "/api/sources/propose", { as: "researcher", body: { sourceId: "src_b" } })).json();
    const tokenB = tokenOf(j.approvalUrl);
    const bodies = new Set<string>();
    const attempts: [string, string][] = [
      ["src_b", ""], ["src_b", "junk"], ["src_b", "approve_src_b_1_abc123"], ["src_b", "A".repeat(43)], ["src_a", tokenB], ["nope", tokenB], ["", ""], ["src_b", tokenB + "x"],
    ];
    for (const [id, t] of attempts) {
      const g = await fetch(url + link(id, t));
      expect(g.status, `${id}/${t}`).toBe(400);
      bodies.add(await g.text());
      expect((await fetch(url + "/api/sources/approve-token", form(id, t))).status).toBe(400);
    }
    expect(bodies.size).toBe(1);
    expect(statusOf("src_b")).toBe("proposed");
    // expiry
    const src = registry.getAllSources().find(s => s.id === "src_b")!;
    const saved = src.approvalTokenExpiresAt;
    src.approvalTokenExpiresAt = new Date(Date.now() - 1000).toISOString();
    expect((await fetch(url + "/api/sources/approve-token", form("src_b", tokenB))).status).toBe(400);
    src.approvalTokenExpiresAt = saved;
    // no params at all
    expect((await fetch(url + "/api/sources/approve-token")).status).toBe(400);
    expect((await fetch(url + "/api/sources/approve-token?id[]=a&token[]=b")).status).toBe(400);
  });

  test("the approval pages escape everything they print and never echo the request", async () => {
    const evilName = `<script>alert(1)</script> & "q" 'a'`;
    const created = await (await call("POST", "/api/sources/custom", { as: "researcher", body: { name: evilName, id: "evil_src" } })).json();
    expect(created.source.id).toBe("evil_src");
    const j = await (await call("POST", "/api/sources/propose", { as: "researcher", body: { sourceId: "evil_src" } })).json();
    const token = tokenOf(j.approvalUrl);
    const page = await (await fetch(url + link("evil_src", token))).text();
    expect(page).not.toContain("<script>alert(1)");
    expect(page).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;q&quot; &#39;a&#39;");
    const done = await (await fetch(url + "/api/sources/approve-token", form("evil_src", token))).text();
    expect(done).not.toContain("<script>alert(1)");
    expect(done).toContain("&lt;script&gt;");
    const bad = await (await fetch(url + link('"><script>alert(2)</script>', '"><img src=x onerror=alert(3)>'))).text();
    expect(bad).not.toContain("alert(2)");
    expect(bad).not.toContain("onerror");
    // hidden inputs of a valid page are attribute-escaped
    expect(page).toMatch(/name="id" value="evil_src"/);
  });

  test("approve/reject also clear any outstanding token; custom sources cannot shadow existing ids or smuggle types", async () => {
    const t = await (await call("POST", "/api/sources/propose", { as: "researcher", body: { sourceId: "src_b" } })).json();
    const token = tokenOf(t.approvalUrl);
    await call("POST", "/api/sources/reject/src_b", { as: "committee" });
    expect(statusOf("src_b")).toBe("rejected");
    expect((await fetch(url + "/api/sources/approve-token", form("src_b", token))).status).toBe(400);
    const dup = await (await call("POST", "/api/sources/custom", { as: "researcher", body: { id: "src_b", name: { $x: 1 }, category: "<img>", protocol: "FTP", endpointUrl: 5 } })).json();
    expect(dup.source.id).not.toBe("src_b");
    expect(dup.source.name).toBe("New Discovered Repository");
    expect(dup.source.category).toBe("multidisciplinary");
    expect(dup.source.protocol).toBe("REST");
    expect(dup.source.endpointUrl).toBe("");
  });

  test("unit: token digest, binding and expiry", () => {
    const s: any = { id: "a" };
    const tok = issueApprovalToken(s, 1000);
    expect(approvalTokenValid(s, tok, 1001)).toBe(true);
    expect(approvalTokenValid(s, tok, 1000 + 7 * 24 * 3600_000)).toBe(false);
    expect(approvalTokenValid({ ...s, id: "b" }, tok + "", 1001)).toBe(true); // id binding is enforced by the caller looking the source up by id
    expect(approvalTokenValid(s, undefined)).toBe(false);
    expect(approvalTokenValid(s, "short")).toBe(false);
    expect(approvalTokenValid(undefined, tok)).toBe(false);
    expect(s.approvalTokenHash).not.toContain(tok);
  });
});

describe("local verify route", () => {
  beforeEach(() => { verifyCalls = []; });
  test("a researcher can run it on a vault file; nothing reaches the runner for anyone else", async () => {
    expect((await call("POST", "/api/local/verify", { as: "participant", body: { filePath: "note.md" } })).status).toBe(403);
    expect((await call("POST", "/api/local/verify", { body: { filePath: "note.md" } })).status).toBe(401);
    expect((await call("POST", "/api/local/verify", { as: "researcher", csrf: false, body: { filePath: "note.md" } })).status).toBe(403);
    expect(verifyCalls.length).toBe(0);
    const ok = await call("POST", "/api/local/verify", { as: "researcher", body: { filePath: "note.md" } });
    expect(ok.status).toBe(200);
    expect(verifyCalls.length).toBe(1);
  });
});

describe("marketplace author comes from the session", () => {
  test("a spoofed x-local-lab-author header or body author is ignored", async () => {
    const r = await call("POST", "/api/marketplace/capabilities", { as: "researcher", body: { author: "Ashley", manifest: {} }, headers: { "x-local-lab-author": "Ashley" } });
    expect((await r.json()).author).toBe("pi@uni.edu");
  });
});

describe("WebSocket relay upgrade", () => {
  const host = "scholar.example";
  const deps = () => ({ auth, service: lock.service, allowedOrigins: lock.cors.origins });
  const withSession = async (role: RoleName, headers: Record<string, string> = {}) => ({ headers: { cookie: (await signIn(USERS[role])).cookie, host, ...headers } });
  test("anonymous 401; participant/committee 403; researcher needs a same-site Origin; service token needs the relay scope", async () => {
    expect(authorizeRelayUpgrade({ headers: { host } }, deps())).toMatchObject({ ok: false, status: 401 });
    expect(authorizeRelayUpgrade(await withSession("participant", { origin: PUBLIC }), deps())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeRelayUpgrade(await withSession("committee", { origin: PUBLIC }), deps())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeRelayUpgrade(await withSession("researcher"), deps())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeRelayUpgrade(await withSession("researcher", { origin: "https://evil.example" }), deps())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeRelayUpgrade(await withSession("researcher", { origin: "https://scholar.example" }), deps())).toEqual({ ok: true });
    expect(authorizeRelayUpgrade(await withSession("admin", { origin: "https://lab.example" }), deps())).toEqual({ ok: true });
    expect(authorizeRelayUpgrade({ headers: { host, authorization: `Bearer ${SVC_TOKEN}` } }, deps())).toEqual({ ok: true });
    expect(authorizeRelayUpgrade({ headers: { host, authorization: `Bearer ${SVC_RO}` } }, deps())).toMatchObject({ ok: false, status: 403 });
    expect(authorizeRelayUpgrade({ headers: { host, authorization: "Bearer " + "q".repeat(40) } }, deps())).toMatchObject({ ok: false, status: 401 });
  });
});
