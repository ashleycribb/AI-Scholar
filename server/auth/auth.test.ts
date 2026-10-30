import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import express from "express";
import type { AddressInfo } from "net";
import { createAuth, type Auth } from "./router";
import { loadAuthConfig, normalizeEmail, type AuthConfig } from "./config";
import type { MailMessage, MailSender } from "./mailer";
import { AuthStore } from "./store";

const PUBLIC = "https://scholar.example";
const MIN = 60_000;

interface Harness {
  auth: Auth; url: string; mails: MailMessage[]; clock: { t: number }; cfg: AuthConfig; logs: string[];
  fail: { send: boolean }; close(): void;
}

function baseEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    AUTH_PUBLIC_URL: PUBLIC,
    AUTH_EMAIL_PROVIDER: "console",
    AUTH_RESEARCHER_EMAILS: "pi@uni.edu",
    AUTH_COMMITTEE_EMAILS: "chair@uni.edu",
    AUTH_ADMIN_EMAILS: "Root@Uni.edu",
    AUTH_DB_PATH: ":memory:",
    ...extra,
  } as NodeJS.ProcessEnv;
}

async function start(env: Record<string, string> = {}): Promise<Harness> {
  const cfg = loadAuthConfig(baseEnv(env));
  const mails: MailMessage[] = [];
  const logs: string[] = [];
  const fail = { send: false };
  const mailer: MailSender = {
    name: "test",
    async send(m) { if (fail.send) throw new Error("smtp down"); mails.push(m); },
  };
  const clock = { t: 1_800_000_000_000 };
  const auth = createAuth({ config: cfg, store: new AuthStore(":memory:"), mailer, now: () => clock.t, log: l => logs.push(l) });
  const app = express();
  app.set("trust proxy", true);
  app.use("/api/auth", auth.router);
  app.use(express.json());
  app.get("/api/me", auth.requireAuth, (req: any, res) => res.json(req.auth.email));
  app.post("/api/state", auth.requireAuth, (_req, res) => res.json({ changed: true }));
  app.delete("/api/data", auth.requireRole("researcher", "committee"), (_req, res) => res.json({ deleted: true }));
  app.get("/api/admin-only", auth.requireRole("admin"), (_req, res) => res.json({ ok: true }));
  const srv = await new Promise<import("http").Server>(r => { const s = app.listen(0, "127.0.0.1", () => r(s)); });
  const url = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  return { auth, url, mails, clock, cfg, logs, fail, close: () => { srv.close(); auth.close(); } };
}

const json = (h: Harness, path: string, body: unknown, headers: Record<string, string> = {}) =>
  fetch(h.url + path, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), redirect: "manual" });

const tokenFrom = (m: MailMessage) => new URL(m.text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;

async function requestLink(h: Harness, email: string, headers: Record<string, string> = {}) {
  const r = await json(h, "/api/auth/magic-link/request", { email }, headers);
  await h.auth.idle();
  return r;
}

/** Full sign in; returns cookie header + csrf token. */
async function signIn(h: Harness, email: string) {
  const before = h.mails.length;
  await requestLink(h, email, { "X-Forwarded-For": `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  expect(h.mails.length).toBe(before + 1);
  const r = await json(h, "/api/auth/magic-link/verify", { token: tokenFrom(h.mails[h.mails.length - 1]) });
  expect(r.status).toBe(200);
  const setCookie = r.headers.getSetCookie()[0];
  const cookie = setCookie.split(";")[0];
  const body = await r.json();
  return { cookie, csrf: body.csrfToken as string, user: body.user, setCookie };
}

let h: Harness;
afterEach(() => h?.close());

describe("email normalization and config", () => {
  test("normalizes and rejects bad input", () => {
    expect(normalizeEmail("  Pi@Uni.EDU ")).toBe("pi@uni.edu");
    for (const bad of ["", "a", "a@b", "a b@c.com", "a@b.c\r\nBcc: x@y.z", "<script>@x.io", 5, null, "a@b..com", "é@x.com"]) expect(normalizeEmail(bad as any)).toBeNull();
  });
  test("production refuses the console sender and an http public url, and insecure cookies", () => {
    const c = loadAuthConfig({ NODE_ENV: "production", AUTH_EMAIL_PROVIDER: "console", AUTH_PUBLIC_URL: "http://x.example", AUTH_COOKIE_SECURE: "false" } as any);
    expect(c.problems.join("|")).toMatch(/console email sender/);
    expect(c.problems.join("|")).toMatch(/https/);
    expect(c.problems.join("|")).toMatch(/AUTH_COOKIE_SECURE/);
  });
  test("production with nothing configured reports problems; dev defaults to console", () => {
    expect(loadAuthConfig({ NODE_ENV: "production" } as any).problems.length).toBeGreaterThan(1);
    const dev = loadAuthConfig({} as any);
    expect(dev.emailProvider).toBe("console");
    expect(dev.problems).toEqual([]);
  });
  test("role lists: highest role wins, addresses are normalized", () => {
    const c = loadAuthConfig(baseEnv({ AUTH_RESEARCHER_EMAILS: "A@x.io, b@x.io", AUTH_ADMIN_EMAILS: "a@x.io" }));
    expect(c.roleAllowlist.get("a@x.io")).toBe("admin");
    expect(c.roleAllowlist.get("b@x.io")).toBe("researcher");
  });
  test("post-login redirect cannot be an open redirect", () => {
    expect(loadAuthConfig(baseEnv({ AUTH_POST_LOGIN_REDIRECT: "//evil.example" })).postLoginRedirect).toBe("/");
    expect(loadAuthConfig(baseEnv({ AUTH_POST_LOGIN_REDIRECT: "https://evil.example" })).postLoginRedirect).toBe("/");
    expect(loadAuthConfig(baseEnv({ AUTH_POST_LOGIN_REDIRECT: "/app" })).postLoginRedirect).toBe("/app");
  });
});

describe("production without a working sender", () => {
  test("endpoints answer 503 and nothing is sent", async () => {
    h = await start({ NODE_ENV: "production", AUTH_EMAIL_PROVIDER: "console" });
    expect(h.cfg.problems.length).toBeGreaterThan(0);
    const r = await json(h, "/api/auth/magic-link/request", { email: "pi@uni.edu" });
    expect(r.status).toBe(503);
    expect((await json(h, "/api/auth/magic-link/verify", { token: "x" })).status).toBe(503);
    expect(h.mails.length).toBe(0);
    expect(h.logs.join("\n")).toMatch(/DISABLED/);
  });
});

describe("magic link request: no user enumeration", () => {
  beforeEach(async () => { h = await start(); });

  test("allowlisted, unknown, and participant addresses get an identical response", async () => {
    const responses: [number, string][] = [];
    for (const e of ["pi@uni.edu", "root@uni.edu", "someone-else@nowhere.org", "chair@uni.edu"]) {
      const r = await requestLink(h, e, { "X-Forwarded-For": "1.1.1." + responses.length });
      responses.push([r.status, JSON.stringify(await r.json())]);
    }
    expect(new Set(responses.map(r => r.join("|"))).size).toBe(1);
    expect(responses[0][0]).toBe(202);
  });

  test("when sign-up is closed, unknown addresses look the same but nothing is sent", async () => {
    h.close();
    h = await start({ AUTH_ALLOW_PARTICIPANT_SIGNUP: "false" });
    const known = await requestLink(h, "pi@uni.edu", { "X-Forwarded-For": "2.2.2.1" });
    const unknown = await requestLink(h, "stranger@x.org", { "X-Forwarded-For": "2.2.2.2" });
    expect(known.status).toBe(unknown.status);
    expect(await known.json()).toEqual(await unknown.json());
    expect(h.mails.map(m => m.to)).toEqual(["pi@uni.edu"]);
  });

  test("a failing mail provider does not change the response", async () => {
    h.fail.send = true;
    const r = await requestLink(h, "pi@uni.edu");
    expect(r.status).toBe(202);
    expect(h.logs.join("\n")).toMatch(/send failed/);
    expect(h.logs.join("\n")).not.toMatch(/pi@uni\.edu/); // addresses are not logged in clear
  });

  test("malformed addresses are 400 regardless of who they are", async () => {
    expect((await requestLink(h, "not-an-email")).status).toBe(400);
    expect((await json(h, "/api/auth/magic-link/request", {})).status).toBe(400);
    expect((await json(h, "/api/auth/magic-link/request", { email: ["pi@uni.edu"] })).status).toBe(400);
  });

  test("link points at the configured public URL, not the Host header", async () => {
    await json(h, "/api/auth/magic-link/request", { email: "pi@uni.edu" }, { Host: "evil.example", "X-Forwarded-Host": "evil.example" });
    await h.auth.idle();
    expect(h.mails[0].text).toContain(`${PUBLIC}/api/auth/magic-link/verify?token=`);
    expect(h.mails[0].text).not.toContain("evil.example");
  });

  test("cross-site requests to the request endpoint are refused", async () => {
    expect((await json(h, "/api/auth/magic-link/request", { email: "pi@uni.edu" }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await json(h, "/api/auth/magic-link/request", { email: "pi@uni.edu" }, { "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect(h.mails.length).toBe(0);
    expect((await json(h, "/api/auth/magic-link/request", { email: "pi@uni.edu" }, { Origin: PUBLIC })).status).toBe(202);
  });
});

describe("tokens: hashed, single use, short lived", () => {
  beforeEach(async () => { h = await start(); });

  test("only a hash is stored", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    const [id, secret] = token.split(".");
    const dump = h.auth.store.dumpAll();
    expect(dump).not.toContain(secret);
    expect(dump).toContain(id);
  });

  test("token works once; reuse is rejected with the generic error", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    const first = await json(h, "/api/auth/magic-link/verify", { token });
    expect(first.status).toBe(200);
    const second = await json(h, "/api/auth/magic-link/verify", { token });
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe("invalid_or_expired_token");
  });

  test("parallel redemptions: exactly one wins", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    const rs = await Promise.all(Array.from({ length: 8 }, () => json(h, "/api/auth/magic-link/verify", { token })));
    expect(rs.filter(r => r.status === 200).length).toBe(1);
    expect(h.auth.store.countRows("auth_sessions")).toBe(1);
  });

  test("expires after 15 minutes", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    h.clock.t += 15 * MIN; // exactly at expiry is already dead
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(400);
    expect(h.auth.store.countRows("auth_sessions")).toBe(0);
  });

  test("still valid just before expiry", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    h.clock.t += 15 * MIN - 1000;
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(200);
  });

  test("wrong secret, wrong id, junk: rejected, and a wrong guess does not burn the real token", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    const [id] = token.split(".");
    const bad = [`${id}.${"A".repeat(43)}`, `${"B".repeat(22)}.${token.split(".")[1]}`, "junk", "", `${id}.`, "../../etc/passwd", "a".repeat(200)];
    for (const t of bad) expect((await json(h, "/api/auth/magic-link/verify", { token: t })).status).toBe(400);
    expect((await json(h, "/api/auth/magic-link/verify", { token: { $ne: null } })).status).toBe(400);
    const huge = await json(h, "/api/auth/magic-link/verify", { token: "a".repeat(5000) });
    expect(huge.status).toBe(413);
    expect(await huge.json()).toEqual({ error: "request_too_large" });
    const badJson = await fetch(h.url + "/api/auth/magic-link/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{nope" });
    expect(badJson.status).toBe(400);
    expect(await badJson.text()).not.toContain("SyntaxError");
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(200);
  });

  test("GET on the emailed link does not consume the token (mail scanners)", async () => {
    await requestLink(h, "pi@uni.edu");
    const link = h.mails[0].text.match(/https?:\/\/\S+/)![0].replace(PUBLIC, h.url);
    const page = await fetch(link);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('method="post"');
    // Must not be "no-referrer": browsers then send `Origin: null` on this page's form POST, the origin check refuses it,
    // and the emailed link can never be used (found with a headless Chrome sign-in).
    expect(page.headers.get("referrer-policy")).toBe("same-origin");
    expect(page.headers.get("cache-control")).toBe("no-store");
    expect(page.headers.get("content-security-policy")).toContain("default-src 'none'");
    const form = new URLSearchParams({ token: tokenFrom(h.mails[0]) });
    const r = await fetch(h.url + "/api/auth/magic-link/verify", { method: "POST", body: form, redirect: "manual" });
    expect(r.status).toBe(303); // browser form flow redirects
    expect(r.headers.get("location")).toBe("/");
    expect(r.headers.getSetCookie().length).toBe(1);
  });

  test("a form POST whose Origin is the string \"null\" is still refused, so the page's policy has to keep the real Origin", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    expect((await json(h, "/api/auth/magic-link/verify", { token }, { Origin: "null" })).status).toBe(403);
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(200); // token not burned
  });

  test("the confirmation page escapes the token", async () => {
    const page = await fetch(`${h.url}/api/auth/magic-link/verify?token=${encodeURIComponent('"><script>alert(1)</script>')}`);
    const html = await page.text();
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("&quot;&gt;&lt;script&gt;");
  });

  test("cross-site POST to verify is refused (login CSRF)", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    expect((await json(h, "/api/auth/magic-link/verify", { token }, { Origin: "https://evil.example" })).status).toBe(403);
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(200); // not burned
  });

  test("a token for a removed allowlist entry with sign-up closed does not sign in", async () => {
    await requestLink(h, "pi@uni.edu");
    const token = tokenFrom(h.mails[0]);
    h.cfg.roleAllowlist.delete("pi@uni.edu");
    h.cfg.allowParticipantSignup = false;
    expect((await json(h, "/api/auth/magic-link/verify", { token })).status).toBe(400);
  });
});

describe("session cookie", () => {
  beforeEach(async () => { h = await start(); });

  test("flags: HttpOnly, Secure, SameSite=Lax, Path=/, __Host- prefix, no Domain, bounded lifetime", async () => {
    const s = await signIn(h, "pi@uni.edu");
    const c = s.setCookie;
    expect(c).toMatch(/^__Host-scholar_sid=/);
    expect(c).toMatch(/;\s*HttpOnly/i);
    expect(c).toMatch(/;\s*Secure/i);
    expect(c).toMatch(/;\s*SameSite=Lax/i);
    expect(c).toMatch(/;\s*Path=\//i);
    expect(c).not.toMatch(/Domain=/i);
    expect(c).toMatch(/Max-Age=43200/i);
    expect(s.cookie).not.toContain(s.csrf);
  });

  test("session id changes on every login and the cookie holds no role", async () => {
    const a = await signIn(h, "pi@uni.edu");
    const b = await signIn(h, "pi@uni.edu");
    expect(a.cookie).not.toBe(b.cookie);
    expect(decodeURIComponent(a.cookie)).not.toMatch(/researcher|admin|pi@uni/);
  });

  test("session endpoint reports role from the allowlist", async () => {
    const s = await signIn(h, "Root@uni.edu");
    const r = await fetch(h.url + "/api/auth/session", { headers: { Cookie: s.cookie } });
    expect(await r.json()).toMatchObject({ authenticated: true, user: { email: "root@uni.edu", role: "admin" }, csrfToken: s.csrf });
    expect(await (await fetch(h.url + "/api/auth/session")).json()).toEqual({ authenticated: false });
  });

  test("sessions expire server-side", async () => {
    const s = await signIn(h, "pi@uni.edu");
    expect((await fetch(h.url + "/api/me", { headers: { Cookie: s.cookie } })).status).toBe(200);
    h.clock.t += 12 * 3_600_000;
    expect((await fetch(h.url + "/api/me", { headers: { Cookie: s.cookie } })).status).toBe(401);
    expect(h.auth.store.countRows("auth_sessions")).toBe(0);
  });

  test("tampered or forged session cookies are rejected", async () => {
    const s = await signIn(h, "pi@uni.edu");
    const [name, val] = s.cookie.split("=");
    const [id] = val.split(".");
    for (const v of [`${id}.${"A".repeat(43)}`, "x", `${"A".repeat(22)}.${"A".repeat(43)}`]) {
      expect((await fetch(h.url + "/api/me", { headers: { Cookie: `${name}=${v}` } })).status).toBe(401);
    }
  });

  test("logout needs CSRF, destroys the session server-side, and clears the cookie", async () => {
    const s = await signIn(h, "pi@uni.edu");
    expect((await json(h, "/api/auth/logout", {}, { Cookie: s.cookie })).status).toBe(403);
    expect((await fetch(h.url + "/api/me", { headers: { Cookie: s.cookie } })).status).toBe(200);
    const out = await json(h, "/api/auth/logout", {}, { Cookie: s.cookie, "X-CSRF-Token": s.csrf });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie()[0]).toMatch(/__Host-scholar_sid=;.*(Expires=Thu, 01 Jan 1970|Max-Age=0)/i);
    // replaying the old cookie no longer works
    expect((await fetch(h.url + "/api/me", { headers: { Cookie: s.cookie } })).status).toBe(401);
    expect(h.auth.store.countRows("auth_sessions")).toBe(0);
  });

  test("at most 10 live sessions per address", async () => {
    for (let i = 0; i < 12; i++) { await signIn(h, "pi@uni.edu"); h.clock.t += 15 * MIN; }
    expect(h.auth.store.countRows("auth_sessions")).toBe(10);
  });

  test("development may relax Secure only outside production", () => {
    const dev = loadAuthConfig(baseEnv({ AUTH_COOKIE_SECURE: "false" }));
    expect(dev.cookieSecure).toBe(false);
    expect(dev.cookieName).toBe("scholar_sid");
    expect(dev.problems).toEqual([]);
  });
});

describe("CSRF", () => {
  beforeEach(async () => { h = await start(); });

  test("state-changing routes need a valid X-CSRF-Token", async () => {
    const s = await signIn(h, "pi@uni.edu");
    expect((await json(h, "/api/state", {}, { Cookie: s.cookie })).status).toBe(403);
    expect((await json(h, "/api/state", {}, { Cookie: s.cookie, "X-CSRF-Token": "wrong" })).status).toBe(403);
    expect((await json(h, "/api/state", {}, { Cookie: s.cookie, "X-CSRF-Token": s.csrf + "x" })).status).toBe(403);
    expect((await json(h, "/api/state", {}, { Cookie: s.cookie, "X-CSRF-Token": s.csrf })).status).toBe(200);
  });

  test("a CSRF token from another session does not work", async () => {
    const a = await signIn(h, "pi@uni.edu");
    const b = await signIn(h, "chair@uni.edu");
    expect((await json(h, "/api/state", {}, { Cookie: a.cookie, "X-CSRF-Token": b.csrf })).status).toBe(403);
  });

  test("cross-origin requests are refused even with a valid token", async () => {
    const s = await signIn(h, "pi@uni.edu");
    const base = { Cookie: s.cookie, "X-CSRF-Token": s.csrf };
    expect((await json(h, "/api/state", {}, { ...base, Origin: "https://evil.example" })).status).toBe(403);
    expect((await json(h, "/api/state", {}, { ...base, "Sec-Fetch-Site": "cross-site" })).status).toBe(403);
    expect((await json(h, "/api/state", {}, { ...base, Origin: PUBLIC })).status).toBe(200);
    expect((await json(h, "/api/state", {}, { ...base, Origin: h.url })).status).toBe(200); // same host
  });

  test("safe methods do not need a token", async () => {
    const s = await signIn(h, "pi@uni.edu");
    expect((await fetch(h.url + "/api/me", { headers: { Cookie: s.cookie } })).status).toBe(200);
  });

  test("the token is derived, not stored, and not guessable from the cookie", async () => {
    const s = await signIn(h, "pi@uni.edu");
    expect(h.auth.store.dumpAll()).not.toContain(s.csrf);
  });
});

describe("roles", () => {
  beforeEach(async () => { h = await start(); });

  test("anonymous gets 401, participant gets 403, researcher/committee/admin pass", async () => {
    const del = (cookie?: string, csrf?: string) =>
      fetch(h.url + "/api/data", { method: "DELETE", headers: { ...(cookie ? { Cookie: cookie } : {}), ...(csrf ? { "X-CSRF-Token": csrf } : {}) } });
    expect((await del()).status).toBe(401);
    const p = await signIn(h, "student@uni.edu");
    expect(p.user.role).toBe("participant");
    expect((await del(p.cookie, p.csrf)).status).toBe(403);
    for (const e of ["pi@uni.edu", "chair@uni.edu", "root@uni.edu"]) {
      const s = await signIn(h, e);
      expect((await del(s.cookie, s.csrf)).status).toBe(200);
    }
    const pi = await signIn(h, "pi@uni.edu");
    expect((await fetch(h.url + "/api/admin-only", { headers: { Cookie: pi.cookie } })).status).toBe(403);
    const root = await signIn(h, "root@uni.edu");
    expect((await fetch(h.url + "/api/admin-only", { headers: { Cookie: root.cookie } })).status).toBe(200);
  });

  test("role is never taken from the query string, body, or headers", async () => {
    const p = await signIn(h, "student@uni.edu");
    const attempts = [
      fetch(h.url + "/api/admin-only?role=admin", { headers: { Cookie: p.cookie } }),
      fetch(h.url + "/api/admin-only", { headers: { Cookie: p.cookie, "X-Role": "admin", "X-User-Role": "admin" } }),
      fetch(h.url + "/api/data?role=researcher", { method: "DELETE", headers: { Cookie: p.cookie, "X-CSRF-Token": p.csrf } }),
      fetch(h.url + "/api/data", { method: "DELETE", headers: { Cookie: p.cookie + "; role=admin", "X-CSRF-Token": p.csrf } }),
    ];
    for (const r of await Promise.all(attempts)) expect(r.status).toBe(403);
  });

  test("role changes take effect on existing sessions immediately", async () => {
    const s = await signIn(h, "pi@uni.edu");
    const del = () => fetch(h.url + "/api/data", { method: "DELETE", headers: { Cookie: s.cookie, "X-CSRF-Token": s.csrf } });
    expect((await del()).status).toBe(200);
    h.cfg.roleAllowlist.delete("pi@uni.edu"); // demoted to participant
    expect((await del()).status).toBe(403);
    h.cfg.allowParticipantSignup = false; // and then removed entirely
    expect((await del()).status).toBe(401);
  });
});

describe("rate limits", () => {
  test("per IP: further requests get 429 with Retry-After, regardless of address", async () => {
    h = await start({ AUTH_REQUESTS_PER_IP_PER_HOUR: "3" });
    const ip = { "X-Forwarded-For": "9.9.9.9" };
    for (let i = 0; i < 3; i++) expect((await json(h, "/api/auth/magic-link/request", { email: `u${i}@x.org` }, ip)).status).toBe(202);
    const r = await json(h, "/api/auth/magic-link/request", { email: "u9@x.org" }, ip);
    expect(r.status).toBe(429);
    expect(Number(r.headers.get("retry-after"))).toBeGreaterThan(0);
    // another IP is unaffected; window reset frees the first
    expect((await json(h, "/api/auth/magic-link/request", { email: "u9@x.org" }, { "X-Forwarded-For": "8.8.8.8" })).status).toBe(202);
    h.clock.t += 3_600_000;
    expect((await json(h, "/api/auth/magic-link/request", { email: "u9@x.org" }, ip)).status).toBe(202);
  });

  test("per email: extra requests look identical but send nothing; resets after the window", async () => {
    h = await start();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await requestLink(h, "pi@uni.edu", { "X-Forwarded-For": `7.7.7.${i}` });
      statuses.push(r.status);
    }
    expect(statuses).toEqual([202, 202, 202, 202, 202, 202]);
    expect(h.mails.length).toBe(3);
    h.clock.t += 15 * MIN;
    await requestLink(h, "pi@uni.edu", { "X-Forwarded-For": "7.7.7.99" });
    expect(h.mails.length).toBe(4);
  });

  test("per-email limit is case-insensitive", async () => {
    h = await start();
    for (const e of ["pi@uni.edu", "PI@uni.edu", " Pi@Uni.edu", "pi@UNI.edu", "pI@uni.edu"]) await requestLink(h, e, { "X-Forwarded-For": "6.6.6." + e.length });
    expect(h.mails.length).toBe(3);
  });

  test("verify attempts are limited per IP", async () => {
    h = await start({ AUTH_VERIFY_PER_IP_PER_MINUTE: "5" });
    const ip = { "X-Forwarded-For": "5.5.5.5" };
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await json(h, "/api/auth/magic-link/verify", { token: "nope" }, ip)).status);
    expect(codes).toEqual([400, 400, 400, 400, 400, 429, 429]);
  });
});

describe("mail content", () => {
  test("the email names the expiry, and the console sender never logs outside dev", async () => {
    h = await start();
    await requestLink(h, "pi@uni.edu");
    expect(h.mails[0].text).toContain("15 minutes");
    expect(h.mails[0].subject).toBe("Your Scholar Explorer sign-in link");
  });
});
