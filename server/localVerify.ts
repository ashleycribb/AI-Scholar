/**
 * POST /api/local/verify and the MCP `run_logician_verification` tool run the
 * Python "logician" nanobot on a markdown file from the local vault.
 *
 * Security properties (this used to build one shell string around a
 * request-controlled path, i.e. shell command injection):
 *  - The interpreter is started with execFile / an argv array. No shell is ever
 *    involved, so metacharacters (; | & $() ` " newlines) are plain bytes.
 *  - The requested path must be a string, bounded in length, free of NUL and
 *    control characters, and use an allowlisted extension (.md / .mdx).
 *  - It is resolved against the vault directory and must stay inside it, both
 *    lexically (rejects ../ and absolute paths outside) and after symlink
 *    resolution (realpath), and must be a regular file.
 *  - Upstream stderr / paths are never returned to the client.
 */
import fs from "fs";
import path from "path";
import { execFile as nodeExecFile } from "child_process";
import { Router, json } from "express";

export const ALLOWED_EXTENSIONS = new Set([".md", ".mdx"]);
export const MAX_PATH_LENGTH = 255;
export const EXEC_TIMEOUT_MS = 30_000;
export const EXEC_MAX_BUFFER = 1024 * 1024;

export class VaultPathError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "VaultPathError";
  }
}

function isInside(base: string, target: string): boolean {
  const rel = path.relative(base, target);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

/**
 * Validates `input` and returns the real, absolute path of a markdown file that
 * is inside `vaultDir`. Throws VaultPathError otherwise.
 */
export function resolveVaultFile(vaultDir: string, input: unknown): string {
  if (typeof input !== "string" || input.length === 0) throw new VaultPathError("filePath must be a non-empty string");
  if (input.length > MAX_PATH_LENGTH) throw new VaultPathError("filePath too long");
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(input)) throw new VaultPathError("filePath contains control characters");
  if (!ALLOWED_EXTENSIONS.has(path.extname(input).toLowerCase())) throw new VaultPathError("unsupported file type");

  let realVault: string;
  try {
    realVault = fs.realpathSync(vaultDir);
  } catch {
    throw new VaultPathError("vault not found");
  }

  const candidate = path.resolve(realVault, input);
  if (!isInside(realVault, candidate)) throw new VaultPathError("path escapes vault");

  let real: string;
  try {
    real = fs.realpathSync(candidate);
  } catch {
    throw new VaultPathError("file not found");
  }
  if (!isInside(realVault, real)) throw new VaultPathError("path escapes vault");
  if (!ALLOWED_EXTENSIONS.has(path.extname(real).toLowerCase())) throw new VaultPathError("unsupported file type");
  if (!fs.statSync(real).isFile()) throw new VaultPathError("not a regular file");
  return real;
}

export type ExecFileFn = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer: number; windowsHide: boolean; shell: false },
  callback: (error: Error | null, stdout: string, stderr: string) => void,
) => unknown;

export interface LocalVerifyOptions {
  vaultDir?: string;
  scriptPath?: string;
  python?: string;
  /** Test seam; defaults to child_process.execFile. */
  execFile?: ExecFileFn;
}

export function createLocalVerifyRouter(opts: LocalVerifyOptions = {}): Router {
  const vaultDir = opts.vaultDir ?? path.join(process.cwd(), "local_engine", "vault");
  const scriptPath = opts.scriptPath ?? path.join(process.cwd(), "local_engine", "nanobots", "logician.py");
  const python = opts.python ?? "python3";
  const run: ExecFileFn = opts.execFile ?? (nodeExecFile as unknown as ExecFileFn);

  const router = Router();
  router.post("/verify", json({ limit: "8kb" }), (req, res) => {
    let absolutePath: string;
    try {
      absolutePath = resolveVaultFile(vaultDir, req.body?.filePath);
    } catch (e) {
      if (e instanceof VaultPathError) return res.status(400).json({ error: "Invalid filePath" });
      return res.status(500).json({ error: "Verification failed" });
    }

    // Argument array + shell:false: the path is a single argv entry, never parsed by a shell.
    run(
      python,
      [scriptPath, absolutePath],
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: EXEC_MAX_BUFFER, windowsHide: true, shell: false },
      (error, stdout) => {
        if (error) {
          console.error(`[local/verify] logician failed: ${error.message.split("\n")[0]}`);
          return res.status(500).json({ error: "Verification failed" });
        }
        res.json({ status: "success", output: stdout });
      },
    );
  });
  return router;
}
