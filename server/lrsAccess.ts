/**
 * Who may see or delete which LRS data. Everything here works from the principal the route policy
 * attached to the request (`req.principal`), which comes from the server-side session or a service
 * token. Nothing is read from `?role=`, `?userName=`, or the request body.
 */
import { normalizeActorIdentifier, type LrsScope } from "./lrsDatabase";
import type { Principal } from "./routePolicy";

/** The identifiers a signed-in person's own statements can carry as `actor`. */
export function ownActorIds(email: string): string[] {
  const e = email.trim().toLowerCase();
  return [e, `mailto:${e}`];
}

/** researcher, committee, admin and service tokens with xapi:read see everything; participants only their own statements. */
export function readScopeFor(p: Principal | undefined): LrsScope {
  if (!p) return { kind: "own", actors: [] };
  if (p.kind === "service") return p.scopes.has("xapi:read") ? { kind: "all" } : { kind: "own", actors: [] };
  return p.role === "participant" ? { kind: "own", actors: ownActorIds(p.email) } : { kind: "all" };
}

export type DeleteDecision =
  | { ok: true; actors: string[] }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Participants delete only their own data: the target is bound to the session address. If they name an
 * actor it must equal that address (or mailto: form) exactly; anything else is refused, not widened.
 * Researchers and admins may name any actor, matched exactly. Committee and service tokens never delete.
 */
export function resolveDeleteTargets(p: Principal | undefined, requested: unknown): DeleteDecision {
  if (!p || p.kind !== "session") return { ok: false, status: 403, error: "forbidden" };
  if (p.role === "participant") {
    const own = ownActorIds(p.email);
    if (requested === undefined || requested === null || requested === "") return { ok: true, actors: own };
    const asked = normalizeActorIdentifier(requested);
    if (!asked) return { ok: false, status: 400, error: "invalid_actor" };
    if (!own.includes(asked.toLowerCase())) return { ok: false, status: 403, error: "participants_may_delete_only_their_own_data" };
    return { ok: true, actors: own };
  }
  if (p.role === "researcher" || p.role === "admin") {
    const asked = normalizeActorIdentifier(requested);
    if (!asked) return { ok: false, status: 400, error: "actor_required" };
    return { ok: true, actors: [asked] };
  }
  return { ok: false, status: 403, error: "forbidden" };
}

/** Per-principal namespace for xAPI state documents, so one signed-in user cannot read or overwrite another's. */
export function stateOwner(p: Principal | undefined): string | null {
  if (!p) return null;
  return p.kind === "session" ? `u:${p.email.toLowerCase()}` : `s:${p.name}`;
}
export const scopedStateId = (owner: string, stateId: string) => `${owner}|${stateId}`;

export function clampLimit(raw: unknown, def: number, max: number): number {
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(n, max);
}
