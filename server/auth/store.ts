/**
 * Server-side storage for magic-link tokens and sessions (node:sqlite).
 *
 * Only SHA-256 hashes of secrets are stored. Raw values look like "<id>.<secret>":
 * the id is a lookup key, the secret is compared against the stored hash with
 * timingSafeEqual. Tokens are consumed with a single atomic UPDATE so a link
 * can be used exactly once even under concurrent requests.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import fs from "fs";
import path from "path";

const sha256 = (s: string) => createHash("sha256").update(s).digest();
const b64u = (b: Buffer) => b.toString("base64url");
const RAW_PATTERN = /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/;
const MAX_SESSIONS_PER_EMAIL = 10;

export function safeEqual(a: string | Buffer, b: string | Buffer): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

function newRaw(): { id: string; secret: string; raw: string } {
  const id = b64u(randomBytes(16));
  const secret = b64u(randomBytes(32));
  return { id, secret, raw: `${id}.${secret}` };
}

function parseRaw(raw: unknown): { id: string; secret: string } | null {
  if (typeof raw !== "string" || !RAW_PATTERN.test(raw)) return null;
  const [id, secret] = raw.split(".");
  return { id, secret };
}

/** CSRF token for a session: HMAC of a constant under the session secret. Not stored. */
export function csrfTokenFor(sessionSecret: string): string {
  return b64u(createHmac("sha256", sessionSecret).update("scholar-explorer-csrf-v1").digest());
}

export interface SessionInfo { id: string; email: string; expiresAt: number; csrfToken: string; }

export class AuthStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS auth_tokens (
        id TEXT PRIMARY KEY,
        secret_hash BLOB NOT NULL,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_auth_tokens_expires ON auth_tokens(expires_at);
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        secret_hash BLOB NOT NULL,
        email TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_email ON auth_sessions(email);
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);
    `);
  }

  close() { this.db.close(); }

  // ---- magic-link tokens ----

  /** Returns the raw token to put in the emailed link. Only its hash is stored. */
  createToken(email: string, ttlMs: number, now: number): string {
    const { id, secret, raw } = newRaw();
    this.db.prepare(`INSERT INTO auth_tokens (id, secret_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, sha256(secret), email, now, now + ttlMs);
    return raw;
  }

  /**
   * Validates and consumes a token. Returns the email, or null for any failure
   * (malformed, unknown, wrong secret, expired, already used): callers must not
   * distinguish these to the client.
   */
  consumeToken(raw: unknown, now: number): string | null {
    const p = parseRaw(raw);
    if (!p) return null;
    const row = this.db.prepare(`SELECT secret_hash, email, expires_at, used_at FROM auth_tokens WHERE id = ?`).get(p.id) as
      { secret_hash: Uint8Array; email: string; expires_at: number; used_at: number | null } | undefined;
    // Always do one constant-time compare, even for unknown ids.
    const stored = row ? Buffer.from(row.secret_hash) : Buffer.alloc(32);
    const match = timingSafeEqual(stored, sha256(p.secret));
    if (!row || !match) return null;
    // Atomic single use: only one concurrent caller can flip used_at from NULL.
    const res = this.db.prepare(`UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?`).run(now, p.id, now);
    return Number(res.changes) === 1 ? row.email : null;
  }

  // ---- sessions ----

  /** Creates a session; returns the raw cookie value. A fresh id is issued on every login. */
  createSession(email: string, ttlMs: number, now: number): { raw: string; csrfToken: string; expiresAt: number } {
    const { id, secret, raw } = newRaw();
    this.db.prepare(`INSERT INTO auth_sessions (id, secret_hash, email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
      .run(id, sha256(secret), email, now, now + ttlMs);
    // Keep only the newest sessions per email.
    this.db.prepare(`DELETE FROM auth_sessions WHERE email = ? AND id NOT IN (
      SELECT id FROM auth_sessions WHERE email = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`).run(email, email, MAX_SESSIONS_PER_EMAIL);
    return { raw, csrfToken: csrfTokenFor(secret), expiresAt: now + ttlMs };
  }

  getSession(raw: unknown, now: number): SessionInfo | null {
    const p = parseRaw(raw);
    if (!p) return null;
    const row = this.db.prepare(`SELECT secret_hash, email, expires_at FROM auth_sessions WHERE id = ?`).get(p.id) as
      { secret_hash: Uint8Array; email: string; expires_at: number } | undefined;
    const stored = row ? Buffer.from(row.secret_hash) : Buffer.alloc(32);
    const match = timingSafeEqual(stored, sha256(p.secret));
    if (!row || !match) return null;
    if (row.expires_at <= now) {
      this.db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(p.id);
      return null;
    }
    return { id: p.id, email: row.email, expiresAt: row.expires_at, csrfToken: csrfTokenFor(p.secret) };
  }

  deleteSession(raw: unknown): void {
    const p = parseRaw(raw);
    if (!p) return;
    // Only delete when the secret matches, so knowing an id alone cannot log someone out.
    const row = this.db.prepare(`SELECT secret_hash FROM auth_sessions WHERE id = ?`).get(p.id) as { secret_hash: Uint8Array } | undefined;
    if (row && timingSafeEqual(Buffer.from(row.secret_hash), sha256(p.secret))) {
      this.db.prepare(`DELETE FROM auth_sessions WHERE id = ?`).run(p.id);
    }
  }

  /** Revoke every session for an address (for use when removing someone from the allowlist). */
  revokeAllForEmail(email: string): number {
    return Number(this.db.prepare(`DELETE FROM auth_sessions WHERE email = ?`).run(email).changes);
  }

  purgeExpired(now: number): void {
    // Expired tokens are rejected anyway, so rows can go as soon as they expire.
    this.db.prepare(`DELETE FROM auth_tokens WHERE expires_at <= ?`).run(now);
    this.db.prepare(`DELETE FROM auth_sessions WHERE expires_at <= ?`).run(now);
  }

  /** Test helper. */
  countRows(table: "auth_tokens" | "auth_sessions"): number {
    return (this.db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
  }
  /** Test helper: raw stored hash column values, to prove no plaintext is stored. */
  dumpAll(): string {
    const t = this.db.prepare(`SELECT * FROM auth_tokens`).all();
    const s = this.db.prepare(`SELECT * FROM auth_sessions`).all();
    return JSON.stringify([t, s], (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("hex") : v));
  }
}
