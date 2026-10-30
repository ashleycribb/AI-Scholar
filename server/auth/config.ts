/**
 * Auth configuration, read from the environment.
 *
 * Nothing here is ever taken from a request. Roles come only from the
 * allowlist variables below.
 */
import path from "path";

export type Role = "participant" | "researcher" | "committee" | "admin";
export const ROLES: readonly Role[] = ["participant", "researcher", "committee", "admin"];

/** Highest precedence first, used when an address is on more than one list. */
const ROLE_PRECEDENCE: Role[] = ["admin", "committee", "researcher", "participant"];

export type EmailProviderName = "resend" | "smtp" | "console" | "none";

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  secure: "tls" | "starttls" | "none";
}

export interface AuthConfig {
  production: boolean;
  /** Absolute origin used to build links in emails. Never derived from request headers. */
  publicUrl: string;
  /** Extra origins allowed to POST (besides the public URL and the request's own host). */
  allowedOrigins: string[];
  tokenTtlMs: number;
  sessionTtlMs: number;
  /** email -> role for the researcher / committee / admin allowlists. */
  roleAllowlist: Map<string, Role>;
  /** When false, only allowlisted addresses can sign in. */
  allowParticipantSignup: boolean;
  cookieSecure: boolean;
  cookieName: string;
  dbPath: string;
  emailProvider: EmailProviderName;
  emailFrom: string;
  resendApiKey?: string;
  smtp?: SmtpConfig;
  /** Relative path to send browsers to after a form-based sign in. */
  postLoginRedirect: string;
  /** Express "trust proxy" value, or undefined to leave it unset. */
  trustProxy?: boolean | number | string;
  limits: {
    requestPerIpPerHour: number;
    requestPerEmailPerWindow: number;
    requestEmailWindowMs: number;
    verifyPerIpPerMinute: number;
  };
  /** Fatal misconfiguration; while non-empty the request/verify endpoints answer 503. */
  problems: string[];
}

export const EMAIL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

/** Returns the normalized (trimmed, lower-cased) address, or null if it is not a plain ASCII email. */
export function normalizeEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const e = input.trim().toLowerCase();
  if (e.length > 254 || !EMAIL_PATTERN.test(e)) return null;
  return e;
}

function parseList(v: string | undefined): string[] {
  return (v || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}

function int(v: string | undefined, def: number, min: number, max: number): number {
  const n = Number.parseInt(v ?? "", 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function bool(v: string | undefined, def: boolean): boolean {
  if (v === undefined || v === "") return def;
  return /^(1|true|yes|on)$/i.test(v);
}

export function parseTrustProxy(v: string | undefined): boolean | number | string | undefined {
  if (v === undefined || v.trim() === "") return undefined;
  const t = v.trim();
  if (/^(true|yes)$/i.test(t)) return true;
  if (/^(false|no)$/i.test(t)) return false;
  if (/^\d+$/.test(t)) return Number.parseInt(t, 10);
  return t; // e.g. "loopback, 10.0.0.0/8"
}

export function loadAuthConfig(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const production = env.NODE_ENV === "production";
  const problems: string[] = [];

  const rawPublic = (env.AUTH_PUBLIC_URL || "").trim();
  let publicUrl = rawPublic || (production ? "" : "http://localhost:3000");
  try {
    const u = new URL(publicUrl);
    publicUrl = u.origin;
    if (production && u.protocol !== "https:") problems.push("AUTH_PUBLIC_URL must be https in production");
  } catch {
    if (production) problems.push("AUTH_PUBLIC_URL is required in production (e.g. https://your-app.example)");
    publicUrl = "";
  }

  const roleAllowlist = new Map<string, Role>();
  const lists: [string | undefined, Role][] = [
    [env.AUTH_RESEARCHER_EMAILS, "researcher"],
    [env.AUTH_COMMITTEE_EMAILS, "committee"],
    [env.AUTH_ADMIN_EMAILS, "admin"],
  ];
  for (const [list, role] of lists) {
    for (const raw of parseList(list)) {
      const e = normalizeEmail(raw);
      if (!e) continue;
      const prev = roleAllowlist.get(e);
      if (!prev || ROLE_PRECEDENCE.indexOf(role) < ROLE_PRECEDENCE.indexOf(prev)) roleAllowlist.set(e, role);
    }
  }

  const cookieSecure = bool(env.AUTH_COOKIE_SECURE, true);
  if (production && !cookieSecure) problems.push("AUTH_COOKIE_SECURE=false is not allowed in production");

  const requested = (env.AUTH_EMAIL_PROVIDER || "").trim().toLowerCase();
  let emailProvider: EmailProviderName;
  if (requested === "resend" || requested === "smtp" || requested === "console") emailProvider = requested;
  else if (requested === "" && env.RESEND_API_KEY) emailProvider = "resend";
  else if (requested === "" && env.SMTP_HOST) emailProvider = "smtp";
  else if (requested === "") emailProvider = production ? "none" : "console";
  else { emailProvider = "none"; problems.push(`Unknown AUTH_EMAIL_PROVIDER "${requested}"`); }

  const emailFrom = (env.AUTH_EMAIL_FROM || "").trim();
  let smtp: SmtpConfig | undefined;
  if (emailProvider === "console" && production) problems.push("The console email sender is not allowed in production; set AUTH_EMAIL_PROVIDER to resend or smtp");
  if (emailProvider === "none" && production && !problems.some(p => p.startsWith("Unknown"))) problems.push("No email sender configured; set RESEND_API_KEY or SMTP_HOST");
  if (emailProvider === "resend") {
    if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY is required for the resend provider");
    if (!emailFrom) problems.push("AUTH_EMAIL_FROM is required for the resend provider");
  }
  if (emailProvider === "smtp") {
    const port = int(env.SMTP_PORT, 587, 1, 65535);
    const secureRaw = (env.SMTP_SECURE || "").toLowerCase();
    const secure: SmtpConfig["secure"] = secureRaw === "tls" || secureRaw === "starttls" || secureRaw === "none"
      ? secureRaw : (port === 465 ? "tls" : "starttls");
    if (!env.SMTP_HOST) problems.push("SMTP_HOST is required for the smtp provider");
    if (!emailFrom) problems.push("AUTH_EMAIL_FROM is required for the smtp provider");
    if (secure === "none" && production) problems.push("SMTP_SECURE=none is not allowed in production");
    smtp = { host: env.SMTP_HOST || "", port, user: env.SMTP_USER || undefined, pass: env.SMTP_PASS || undefined, secure };
  }

  const redirect = (env.AUTH_POST_LOGIN_REDIRECT || "/").trim();
  const postLoginRedirect = /^\/(?![/\\])[\w\-./?=&%#]*$/.test(redirect) ? redirect : "/";

  return {
    production,
    publicUrl,
    allowedOrigins: parseList(env.AUTH_ALLOWED_ORIGINS).map(o => { try { return new URL(o).origin; } catch { return ""; } }).filter(Boolean),
    tokenTtlMs: int(env.AUTH_TOKEN_TTL_MINUTES, 15, 1, 60) * 60_000,
    sessionTtlMs: int(env.AUTH_SESSION_TTL_HOURS, 12, 1, 24 * 30) * 3_600_000,
    roleAllowlist,
    allowParticipantSignup: bool(env.AUTH_ALLOW_PARTICIPANT_SIGNUP, true),
    cookieSecure,
    cookieName: cookieSecure ? "__Host-scholar_sid" : "scholar_sid",
    dbPath: env.AUTH_DB_PATH || path.join(process.cwd(), "local_engine", "auth.sqlite"),
    emailProvider,
    emailFrom,
    resendApiKey: env.RESEND_API_KEY || undefined,
    smtp,
    postLoginRedirect,
    trustProxy: parseTrustProxy(env.AUTH_TRUST_PROXY),
    limits: {
      requestPerIpPerHour: int(env.AUTH_REQUESTS_PER_IP_PER_HOUR, 20, 1, 10_000),
      requestPerEmailPerWindow: int(env.AUTH_REQUESTS_PER_EMAIL, 3, 1, 100),
      requestEmailWindowMs: 15 * 60_000,
      verifyPerIpPerMinute: int(env.AUTH_VERIFY_PER_IP_PER_MINUTE, 30, 1, 10_000),
    },
    problems,
  };
}

/** Role for an address, or null when it may not sign in at all. */
export function resolveRole(cfg: AuthConfig, email: string): Role | null {
  const r = cfg.roleAllowlist.get(email);
  if (r) return r;
  return cfg.allowParticipantSignup ? "participant" : null;
}
