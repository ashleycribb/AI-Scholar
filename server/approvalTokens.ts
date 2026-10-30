/**
 * One-click source approval tokens (the link in the proposal email).
 *
 * - 256-bit random, URL-safe; only a SHA-256 digest is stored in the registry file.
 * - Expire after APPROVAL_TOKEN_TTL_MS (7 days) and are single use (the digest is cleared on approve/reject).
 * - Bound to one source id: a token for source A never approves source B.
 * - Compared with timingSafeEqual on digests. Tokens issued by the earlier scheme
 *   (`approve_<id>_<time>_<6 chars>`, stored in clear) are never accepted.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const APPROVAL_TOKEN_TTL_MS = 7 * 24 * 3600_000;
const TOKEN_SHAPE = /^[A-Za-z0-9_-]{43}$/;

export interface TokenHolder { id: string; approvalTokenHash?: string; approvalTokenExpiresAt?: string }

const digest = (token: string) => createHash("sha256").update(token).digest("hex");

export function issueApprovalToken(source: TokenHolder, now = Date.now()): string {
  const token = randomBytes(32).toString("base64url");
  source.approvalTokenHash = digest(token);
  source.approvalTokenExpiresAt = new Date(now + APPROVAL_TOKEN_TTL_MS).toISOString();
  return token;
}

export function approvalTokenValid(source: TokenHolder | undefined, token: unknown, now = Date.now()): boolean {
  if (!source || typeof token !== "string" || !TOKEN_SHAPE.test(token)) return false;
  if (!source.approvalTokenHash || !source.approvalTokenExpiresAt) return false;
  const exp = Date.parse(source.approvalTokenExpiresAt);
  if (!Number.isFinite(exp) || now >= exp) return false;
  const a = Buffer.from(digest(token), "hex");
  const b = Buffer.from(source.approvalTokenHash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function clearApprovalToken(source: TokenHolder): void {
  delete source.approvalTokenHash;
  delete source.approvalTokenExpiresAt;
}

export const escapeHtml = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
