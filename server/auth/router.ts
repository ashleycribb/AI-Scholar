/**
 * Email magic-link authentication router, mounted at /api/auth.
 *
 *   POST /magic-link/request   { email }   always 202 for a well-formed address
 *   GET  /magic-link/verify?token=...      confirmation page (does NOT consume the token,
 *                                          so mail scanners that prefetch links cannot burn it)
 *   POST /magic-link/verify    { token }   consumes the token, starts a session
 *   GET  /session                          who am I (+ CSRF token)
 *   POST /logout                           destroys the server-side session (CSRF required)
 */
import express, { Router, type Request, type Response } from "express";
import { createHash } from "node:crypto";
import { loadAuthConfig, normalizeEmail, resolveRole, type AuthConfig } from "./config";
import { AuthStore } from "./store";
import { FixedWindowLimiter } from "./rateLimit";
import { buildMagicLinkMessage, createMailer, type MailSender } from "./mailer";
import { createMiddleware, originAllowed, parseCookies, type AuthKit } from "./middleware";

export interface AuthOptions {
  config?: AuthConfig;
  store?: AuthStore;
  mailer?: MailSender | null;
  now?: () => number;
  log?: (line: string) => void;
}

export interface Auth extends AuthKit {
  router: Router;
  config: AuthConfig;
  store: AuthStore;
  /** Resolves when every in-flight email send has settled (used by tests and shutdown). */
  idle(): Promise<void>;
  close(): void;
}

export const GENERIC_REQUEST_MESSAGE =
  "If this address can sign in, a sign-in link has been emailed. It works once and expires in 15 minutes.";

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const shortId = (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 8);

export function createAuth(opts: AuthOptions = {}): Auth {
  const config = opts.config ?? loadAuthConfig();
  const now = opts.now ?? Date.now;
  const log = opts.log ?? ((l: string) => console.log(l));
  const store = opts.store ?? new AuthStore(config.dbPath);
  const mailer = opts.mailer !== undefined ? opts.mailer : createMailer(config, { log });
  const kit = createMiddleware(config, store, now);
  const limiter = new FixedWindowLimiter();
  const pending = new Set<Promise<void>>();

  const problems = [...config.problems];
  if (!mailer && config.problems.length === 0) problems.push("No email sender could be created from the configuration");
  if (problems.length) {
    log(`[auth] DISABLED: ${problems.join("; ")}. Magic-link endpoints will answer 503 until this is fixed.`);
  }

  const ttlMinutes = Math.round(config.tokenTtlMs / 60_000);
  const ipOf = (req: Request) => req.ip || req.socket.remoteAddress || "unknown";

  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    next();
  });
  router.use(express.json({ limit: "4kb" }));
  router.use(express.urlencoded({ extended: false, limit: "4kb" }));

  const unavailable = (res: Response) => res.status(503).json({ error: "auth_not_configured" });

  const setSessionCookie = (res: Response, raw: string, maxAgeMs: number) =>
    res.cookie(config.cookieName, raw, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/", maxAge: maxAgeMs });
  const clearSessionCookie = (res: Response) =>
    res.clearCookie(config.cookieName, { httpOnly: true, secure: config.cookieSecure, sameSite: "lax", path: "/" });

  // ---- request a link ----
  router.post("/magic-link/request", (req: Request, res: Response) => {
    if (problems.length || !mailer) return unavailable(res);
    if (!originAllowed(config, req)) return res.status(403).json({ error: "origin_not_allowed" });

    const t = now();
    const ipKey = `req-ip:${ipOf(req)}`;
    if (!limiter.allow(ipKey, config.limits.requestPerIpPerHour, 3_600_000, t)) {
      res.setHeader("Retry-After", String(limiter.retryAfterSeconds(ipKey, t)));
      return res.status(429).json({ error: "rate_limited" });
    }

    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: "invalid_email" }); // depends only on the input's shape

    // From here on the response is identical whether or not the address may sign in,
    // whether or not it was rate limited per address, and whether or not sending works.
    const withinEmailLimit = limiter.allow(`req-email:${email}`, config.limits.requestPerEmailPerWindow, config.limits.requestEmailWindowMs, t);
    const role = resolveRole(config, email);
    if (withinEmailLimit && role) {
      const raw = store.createToken(email, config.tokenTtlMs, t);
      const link = `${config.publicUrl}/api/auth/magic-link/verify?token=${encodeURIComponent(raw)}`;
      const p = mailer.send(buildMagicLinkMessage(email, link, ttlMinutes))
        .catch(e => log(`[auth] magic-link send failed for ${shortId(email)}: ${e instanceof Error ? e.message : "error"}`))
        .finally(() => { pending.delete(p); });
      pending.add(p);
    } else {
      // Keep the work profile similar for ineligible / throttled addresses.
      store.createToken("nobody@invalid", 1, t - 1);
    }
    store.purgeExpired(t);
    res.status(202).json({ ok: true, message: GENERIC_REQUEST_MESSAGE });
  });

  // ---- confirmation page (safe to prefetch) ----
  router.get("/magic-link/verify", (req: Request, res: Response) => {
    if (problems.length) return unavailable(res);
    const token = typeof req.query.token === "string" ? req.query.token : "";
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    res.type("html").send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in to Scholar Explorer</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;color:#111}button{font:inherit;padding:.6rem 1.2rem;border-radius:.5rem;border:0;background:#111;color:#fff;cursor:pointer}</style></head>
<body><h1>Sign in to Scholar Explorer</h1><p>Select the button to finish signing in.</p>
<form method="post" action="/api/auth/magic-link/verify"><input type="hidden" name="token" value="${escapeHtml(token.slice(0, 100))}"><button type="submit">Sign in</button></form></body></html>`);
  });

  // ---- consume the token ----
  router.post("/magic-link/verify", (req: Request, res: Response) => {
    if (problems.length) return unavailable(res);
    if (!originAllowed(config, req)) return res.status(403).json({ error: "origin_not_allowed" });
    const t = now();
    const ipKey = `verify-ip:${ipOf(req)}`;
    if (!limiter.allow(ipKey, config.limits.verifyPerIpPerMinute, 60_000, t)) {
      res.setHeader("Retry-After", String(limiter.retryAfterSeconds(ipKey, t)));
      return res.status(429).json({ error: "rate_limited" });
    }

    const wantsJson = (req.get("content-type") || "").includes("application/json") || (req.get("accept") || "").includes("application/json");
    const email = store.consumeToken(req.body?.token, t);
    const role = email ? resolveRole(config, email) : null;
    if (!email || !role) {
      const msg = "This sign-in link is invalid, expired, or has already been used. Request a new one.";
      return wantsJson ? res.status(400).json({ error: "invalid_or_expired_token", message: msg })
        : res.status(400).type("html").send(`<!doctype html><meta charset="utf-8"><title>Sign-in link problem</title><p>${escapeHtml(msg)}</p>`);
    }

    // New session id on every login (no fixation); any pre-existing cookie is simply replaced.
    const s = store.createSession(email, config.sessionTtlMs, t);
    setSessionCookie(res, s.raw, config.sessionTtlMs);
    if (wantsJson) return res.json({ ok: true, user: { email, role }, csrfToken: s.csrfToken, expiresAt: s.expiresAt });
    res.redirect(303, config.postLoginRedirect);
  });

  // ---- session info ----
  router.get("/session", (req: Request, res: Response) => {
    const ctx = kit.sessionFor(req);
    if (!ctx) return res.json({ authenticated: false });
    res.json({ authenticated: true, user: { email: ctx.email, role: ctx.role }, csrfToken: ctx.csrfToken, expiresAt: ctx.expiresAt });
  });

  // ---- logout ----
  router.post("/logout", kit.requireAuth, (req: Request, res: Response) => {
    store.deleteSession(parseCookies(req.headers.cookie)[config.cookieName]);
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  // Body-parser failures (too large, malformed JSON) get a short JSON answer with no internals.
  router.use((err: any, _req: Request, res: Response, next: (e?: unknown) => void) => {
    if (res.headersSent) return next(err);
    const status = err?.status === 413 ? 413 : 400;
    res.status(status).json({ error: status === 413 ? "request_too_large" : "bad_request" });
  });

  return {
    router,
    config,
    store,
    ...kit,
    idle: async () => { while (pending.size) await Promise.allSettled([...pending]); },
    close: () => store.close(),
  };
}
