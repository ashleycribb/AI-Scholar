/**
 * Who may open the /mcp-relay WebSocket (Scholar Explorer Local Lab bridge).
 *
 * Browsers do not apply CORS to WebSocket handshakes, so a page on any site could otherwise connect with the
 * visitor's cookies (cross-site WebSocket hijacking). A connection is accepted only when:
 *   - it presents a service token with the `relay` scope (Local Lab, no Origin header needed), or
 *   - it carries a live researcher/admin session cookie AND its Origin is this server or an allowed origin.
 */
import type { IncomingMessage } from "node:http";
import type { AuthKit } from "./auth/middleware";
import type { ServiceAuth } from "./serviceAuth";

export type RelayVerdict = { ok: true } | { ok: false; status: 401 | 403; reason: string };

export function authorizeRelayUpgrade(
  req: Pick<IncomingMessage, "headers">,
  deps: { auth: Pick<AuthKit, "sessionFor">; service: ServiceAuth; allowedOrigins: ReadonlySet<string> },
): RelayVerdict {
  const svc = deps.service.authenticate(req);
  if (svc.status === "ok") {
    return svc.principal.scopes.has("relay") ? { ok: true } : { ok: false, status: 403, reason: "forbidden" };
  }
  const session = deps.auth.sessionFor(req as any);
  if (!session) return { ok: false, status: 401, reason: "authentication_required" };
  if (session.role !== "researcher" && session.role !== "admin") return { ok: false, status: 403, reason: "forbidden" };
  const origin = req.headers.origin;
  if (typeof origin !== "string") return { ok: false, status: 403, reason: "origin_required" };
  let sameHost = false;
  try { sameHost = new URL(origin).host === req.headers.host; } catch { /* not a URL */ }
  if (!sameHost && !deps.allowedOrigins.has(origin)) return { ok: false, status: 403, reason: "origin_not_allowed" };
  return { ok: true };
}
