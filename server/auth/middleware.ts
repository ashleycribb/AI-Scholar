/**
 * requireAuth / requireRole / requireCsrf.
 *
 * The caller's role is always resolved server-side from the allowlist at request
 * time (never from a cookie value, query string, header, or body), so removing
 * someone from the allowlist takes effect immediately.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthConfig, Role } from "./config";
import { resolveRole } from "./config";
import { AuthStore, safeEqual } from "./store";

export interface AuthContext { email: string; role: Role; sessionId: string; csrfToken: string; expiresAt: number; }

// Note: the project has no @types/express, so Request is untyped; handlers read `req.auth` (AuthContext | undefined).

export const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const v = part.slice(i + 1).trim();
    if (k && !(k in out)) out[k] = v;
  }
  return out;
}

/** Same-origin check for state-changing requests (defence in depth next to the CSRF token). */
export function originAllowed(cfg: AuthConfig, req: Request): boolean {
  const origin = req.get("origin");
  if (origin) {
    if (origin === cfg.publicUrl || cfg.allowedOrigins.includes(origin)) return true;
    try { return new URL(origin).host === req.host; } catch { return false; }
  }
  // No Origin header: refuse only when the browser says it is cross-site.
  const site = req.get("sec-fetch-site");
  return !site || site === "same-origin" || site === "same-site" || site === "none";
}

export interface AuthKit {
  /** Resolve the session (if any) without enforcing anything. */
  sessionFor(req: Request): AuthContext | null;
  requireAuth: RequestHandler;
  requireRole(...roles: Role[]): RequestHandler;
  /** CSRF + origin check on its own; requireAuth already applies it to unsafe methods. */
  requireCsrf: RequestHandler;
}

export function createMiddleware(cfg: AuthConfig, store: AuthStore, now: () => number): AuthKit {
  const sessionFor = (req: Request): AuthContext | null => {
    const raw = parseCookies(req.headers.cookie)[cfg.cookieName];
    if (!raw) return null;
    const s = store.getSession(raw, now());
    if (!s) return null;
    const role = resolveRole(cfg, s.email);
    if (!role) return null; // removed from the allowlist since sign-in
    return { email: s.email, role, sessionId: s.id, csrfToken: s.csrfToken, expiresAt: s.expiresAt };
  };

  const deny = (res: Response, status: number, error: string) => {
    res.setHeader("Cache-Control", "no-store");
    res.status(status).json({ error });
  };

  const csrfOk = (req: Request, ctx: AuthContext): boolean => {
    if (!originAllowed(cfg, req)) return false;
    const header = req.get("x-csrf-token");
    return typeof header === "string" && header.length > 0 && safeEqual(header, ctx.csrfToken);
  };

  const requireAuth: RequestHandler = (req, res, next) => {
    const ctx = sessionFor(req);
    if (!ctx) return deny(res, 401, "authentication_required");
    if (!SAFE_METHODS.has(req.method) && !csrfOk(req, ctx)) return deny(res, 403, "csrf_check_failed");
    req.auth = ctx;
    next();
  };

  const requireRole = (...roles: Role[]): RequestHandler => {
    const allowed = new Set<Role>(roles);
    return (req, res, next) => {
      requireAuth(req, res, (err?: unknown) => {
        if (err) return next(err);
        if (res.headersSent) return;
        // admin is a superuser for role checks
        if (req.auth && (req.auth.role === "admin" || allowed.has(req.auth.role))) return next();
        deny(res, 403, "forbidden");
      });
    };
  };

  const requireCsrf: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    const ctx = req.auth ?? sessionFor(req);
    if (!ctx || !csrfOk(req, ctx)) return deny(res, 403, "csrf_check_failed");
    next();
  };

  return { sessionFor, requireAuth, requireRole, requireCsrf };
}
