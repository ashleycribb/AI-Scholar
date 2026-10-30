import { test, expect, describe, beforeAll, afterAll, beforeEach } from "bun:test";
import express from "express";
import fs from "fs";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { createLocalVerifyRouter, resolveVaultFile, VaultPathError, type ExecFileFn } from "./localVerify";

let tmp: string;
let vault: string;
let outside: string;
let marker: string;
let execCalls: Array<{ file: string; args: string[]; options: any }>;

const fakeExec: ExecFileFn = (file, args, options, cb) => {
  execCalls.push({ file, args, options });
  cb(null, "fake-output", "");
};

beforeAll(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "localverify-")));
  vault = path.join(tmp, "vault");
  outside = path.join(tmp, "outside");
  fs.mkdirSync(path.join(vault, "sub"), { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(vault, "paper.mdx"), "doi: 10.1/x\n");
  fs.writeFileSync(path.join(vault, "notes.md"), "hello");
  fs.writeFileSync(path.join(vault, "sub", "deep.md"), "hello");
  fs.writeFileSync(path.join(vault, "data.json"), "{}");
  fs.writeFileSync(path.join(outside, "secret.md"), "secret");
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret");
  fs.symlinkSync(path.join(outside, "secret.md"), path.join(vault, "link-file.md"));
  fs.symlinkSync(outside, path.join(vault, "link-dir"));
  fs.symlinkSync(path.join(vault, "paper.mdx"), path.join(vault, "inside-link.md"));
  fs.symlinkSync(path.join(outside, "secret.txt"), path.join(vault, "ext-swap.md")); // .md name, .txt target
  // Files whose *names* are shell payloads (legal on POSIX) to prove they are only data.
  fs.writeFileSync(path.join(vault, "a;b.md"), "x");
  fs.writeFileSync(path.join(vault, "$(id).md"), "x");
  fs.writeFileSync(path.join(vault, "`id`.md"), "x");
  marker = path.join(tmp, "PWNED");
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));
beforeEach(() => { execCalls = []; });

describe("resolveVaultFile", () => {
  test("accepts .md/.mdx inside the vault, including nested, and returns the real path", () => {
    expect(resolveVaultFile(vault, "paper.mdx")).toBe(path.join(vault, "paper.mdx"));
    expect(resolveVaultFile(vault, "notes.MD".toLowerCase())).toBe(path.join(vault, "notes.md"));
    expect(resolveVaultFile(vault, "sub/deep.md")).toBe(path.join(vault, "sub", "deep.md"));
    expect(resolveVaultFile(vault, "inside-link.md")).toBe(path.join(vault, "paper.mdx")); // symlink staying inside is fine
  });

  const rejects: Array<[string, unknown]> = [
    ["traversal ../", "../outside/secret.md"],
    ["deep traversal", "sub/../../outside/secret.md"],
    ["traversal via encoded-looking backslashes", "..\\outside\\secret.md"],
    ["absolute path outside", "/etc/passwd"],
    ["absolute path to outside .md", "__ABS_OUTSIDE__"],
    ["symlink file escaping vault", "link-file.md"],
    ["file through symlinked dir escaping vault", "link-dir/secret.md"],
    ["symlink named .md pointing at non-md", "ext-swap.md"],
    ["disallowed extension", "data.json"],
    ["no extension", "paper"],
    ["double extension trick", "paper.mdx.sh"],
    ["directory", "sub"],
    ["vault root itself", "."],
    ["empty string", ""],
    ["NUL byte", "paper.mdx\0.json"],
    ["NUL byte before extension", "x\0../../outside/secret.md"],
    ["newline", "paper.mdx\n"],
    ["too long", "a".repeat(300) + ".md"],
    ["missing file", "nope.md"],
    ["number", 42],
    ["null", null],
    ["object", { toString: () => "paper.mdx" }],
    ["array", ["paper.mdx"]],
    ["undefined", undefined],
  ];
  for (const [name, input] of rejects) {
    test(`rejects ${name}`, () => {
      const v = input === "__ABS_OUTSIDE__" ? path.join(outside, "secret.md") : input;
      expect(() => resolveVaultFile(vault, v)).toThrow(VaultPathError);
    });
  }

  test("rejects when the vault directory does not exist", () => {
    expect(() => resolveVaultFile(path.join(tmp, "missing"), "paper.mdx")).toThrow(VaultPathError);
  });
});

describe("POST /api/local/verify (execFile, no shell)", () => {
  let server: import("http").Server;
  let url: string;

  function startWith(execFile: ExecFileFn | undefined, extra: Record<string, unknown> = {}) {
    const app = express();
    app.use("/api/local", createLocalVerifyRouter({ vaultDir: vault, scriptPath: "/fake/logician.py", execFile, ...extra }));
    return new Promise<void>((res) => {
      server = app.listen(0, "127.0.0.1", () => {
        url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/local/verify`;
        res();
      });
    });
  }
  const post = (body: unknown, raw = false) =>
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? (body as string) : JSON.stringify(body) });
  afterAll(() => server?.close());

  test("valid file: runs python with an argv array and shell:false, returns output", async () => {
    await startWith(fakeExec);
    const r = await post({ filePath: "paper.mdx" });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ status: "success", output: "fake-output" });
    expect(execCalls).toHaveLength(1);
    expect(execCalls[0].file).toBe("python3");
    expect(execCalls[0].args).toEqual(["/fake/logician.py", path.join(vault, "paper.mdx")]);
    expect(execCalls[0].options.shell).toBe(false);
    expect(execCalls[0].options.timeout).toBeGreaterThan(0);
    expect(execCalls[0].options.maxBuffer).toBeGreaterThan(0);
    server.close();
  });

  const payloads = [
    '"; touch PWNED; "',
    'x.md"; touch ' + "/tmp/PWNED" + '; echo "',
    "paper.mdx; touch /tmp/PWNED",
    "paper.mdx | touch /tmp/PWNED",
    "paper.mdx && touch /tmp/PWNED",
    "$(touch /tmp/PWNED).md",
    "`touch /tmp/PWNED`.md",
    "paper.mdx\ntouch /tmp/PWNED",
    "../../../../etc/passwd",
    "../outside/secret.md",
    "..%2f..%2foutside%2fsecret.md",
    "/etc/passwd",
    "link-file.md",
    "link-dir/secret.md",
  ];
  for (const p of payloads) {
    test(`rejects payload ${JSON.stringify(p)} with 400 and never runs a command`, async () => {
      await startWith(fakeExec);
      const r = await post({ filePath: p });
      expect(r.status).toBe(400);
      expect(await r.json()).toEqual({ error: "Invalid filePath" });
      expect(execCalls).toHaveLength(0);
      server.close();
    });
  }

  test("rejects non-string and missing filePath types with 400, nothing executed", async () => {
    await startWith(fakeExec);
    for (const body of [{}, { filePath: 1 }, { filePath: ["paper.mdx"] }, { filePath: { a: 1 } }, { filePath: null }, { filePath: "" }]) {
      const r = await post(body);
      expect(r.status).toBe(400);
    }
    const bad = await post("not json", true);
    expect(bad.status).toBeGreaterThanOrEqual(400);
    expect(bad.status).toBeLessThan(500);
    expect(execCalls).toHaveLength(0);
    server.close();
  });

  test("files whose names look like shell payloads are passed as ONE literal argv entry", async () => {
    await startWith(fakeExec);
    for (const name of ["a;b.md", "$(id).md", "`id`.md"]) {
      const r = await post({ filePath: name });
      expect(r.status).toBe(200);
    }
    expect(execCalls.map((c) => c.args[1])).toEqual([
      path.join(vault, "a;b.md"), path.join(vault, "$(id).md"), path.join(vault, "`id`.md"),
    ]);
    for (const c of execCalls) { expect(c.args).toHaveLength(2); expect(c.options.shell).toBe(false); }
    server.close();
  });

  test("failure from the script returns a generic 500 without stderr or paths", async () => {
    const failing: ExecFileFn = (_f, _a, _o, cb) => cb(new Error("boom /secret/path\nstack"), "", "Traceback: /secret/path");
    await startWith(failing);
    const r = await post({ filePath: "paper.mdx" });
    expect(r.status).toBe(500);
    const text = await r.text();
    expect(JSON.parse(text)).toEqual({ error: "Verification failed" });
    expect(text).not.toContain("secret");
    server.close();
  });

  test("END-TO-END with the real child_process.execFile: payloads create no marker file; a legit file reaches the script intact", async () => {
    // Stub "logician" (run by bun itself) that echoes its argv as JSON.
    const stub = path.join(tmp, "stub.js");
    fs.writeFileSync(stub, "console.log(JSON.stringify(process.argv.slice(2)));");
    // Child processes inherit our cwd, so a shell would create this marker there.
    const shellMarker = path.join(process.cwd(), `SHELL_RAN_${process.pid}`);
    // A file name with real shell metacharacters that would create the marker under a shell.
    const evil = `e;touch SHELL_RAN_${process.pid};x.md`;
    fs.writeFileSync(path.join(vault, evil), "x");
    await startWith(undefined, { python: process.execPath, scriptPath: stub });

    const ok = await post({ filePath: evil });
    expect(ok.status).toBe(200);
    const out = JSON.parse(((await ok.json()) as any).output);
    expect(out).toEqual([path.join(vault, evil)]); // exactly one argv entry, metacharacters are literal
    const ran = fs.existsSync(shellMarker);
    fs.rmSync(shellMarker, { force: true });
    expect(ran).toBe(false); // nothing was interpreted by a shell

    for (const p of [`"; touch ${marker}; "`, `paper.mdx"; touch ${marker}; echo "`, `$(touch ${marker}).md`, `\`touch ${marker}\`.md`, `paper.mdx|touch ${marker}`]) {
      const r = await post({ filePath: p });
      expect(r.status).toBe(400);
    }
    expect(fs.existsSync(marker)).toBe(false);
    fs.rmSync(path.join(vault, evil));
    server.close();
  });
});

describe("server code never spawns a shell", () => {
  const root = path.join(import.meta.dir, "..");
  const files = ["server.ts", "server/localVerify.ts", "services/mcp-server-impl.ts"];
  for (const f of files) {
    test(`${f}: no exec()/execSync()/shell:true/sh -c`, () => {
      const src = fs.readFileSync(path.join(root, f), "utf8");
      expect(src).not.toMatch(/(^|[^.\w])exec\s*\(/m);
      expect(src).not.toMatch(/\bexecSync\s*\(/);
      expect(src).not.toMatch(/\bspawnSync\s*\(\s*[`'"][^`'"]*\s/); // single-string spawn
      expect(src).not.toMatch(/shell\s*:\s*true/);
      expect(src).not.toMatch(/["'`](sh|bash|cmd(\.exe)?)["'`]\s*,\s*\[\s*["'`]-c/);
    });
  }
  test("server.ts no longer imports exec from child_process", () => {
    const src = fs.readFileSync(path.join(root, "server.ts"), "utf8");
    expect(src).not.toMatch(/import\s*\{[^}]*\bexec\b[^}]*\}\s*from\s*["']child_process["']/);
  });
});
