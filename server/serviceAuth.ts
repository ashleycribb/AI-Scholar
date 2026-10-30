/**
 * Service credentials for non-browser clients (Local Lab desktop, an MCP client, an LRS
 * client pointed at this server). They exist because session cookies are same-origin and
 * browser-only; a headless client has no inbox to receive a magic link.
 *
 * Configured only through the environment, never from a request:
 *
 *   SERVICE_TOKENS="locallab|marketplace:read+marketplace:write|<token>;lrs-sync|xapi:read+xapi:write|<token>"
 *
 * Entries are separated by `;` or a newline. Each is `name|scope+scope|token`.
 * Tokens must be at least 32 characters (`openssl rand -base64 32`). Malformed
 * entries are skipped and reported in `problems`; they never grant anything.
 *
 * A client presents a token as `Authorization: Bearer <token>` or as HTTP Basic with the
 * token as the password (the user name must be the entry's name), which is what an xAPI
 * client already sends. Tokens are compared by SHA-256 digest with `timingSafeEqual`.
 * Because the credential travels in a header the browser never attaches on its own,
 * CSRF does not apply to these requests.
 */
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

export const SERVICE_SCOPES = [
  "xapi:read",
  "xapi:write",
  "marketplace:read",
  "marketplace:write",
  "mcp",
  "relay",
] as const;
export type ServiceScope = (typeof SERVICE_SCOPES)[number];

export interface ServicePrincipal {
  kind: "service";
  name: string;
  scopes: ReadonlySet<ServiceScope>;
}

interface Entry { name: string; scopes: Set<ServiceScope>; digest: Buffer }

export interface ServiceAuth {
  /** Result of looking at the Authorization header. */
  authenticate(req: Pick<Request, "headers">): { status: "none" } | { status: "invalid" } | { status: "ok"; principal: ServicePrincipal };
  /** Misconfiguration found while parsing (names only, never token values). */
  problems: string[];
  /** How many valid entries were loaded. */
  size: number;
}

const sha = (s: string) => createHash("sha256").update(s).digest();
const NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
export const MIN_TOKEN_LENGTH = 32;

export function loadServiceAuth(env: NodeJS.ProcessEnv = process.env): ServiceAuth {
  const entries: Entry[] = [];
  const problems: string[] = [];
  const raw = env.SERVICE_TOKENS || "";
  for (const part of raw.split(/[;\n]/).map(s => s.trim()).filter(Boolean)) {
    const [name, scopeText, ...rest] = part.split("|");
    const token = rest.join("|");
    if (!name || !NAME.test(name)) { problems.push(`SERVICE_TOKENS: skipped an entry with an invalid name`); continue; }
    if (!token || token.length < MIN_TOKEN_LENGTH) { problems.push(`SERVICE_TOKENS: "${name}" skipped, token shorter than ${MIN_TOKEN_LENGTH} characters`); continue; }
    const scopes = new Set<ServiceScope>();
    let bad = false;
    for (const s of (scopeText || "").split("+").map(x => x.trim()).filter(Boolean)) {
      if ((SERVICE_SCOPES as readonly string[]).includes(s)) scopes.add(s as ServiceScope);
      else { bad = true; problems.push(`SERVICE_TOKENS: "${name}" skipped, unknown scope "${s.slice(0, 30)}"`); }
    }
    if (bad) continue;
    if (scopes.size === 0) { problems.push(`SERVICE_TOKENS: "${name}" skipped, no scopes`); continue; }
    if (entries.some(e => e.name === name)) { problems.push(`SERVICE_TOKENS: duplicate name "${name}" skipped`); continue; }
    entries.push({ name, scopes, digest: sha(token) });
  }

  const authenticate: ServiceAuth["authenticate"] = (req) => {
    const header = req.headers.authorization;
    if (!header || typeof header !== "string") return { status: "none" };
    let presented: string | null = null;
    let claimedName: string | null = null;
    const m = /^(Bearer|Basic)\s+(\S+)$/i.exec(header.trim());
    if (!m) return { status: "invalid" };
    if (m[1].toLowerCase() === "bearer") {
      presented = m[2];
    } else {
      try {
        const decoded = Buffer.from(m[2], "base64").toString("utf-8");
        const i = decoded.indexOf(":");
        if (i < 0) return { status: "invalid" };
        claimedName = decoded.slice(0, i);
        presented = decoded.slice(i + 1);
      } catch { return { status: "invalid" }; }
    }
    if (!presented) return { status: "invalid" };
    const d = sha(presented);
    // Check every entry (no early exit on the first match) so timing does not reveal which one matched.
    let hit: Entry | null = null;
    for (const e of entries) {
      if (timingSafeEqual(d, e.digest) && (claimedName === null || claimedName === e.name)) hit = e;
    }
    if (!hit) return { status: "invalid" };
    return { status: "ok", principal: { kind: "service", name: hit.name, scopes: hit.scopes } };
  };

  return { authenticate, problems, size: entries.length };
}
