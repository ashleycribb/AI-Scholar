/**
 * One place that says who may call every server route.
 *
 * `enforceRoutePolicy` runs before the route handlers. It finds the first rule matching the request's
 * method and path and applies it with the middleware from server/auth (requireAuth / requireRole, which
 * include the CSRF + same-origin check on unsafe methods), or with a service token for non-browser clients.
 *
 * Fail closed: any /api, /xapi or /mcp request that matches no rule is treated as admin-only, so a route
 * added later without a policy line is unreachable until someone decides who may use it.
 * (server/routePolicy.test.ts also fails if server.ts registers a route this table does not list.)
 *
 * Roles: `admin` passes every role check (see server/auth/middleware.ts). Roles come only from the server's
 * allowlists, never from the query string, a header or the body.
 */
import type { NextFunction, Request, Response } from "express";
import type { AuthKit } from "./auth/middleware";
import type { Role } from "./auth/config";
import type { ServiceAuth, ServicePrincipal, ServiceScope } from "./serviceAuth";

export interface SessionPrincipal { kind: "session"; email: string; role: Role }
export type Principal = SessionPrincipal | ServicePrincipal;

export type Access =
  | { kind: "public"; /** Reject (401) a request that presents bad service credentials, e.g. the xAPI "test connection" call. */ rejectBadCredentials?: boolean }
  | { kind: "signed-in"; /** Roles allowed. Omitted = any signed-in role. */ roles?: Role[]; /** Service-token scope that is also accepted. */ service?: ServiceScope };

export interface Rule {
  id: string;
  methods: string[]; // upper-case; GET also covers HEAD
  path: string;      // `*` = one segment, `**` = the rest
  access: Access;
  note: string;
}

const ANY: Role[] | undefined = undefined;
const RESEARCHER: Role[] = ["researcher"];
const RESEARCH_STAFF: Role[] = ["researcher", "committee"];
const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];
const pub = (id: string, methods: string[], path: string, note: string, rejectBadCredentials = false): Rule =>
  ({ id, methods, path, access: { kind: "public", rejectBadCredentials }, note });
const signedIn = (id: string, methods: string[], path: string, roles: Role[] | undefined, service: ServiceScope | undefined, note: string): Rule =>
  ({ id, methods, path, access: { kind: "signed-in", roles, service }, note });

export const ROUTE_POLICY: Rule[] = [
  // --- handled by their own routers, mounted before this policy ---
  pub("auth", ALL_METHODS, "/api/auth/**", "Magic-link sign-in; own limits, CSRF and origin checks (server/auth)"),
  pub("gemini", ALL_METHODS, "/api/gemini/**", "Gemini proxy; own same-origin policy and limits (server/geminiProxy.ts)"),

  // --- public ---
  pub("health", ["GET"], "/api/health", "Liveness"),
  pub("status", ["GET"], "/api/status", "Liveness"),
  pub("xapi-about", ["GET"], "/xapi/about", "xAPI about: public, but credentials that are presented must be valid", true),
  pub("xapi-profile", ["GET"], "/api/xapi/learnmcp/profiles", "Public xAPI profile document"),
  pub("proxy-openalex", ["GET"], "/api/openalex/**", "Read-only OpenAlex proxy (no rate limit yet)"),
  pub("proxy-s2", ["GET"], "/api/s2/**", "Read-only Semantic Scholar proxy (no rate limit yet)"),
  pub("proxy-scholar", ["GET"], "/api/scholar", "SerpApi proxy (spends the server key; rate limit is a follow-up)"),
  pub("proxy-scout", ["GET"], "/api/scout/search", "OpenAlex scout (read-only)"),
  pub("proxy-registries-get", ["GET"], "/api/registries/**", "Read-only registry proxies"),
  pub("proxy-registries-post", ["POST"], "/api/registries/**", "DataCite GraphQL / OpenCitations SPARQL queries (read-only)"),
  pub("sources-registry", ["GET"], "/api/sources/registry", "Approved/discovered sources, approval tokens removed"),
  pub("sources-approve-token", ["GET", "POST"], "/api/sources/approve-token", "Emailed approval link: the single-use token is the credential"),
  pub("library-prospectus", ["POST"], "/api/library-mcp/prospectus", "Pure document generator, stores nothing"),

  // --- xAPI / LRS ---
  signedIn("xapi-statements-post", ["POST"], "/xapi/statements", ANY, "xapi:write", "Write statements (acknowledge only today)"),
  signedIn("xapi-statements-get", ["GET"], "/xapi/statements", ANY, "xapi:read", "Read statements; participants see only their own"),
  signedIn("xapi-state-get", ["GET"], "/xapi/activities/state", ANY, "xapi:read", "State document, namespaced per user"),
  signedIn("xapi-state-put", ["PUT"], "/xapi/activities/state", ANY, "xapi:write", "State document, namespaced per user"),
  signedIn("xapi-delete-by-actor", ["DELETE"], "/xapi/statements/by-actor", ["participant", "researcher"], undefined, "Delete my data: participants only their own, researchers any exact actor"),
  signedIn("xapi-delete-by-actor-post", ["POST"], "/xapi/statements/delete-by-actor", ["participant", "researcher"], undefined, "Same, POST form"),
  signedIn("xapi-delete-statements", ["DELETE"], "/xapi/statements", ["participant", "researcher"], undefined, "Same, ?actor= form"),
  signedIn("xapi-delete-actor", ["DELETE"], "/xapi/actors/*", ["participant", "researcher"], undefined, "Same, path form"),
  signedIn("lrs-delete-actor", ["DELETE"], "/api/lrs/actors/*", ["participant", "researcher"], undefined, "Same, path form"),
  pub("xapi-static", ["GET"], "/xapi/**", "Static xAPI profile/schema JSON from public/xapi (after the dynamic routes above)"),
  signedIn("lrs-status", ["GET"], "/api/lrs/status", ANY, undefined, "Counts and engine info"),
  signedIn("lrs-sql-get", ["GET"], "/api/lrs/sql-lrs/statements", ANY, "xapi:read", "Scope from the session role; ?role= and ?userName= are ignored"),
  signedIn("lrs-sql-post", ["POST"], "/api/lrs/sql-lrs/statements", ANY, "xapi:write", "Write a statement (acknowledge only today)"),
  signedIn("lrs-duck-get", ["GET"], "/api/lrs/duckdb-lrs/statements", ANY, "xapi:read", "Scope from the session role; participants must name a sessionUuid"),
  signedIn("lrs-duck-post", ["POST"], "/api/lrs/duckdb-lrs/statements", ANY, "xapi:write", "Write a statement (acknowledge only today)"),
  signedIn("analytics-export", ["GET"], "/api/analytics/duckdb-export", RESEARCH_STAFF, undefined, "Full analytics export"),

  // --- research data ---
  signedIn("provenance-write", ["POST"], "/api/provenance/**", RESEARCH_STAFF, undefined, "Record claims / evidence"),
  signedIn("provenance-read", ["GET"], "/api/provenance/**", RESEARCH_STAFF, undefined, "Claim provenance and research graph"),

  // --- marketplace, MCP, local tools ---
  signedIn("marketplace-post", ["POST"], "/api/marketplace/capabilities", RESEARCHER, "marketplace:write", "Registers a tool in the server's agent"),
  signedIn("marketplace-get", ["GET"], "/api/marketplace/capabilities", ANY, "marketplace:read", "Capability catalog"),
  signedIn("mcp-sse", ["GET"], "/mcp", RESEARCHER, "mcp", "MCP SSE stream (tools spawn local processes)"),
  signedIn("mcp-messages", ["POST"], "/mcp/messages", RESEARCHER, "mcp", "MCP messages"),
  signedIn("local-vault", ["GET"], "/api/local/vault", RESEARCHER, undefined, "Lists vault files"),
  signedIn("local-verify", ["POST"], "/api/local/verify", RESEARCHER, undefined, "Runs the logician nanobot on a vault file"),

  // --- source registry ---
  signedIn("sources-test", ["POST"], "/api/sources/test-endpoint", RESEARCH_STAFF, undefined, "Outbound endpoint probe"),
  signedIn("sources-propose", ["POST"], "/api/sources/propose", RESEARCH_STAFF, undefined, "Create a proposal and approval token"),
  signedIn("sources-approve", ["POST"], "/api/sources/approve/*", RESEARCH_STAFF, undefined, "Human approval of a source"),
  signedIn("sources-reject", ["POST"], "/api/sources/reject/*", RESEARCH_STAFF, undefined, "Human rejection of a source"),
  signedIn("sources-custom", ["POST"], "/api/sources/custom", RESEARCH_STAFF, undefined, "Add a discovered source"),
];

/** Paths under these prefixes are always governed by the policy (unlisted = admin only). */
const GOVERNED = [/^\/api(\/|$)/, /^\/xapi(\/|$)/, /^\/mcp(\/|$)/];

export const DEFAULT_RULE: Rule = {
  id: "default-deny", methods: [], path: "**", access: { kind: "signed-in", roles: [] },
  note: "Unlisted API route: admin only until a rule is added",
};

export function normalizePath(p: string): string {
  const lower = p.toLowerCase(); // Express routes are case-insensitive
  const trimmed = lower.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

function matches(pattern: string, path: string): boolean {
  const pat = pattern.toLowerCase().split("/");
  const seg = path.split("/");
  for (let i = 0; i < pat.length; i++) {
    if (pat[i] === "**") return true;
    if (i >= seg.length) return false;
    if (pat[i] === "*") { if (seg[i] === "") return false; continue; }
    if (pat[i] !== seg[i]) return false;
  }
  return pat.length === seg.length;
}

export function isGoverned(path: string): boolean {
  const n = normalizePath(path);
  return GOVERNED.some(r => r.test(n));
}

/** The rule that applies, or null when the path is not governed (static app, vite assets...). Unlisted API paths get DEFAULT_RULE. */
export function matchRule(method: string, rawPath: string, rules: Rule[] = ROUTE_POLICY): Rule | null {
  const path = normalizePath(rawPath);
  if (!isGoverned(path)) return null;
  const m = method.toUpperCase() === "HEAD" ? "GET" : method.toUpperCase();
  for (const r of rules) if (r.methods.includes(m) && matches(r.path, path)) return r;
  return DEFAULT_RULE;
}

export interface PolicyDeps { auth: Pick<AuthKit, "requireAuth" | "requireRole" | "sessionFor">; service: ServiceAuth }

export function enforceRoutePolicy(deps: PolicyDeps, rules: Rule[] = ROUTE_POLICY) {
  const { auth, service } = deps;
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method === "OPTIONS") return next();
    const rule = matchRule(req.method, req.path, rules);
    if (!rule) return next();
    const access = rule.access;
    const deny = (status: number, error: string) => { res.setHeader("Cache-Control", "no-store"); res.status(status).json({ error }); };

    if (access.kind === "public") {
      if (access.rejectBadCredentials) {
        const s = service.authenticate(req);
        if (s.status === "invalid" && !auth.sessionFor(req)) return deny(401, "invalid_credentials");
      }
      return next();
    }

    // Service token (non-browser clients).
    const svc = service.authenticate(req);
    if (svc.status === "ok") {
      if (access.service && svc.principal.scopes.has(access.service)) {
        (req as any).principal = svc.principal;
        return next();
      }
      if (!auth.sessionFor(req)) return deny(403, "forbidden"); // valid token, wrong scope, no session to fall back on
    }

    // Browser session: 401 without one, 403 for a wrong role or a failed CSRF/origin check.
    const guard = access.roles ? auth.requireRole(...access.roles) : auth.requireAuth;
    guard(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (res.headersSent) return;
      const a = (req as any).auth as { email: string; role: Role } | undefined;
      if (!a) return deny(401, "authentication_required");
      (req as any).principal = { kind: "session", email: a.email, role: a.role } satisfies SessionPrincipal;
      next();
    });
  };
}
