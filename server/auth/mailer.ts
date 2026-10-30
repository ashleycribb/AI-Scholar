/**
 * Pluggable email sender for magic links.
 *
 *  - resend:  POST https://api.resend.com/emails with RESEND_API_KEY (no dependency)
 *  - smtp:    minimal built-in SMTP client (implicit TLS, STARTTLS, or plain for local tests)
 *  - console: development only. Prints the message (including the link) to the server
 *             console and nowhere else. Refused in production by loadAuthConfig.
 */
import net from "net";
import tls from "tls";
import type { AuthConfig, SmtpConfig } from "./config";

export interface MailMessage { to: string; subject: string; text: string; html: string; }
export interface MailSender { readonly name: string; send(msg: MailMessage): Promise<void>; }

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

export interface MailerDeps {
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export function createMailer(cfg: AuthConfig, deps: MailerDeps = {}): MailSender | null {
  const log = deps.log ?? ((l: string) => console.log(l));
  switch (cfg.emailProvider) {
    case "console":
      if (cfg.production) return null;
      return {
        name: "console",
        async send(m) {
          log(`[auth][dev-mail] To: ${oneLine(m.to)}\n[auth][dev-mail] Subject: ${oneLine(m.subject)}\n${m.text}\n[auth][dev-mail] (development only: this is not sent anywhere)`);
        },
      };
    case "resend":
      if (!cfg.resendApiKey || !cfg.emailFrom) return null;
      return resendSender(cfg.resendApiKey, cfg.emailFrom, deps.fetchImpl ?? fetch);
    case "smtp":
      if (!cfg.smtp?.host || !cfg.emailFrom) return null;
      return smtpSender(cfg.smtp, cfg.emailFrom);
    default:
      return null;
  }
}

export function resendSender(apiKey: string, from: string, fetchImpl: typeof fetch): MailSender {
  return {
    name: "resend",
    async send(m) {
      const res = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`Resend responded ${res.status}`); // body deliberately not included
    },
  };
}

// ---- minimal SMTP client ----

export function buildRfc822(from: string, m: MailMessage, now = new Date(), host = "scholar-explorer"): string {
  const headers = [
    `From: ${oneLine(from)}`,
    `To: ${oneLine(m.to)}`,
    `Subject: ${oneLine(m.subject)}`,
    `Date: ${now.toUTCString()}`,
    `Message-ID: <${now.getTime()}.${Math.random().toString(36).slice(2)}@${host}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=us-ascii",
    "Content-Transfer-Encoding: 7bit",
  ];
  const body = m.text.replace(/\r?\n/g, "\r\n").replace(/^\./gm, "..");
  return headers.join("\r\n") + "\r\n\r\n" + body + "\r\n";
}

const addrOnly = (from: string) => (from.match(/<([^>]+)>/)?.[1] ?? from).trim();

class SmtpConn {
  private buf = "";
  private waiters: Array<(l: string) => void> = [];
  private lines: string[] = [];
  private err?: Error;
  constructor(public sock: net.Socket) { this.attach(sock); }
  attach(sock: net.Socket) {
    this.sock = sock;
    sock.on("data", (d: Buffer | string) => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf("\r\n")) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 2);
        const w = this.waiters.shift();
        if (w) w(line); else this.lines.push(line);
      }
    });
    sock.on("error", e => { this.err = e; this.waiters.splice(0).forEach(w => w("")); });
    sock.on("close", () => { this.err ??= new Error("SMTP connection closed"); this.waiters.splice(0).forEach(w => w("")); });
  }
  private line(): Promise<string> {
    if (this.lines.length) return Promise.resolve(this.lines.shift()!);
    if (this.err) return Promise.reject(this.err);
    return new Promise((res, rej) => this.waiters.push(l => (this.err && !l ? rej(this.err) : res(l))));
  }
  /** Reads one (possibly multi-line) reply and checks the status class. */
  async reply(expect: number): Promise<string> {
    let all = "";
    for (;;) {
      const l = await this.line();
      all += l + "\n";
      if (/^\d{3} /.test(l) || /^\d{3}$/.test(l)) {
        if (!l.startsWith(String(expect)[0])) throw new Error(`SMTP error ${l.slice(0, 3)}`);
        return all;
      }
    }
  }
  write(s: string) { this.sock.write(s); }
  async cmd(s: string, expect: number) { this.write(s + "\r\n"); return this.reply(expect); }
}

export function smtpSender(cfg: SmtpConfig, from: string): MailSender {
  return {
    name: "smtp",
    async send(m) {
      const rejectUnauthorized = true; // certificate verification is never disabled
      const servername = net.isIP(cfg.host) ? undefined : cfg.host; // SNI must not be an IP literal
      const timeout = 20_000;
      const sock: net.Socket = cfg.secure === "tls"
        ? tls.connect({ host: cfg.host, port: cfg.port, servername, rejectUnauthorized })
        : net.connect({ host: cfg.host, port: cfg.port });
      sock.setTimeout(timeout, () => sock.destroy(new Error("SMTP timeout")));
      const c = new SmtpConn(sock);
      try {
        await c.reply(2);
        await c.cmd("EHLO scholar-explorer", 2);
        if (cfg.secure === "starttls") {
          await c.cmd("STARTTLS", 2);
          sock.removeAllListeners("data");
          const secured = tls.connect({ socket: sock, servername, rejectUnauthorized });
          c.attach(secured);
          await c.cmd("EHLO scholar-explorer", 2);
        }
        if (cfg.user && cfg.pass) {
          const plain = Buffer.from(`\0${cfg.user}\0${cfg.pass}`).toString("base64");
          await c.cmd(`AUTH PLAIN ${plain}`, 2);
        }
        await c.cmd(`MAIL FROM:<${oneLine(addrOnly(from))}>`, 2);
        await c.cmd(`RCPT TO:<${oneLine(m.to)}>`, 2);
        await c.cmd("DATA", 3);
        c.write(buildRfc822(from, m) + ".\r\n");
        await c.reply(2);
        c.write("QUIT\r\n");
      } finally {
        c.sock.destroy();
      }
    },
  };
}

// ---- message content ----

export function buildMagicLinkMessage(to: string, link: string, ttlMinutes: number): MailMessage {
  const subject = "Your Scholar Explorer sign-in link";
  const text =
    `Use this link to sign in to Scholar Explorer:\n\n${link}\n\n` +
    `It works once and expires in ${ttlMinutes} minutes. If you did not ask for it, you can ignore this email.\n`;
  const html =
    `<p>Use this link to sign in to Scholar Explorer:</p><p><a href="${link}">Sign in</a></p>` +
    `<p>It works once and expires in ${ttlMinutes} minutes. If you did not ask for it, you can ignore this email.</p>`;
  return { to, subject, text, html };
}
