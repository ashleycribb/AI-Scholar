import { test, expect, describe } from "bun:test";
import net from "net";
import tls from "tls";
import { execFileSync, execFile } from "child_process";
import { promisify } from "util";
const execFileAsync = promisify(execFile);
import fs from "fs";
import os from "os";
import path from "path";
import { loadAuthConfig } from "./config";
import { createMailer, resendSender, smtpSender, buildRfc822, buildMagicLinkMessage } from "./mailer";

const msg = buildMagicLinkMessage("pi@uni.edu", "https://scholar.example/api/auth/magic-link/verify?token=abc", 15);

describe("mailer selection", () => {
  test("console sender prints the link to the server console only (dev)", async () => {
    const lines: string[] = [];
    const m = createMailer(loadAuthConfig({ NODE_ENV: "development" } as any), { log: l => lines.push(l) })!;
    expect(m.name).toBe("console");
    await m.send(msg);
    expect(lines.join("\n")).toContain("token=abc");
  });
  test("console sender is refused in production", () => {
    expect(createMailer(loadAuthConfig({ NODE_ENV: "production", AUTH_EMAIL_PROVIDER: "console", AUTH_PUBLIC_URL: "https://x.example" } as any))).toBeNull();
  });
  test("resend is chosen from RESEND_API_KEY and needs a From address", () => {
    const cfg = loadAuthConfig({ NODE_ENV: "production", AUTH_PUBLIC_URL: "https://x.example", RESEND_API_KEY: "re_x" } as any);
    expect(cfg.emailProvider).toBe("resend");
    expect(cfg.problems.join()).toMatch(/AUTH_EMAIL_FROM/);
    const ok = loadAuthConfig({ NODE_ENV: "production", AUTH_PUBLIC_URL: "https://x.example", RESEND_API_KEY: "re_x", AUTH_EMAIL_FROM: "Scholar <no-reply@x.example>" } as any);
    expect(ok.problems).toEqual([]);
  });
  test("smtp none-security is refused in production", () => {
    const c = loadAuthConfig({ NODE_ENV: "production", AUTH_PUBLIC_URL: "https://x.example", SMTP_HOST: "h", SMTP_SECURE: "none", AUTH_EMAIL_FROM: "a@x.example" } as any);
    expect(c.problems.join()).toMatch(/SMTP_SECURE=none/);
  });
});

describe("resend", () => {
  test("posts the message with the bearer key and never includes the key in errors", async () => {
    let seen: any;
    const f = (async (url: string, init: any) => { seen = { url, init }; return new Response("{}", { status: 200 }); }) as any;
    await resendSender("re_secret", "Scholar <a@x.example>", f).send(msg);
    expect(seen.url).toBe("https://api.resend.com/emails");
    expect(seen.init.headers.Authorization).toBe("Bearer re_secret");
    expect(JSON.parse(seen.init.body)).toMatchObject({ from: "Scholar <a@x.example>", to: ["pi@uni.edu"], subject: msg.subject });
    const bad = (async () => new Response("re_secret leaked?", { status: 422 })) as any;
    await expect(resendSender("re_secret", "a@x.example", bad).send(msg)).rejects.toThrow(/422/);
    await expect(resendSender("re_secret", "a@x.example", bad).send(msg)).rejects.not.toThrow(/re_secret/);
  });
});

describe("smtp", () => {
  test("rfc822 builder strips header injection and dot-stuffs", () => {
    const raw = buildRfc822("Scholar <a@x.example>", { ...msg, to: "x@y.io\r\nBcc: z@y.io", subject: "hi\r\nBcc: q@y.io", text: ".leading\nline" });
    expect(raw).not.toMatch(/\r\nBcc:/);
    expect(raw).toContain("\r\n..leading\r\nline");
  });

  /** Tiny scripted SMTP server; records the transcript. */
  function fakeServer(opts: { starttls?: { key: string; cert: string }; implicitTls?: { key: string; cert: string }; rejectAuth?: boolean }) {
    const transcript: string[] = [];
    const handle = (sock: net.Socket) => {
      let buf = ""; let inData = false; let secured = !opts.starttls;
      const send = (s: string) => sock.write(s + "\r\n");
      const attach = (s: net.Socket) => s.on("data", d => {
        buf += d.toString();
        let i;
        while ((i = buf.indexOf("\r\n")) >= 0) {
          const line = buf.slice(0, i); buf = buf.slice(i + 2);
          transcript.push(line);
          if (inData) { if (line === ".") { inData = false; send("250 queued"); } continue; }
          if (/^EHLO/i.test(line)) { send("250-fake"); send(secured ? "250 AUTH PLAIN" : "250-STARTTLS\r\n250 AUTH PLAIN"); }
          else if (/^STARTTLS/i.test(line) && opts.starttls) {
            send("220 go");
            sock.removeAllListeners("data");
            const t = new tls.TLSSocket(sock, { isServer: true, key: opts.starttls.key, cert: opts.starttls.cert });
            secured = true; sock = t as any; attach(t as any);
          }
          else if (/^AUTH PLAIN/i.test(line)) send(opts.rejectAuth ? "535 no" : "235 ok");
          else if (/^MAIL FROM/i.test(line) || /^RCPT TO/i.test(line)) send("250 ok");
          else if (/^DATA/i.test(line)) { inData = true; send("354 go"); }
          else if (/^QUIT/i.test(line)) { send("221 bye"); sock.end(); }
        }
      });
      send("220 fake ready");
      attach(sock);
    };
    const server = opts.implicitTls ? tls.createServer({ key: opts.implicitTls.key, cert: opts.implicitTls.cert }, handle as any) : net.createServer(handle);
    return new Promise<{ port: number; transcript: string[]; close(): void }>(r => server.listen(0, "127.0.0.1", () => r({ port: (server.address() as net.AddressInfo).port, transcript, close: () => server.close() })));
  }

  test("plain SMTP (tests only) with AUTH PLAIN delivers one message", async () => {
    const s = await fakeServer({});
    await smtpSender({ host: "127.0.0.1", port: s.port, secure: "none", user: "u", pass: "p" }, "Scholar <a@x.example>").send(msg);
    s.close();
    const t = s.transcript.join("\n");
    expect(t).toContain("AUTH PLAIN " + Buffer.from("\0u\0p").toString("base64"));
    expect(t).toContain("MAIL FROM:<a@x.example>");
    expect(t).toContain("RCPT TO:<pi@uni.edu>");
    expect(t).toContain("token=abc");
  });

  test("a rejected login surfaces as an error", async () => {
    const s = await fakeServer({ rejectAuth: true });
    await expect(smtpSender({ host: "127.0.0.1", port: s.port, secure: "none", user: "u", pass: "p" }, "a@x.example").send(msg)).rejects.toThrow(/535/);
    s.close();
  });

  const haveOpenssl = (() => { try { execFileSync("openssl", ["version"]); return true; } catch { return false; } })();
  (haveOpenssl ? test : test.skip)("STARTTLS and implicit TLS both work (self-signed cert, verification on)", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "smtp-"));
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", `${dir}/k.pem`, "-out", `${dir}/c.pem`, "-days", "1", "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1"], { stdio: "ignore" });
    const key = fs.readFileSync(`${dir}/k.pem`, "utf8"), cert = fs.readFileSync(`${dir}/c.pem`, "utf8");
    // Verification stays ON: with an untrusted cert the send must fail...
    const refuse = await fakeServer({ implicitTls: { key, cert } });
    await expect(smtpSender({ host: "127.0.0.1", port: refuse.port, secure: "tls" }, "a@x.example").send(msg)).rejects.toThrow();
    refuse.close();
    // ...and succeed once the cert is trusted via NODE_EXTRA_CA_CERTS-equivalent (tls.rootCertificates is read-only, so use a CA env in a child process).
    const script = `
      const { smtpSender, buildMagicLinkMessage } = require(${JSON.stringify(path.resolve(import.meta.dir, "mailer.ts"))});
      (async () => {
        const [mode, port] = process.argv.slice(1);
        await smtpSender({ host: "127.0.0.1", port: Number(port), secure: mode }, "a@x.example").send(buildMagicLinkMessage("pi@uni.edu", "https://x/?token=zzz", 15));
        console.log("sent");
      })().catch(e => { console.error(e); process.exit(1); });`;
    for (const mode of ["tls", "starttls"] as const) {
      const srv = await fakeServer(mode === "tls" ? { implicitTls: { key, cert } } : { starttls: { key, cert } });
      // async: the fake server lives in this process, so the event loop must stay free
      const { stdout: out } = await execFileAsync(process.execPath, ["-e", script, mode, String(srv.port)], { env: { ...process.env, NODE_EXTRA_CA_CERTS: `${dir}/c.pem` } });
      srv.close();
      expect(out).toContain("sent");
      expect(srv.transcript.join("\n")).toContain("token=zzz");
    }
  }, 30_000);
});
