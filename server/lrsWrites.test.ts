/**
 * Fix 2 (no silent saves), server side: statements are really stored and can be read back, and a storage
 * failure is an error response, never a 200/204 with a made-up id or ETag.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { registerLrsRoutes } from "./lrsRoutes";
import { SqlLrsStore, useSqlLrsStore } from "./lrsDatabase";

let srv: import("http").Server;
let url = "";
let previous: SqlLrsStore | null = null;
let principal: any = { kind: "session", email: "Student@Uni.edu", role: "participant" };

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).principal = principal; next(); });
  registerLrsRoutes(app);
  srv = await new Promise(res => { const s = app.listen(0, "127.0.0.1", () => res(s)); });
  url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => { srv?.close(); });

beforeEach(() => { previous = useSqlLrsStore(new SqlLrsStore(new DatabaseSync(":memory:"))); principal = { kind: "session", email: "Student@Uni.edu", role: "participant" }; });
afterEach(() => { useSqlLrsStore(previous); });

const stmt = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  actor: { objectType: "Agent", name: "Participant", account: { homePage: "https://scholar-explorer.com/dbr-study", name: "u-1" } },
  verb: { id: "http://adlnet.gov/expapi/verbs/selected", display: { "en-US": "selected" } },
  object: { id: "https://doi.org/10.1000/xyz", definition: { name: { "en-US": "A paper" } } },
  ...extra,
});
const post = (body: unknown) => fetch(url + "/xapi/statements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const put = (body: unknown, ifMatch?: string) => fetch(url + "/xapi/activities/state?activityId=a&stateId=workspace", { method: "PUT", headers: { "Content-Type": "application/json", ...(ifMatch ? { "If-Match": ifMatch } : {}) }, body: JSON.stringify(body) });

describe("POST /xapi/statements stores what it acknowledges", () => {
  test("posted statements can be read back by the person who posted them", async () => {
    const r = await post([stmt("00000000-0000-4000-8000-000000000001"), stmt("00000000-0000-4000-8000-000000000002", { timestamp: "2026-11-14T22:00:00-05:00" })]);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]);

    const got = await (await fetch(url + "/xapi/statements")).json();
    const ids = got.statements.map((s: any) => s.id).sort();
    expect(ids).toEqual(["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"]);
    const second = got.statements.find((s: any) => s.id.endsWith("2"));
    expect(second.timestamp).toBe("2026-11-15T03:00:00.000Z"); // normalized to UTC Z
    expect(second.stored).toMatch(/Z$/);
    expect(second.authority).toEqual({ objectType: "Agent", mbox: "mailto:student@uni.edu" });
    expect(second.object.definition.name["en-US"]).toBe("A paper");
  });

  test("different input produces different stored output", async () => {
    await post(stmt("00000000-0000-4000-8000-0000000000a1", { object: { id: "https://doi.org/10.1/a" } }));
    await post(stmt("00000000-0000-4000-8000-0000000000b1", { object: { id: "https://doi.org/10.1/b" } }));
    const got = await (await fetch(url + "/xapi/statements")).json();
    expect(got.statements.map((s: any) => s.object.id).sort()).toEqual(["https://doi.org/10.1/a", "https://doi.org/10.1/b"]);
  });

  test("append-only: a retry with the same content is accepted once, changed content is a 409, rows cannot be updated", async () => {
    const s = stmt("00000000-0000-4000-8000-000000000003");
    expect((await post(s)).status).toBe(200);
    expect((await post(s)).status).toBe(200);
    expect((await post({ ...s, verb: { id: "http://adlnet.gov/expapi/verbs/rejected" } })).status).toBe(409);
    const store = useSqlLrsStore(null)!; useSqlLrsStore(store);
    expect(store.count()).toBe(1);
    expect(() => store.db.exec(`UPDATE xapi_statements SET verb_id = 'x'`)).toThrow(/append-only/);
  });

  test("a batch is all or nothing", async () => {
    const r = await post([stmt("00000000-0000-4000-8000-000000000004"), stmt("00000000-0000-4000-8000-000000000005", { timestamp: "yesterday" })]);
    expect(r.status).toBe(400);
    const store = useSqlLrsStore(null)!; useSqlLrsStore(store);
    expect(store.count()).toBe(0);
  });

  test("a storage failure is a 500 and no ids are returned", async () => {
    const db = new DatabaseSync(":memory:");
    useSqlLrsStore(new SqlLrsStore(db));
    db.close(); // forced server storage failure
    const r = await post(stmt("00000000-0000-4000-8000-000000000006"));
    expect(r.status).toBe(500);
    const body = await r.json();
    expect(Array.isArray(body)).toBe(false);
    expect(body.error).toBe("statements_not_stored");
  });

  test("the legacy /api/lrs/sql-lrs and duckdb-lrs POST routes also store, or fail", async () => {
    const a = await fetch(url + "/api/lrs/sql-lrs/statements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(stmt("00000000-0000-4000-8000-000000000007")) });
    expect(a.status).toBe(201);
    const b = await fetch(url + "/api/lrs/duckdb-lrs/statements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...stmt(""), id: undefined }) });
    expect(b.status).toBe(201);
    const bid = (await b.json()).id;
    expect(bid).toMatch(/^[0-9a-f-]{36}$/);
    const got = await (await fetch(url + "/xapi/statements")).json();
    expect(got.statements.map((s: any) => s.id)).toContain(bid);
    expect(got.statements.map((s: any) => s.id)).toContain("00000000-0000-4000-8000-000000000007");
  });
});

describe("PUT /xapi/activities/state never fakes an ETag", () => {
  test("a saved document reads back with the ETag the PUT returned", async () => {
    const r = await put({ papers: [{ id: "W1" }] });
    expect(r.status).toBe(204);
    const etag = r.headers.get("ETag");
    expect(etag).toBeTruthy();
    const g = await fetch(url + "/xapi/activities/state?activityId=a&stateId=workspace");
    expect(g.headers.get("ETag")).toBe(etag);
    expect(await g.json()).toEqual({ papers: [{ id: "W1" }] });
  });

  test("a forced database failure is a 500 with no state ETag, and the store method throws", async () => {
    const db = new DatabaseSync(":memory:");
    const store = new SqlLrsStore(db);
    useSqlLrsStore(store);
    db.close();
    expect(() => store.putState("a", "s", { x: 1 })).toThrow();
    const r = await put({ papers: [] });
    expect(r.status).toBe(500);
    // No state ETag ("<ms>-<rand>"); Express may still add its weak body hash to the error JSON.
    expect(r.headers.get("ETag") ?? "").not.toMatch(/^"\d+(-|")/);
    expect((await r.json()).error).toBe("state_not_saved");
  });

  test("the store survives a reopen of its file (durable on disk)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lrs-durable-"));
    const file = path.join(dir, "sql_lrs.sqlite");
    const a = new SqlLrsStore(new DatabaseSync(file));
    a.insertStatements([stmt("00000000-0000-4000-8000-000000000008")], null);
    a.db.close();
    const b = new SqlLrsStore(new DatabaseSync(file));
    expect(b.queryConforming({ scope: { kind: "all" } }).map(s => s.id)).toEqual(["00000000-0000-4000-8000-000000000008"]);
    b.db.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
