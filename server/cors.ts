/**
 * CORS with an explicit origin allowlist (replaces `Access-Control-Allow-Origin: *`).
 *
 * Allowed origins = CORS_ALLOWED_ORIGINS (comma/space separated, exact origins) plus the
 * origins already trusted by auth (AUTH_PUBLIC_URL, AUTH_ALLOWED_ORIGINS). A `*` entry or
 * anything that is not an http(s) origin is ignored and reported, never honoured.
 *
 * - Allowed origin: its own origin is echoed back with `Vary: Origin`.
 * - Any other origin (or `Origin: null`): no CORS headers, and a preflight gets 403.
 * - Credentials are never allowed cross-origin: session cookies are same-site only, and
 *   cross-origin xAPI/Local Lab clients authenticate with a service token header.
 * - Same-origin requests carry no CORS requirement and are untouched.
 *
 * CORS only tells browsers what a page may read. It is not authentication: the route policy
 * (server/routePolicy.ts) and the session CSRF/origin check still decide who may do what.
 */
import type { NextFunction, Request, RequestHandler, Response } from "express";

export interface CorsConfig { origins: ReadonlySet<string>; problems: string[] }

export function loadCorsConfig(env: NodeJS.ProcessEnv = process.env, extraOrigins: string[] = []): CorsConfig {
  const origins = new Set<string>();
  const problems: string[] = [];
  const add = (value: string, fromEnv: boolean) => {
    if (value === "*") { if (fromEnv) problems.push("CORS_ALLOWED_ORIGINS: wildcard '*' is not allowed and was ignored"); return; }
    try {
      const u = new URL(value);
      if ((u.protocol === "http:" || u.protocol === "https:") && u.origin !== "null") { origins.add(u.origin); return; }
    } catch { /* fall through */ }
    if (fromEnv) problems.push(`CORS_ALLOWED_ORIGINS: ignored invalid origin "${value.slice(0, 60)}"`);
  };
  for (const o of (env.CORS_ALLOWED_ORIGINS || "").split(/[\s,;]+/).filter(Boolean)) add(o, true);
  for (const o of extraOrigins) if (o) add(o, false);
  return { origins, problems };
}

const ALLOW_METHODS = "GET, POST, PUT, DELETE, OPTIONS";
const ALLOW_HEADERS = "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Experience-API-Version, If-Match, X-CSRF-Token";
const EXPOSE_HEADERS = "ETag, X-Experience-API-Version, Content-Type";

export function createCors(cfg: CorsConfig): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    res.append("Vary", "Origin");
    if (typeof origin !== "string") return next(); // not a cross-origin browser request
    const allowed = cfg.origins.has(origin);
    if (allowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", ALLOW_METHODS);
      res.setHeader("Access-Control-Allow-Headers", ALLOW_HEADERS);
      res.setHeader("Access-Control-Expose-Headers", EXPOSE_HEADERS);
      res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") {
      // A preflight from an origin that is not allowed (and is not simply this server's own origin).
      if (!allowed) {
        try { if (new URL(origin).host === req.host) return res.sendStatus(204); } catch { /* not a URL */ }
        return res.status(403).json({ error: "origin_not_allowed" });
      }
      return res.sendStatus(204);
    }
    next();
  };
}
