/**
 * Backup and restore of the server data directory (data fix 8).
 *
 * backupDataDir: a consistent copy of every SQLite database (VACUUM INTO, safe while the server runs, includes
 * WAL contents) and every JSON file, plus manifest.sha256 and backup.json, in a new folder named by UTC time.
 * restoreDataDir: checks every SHA-256 and PRAGMA integrity_check, then writes into an EMPTY target directory
 * (point SCHOLAR_DATA_DIR at it, or stop the server and swap directories). It never overwrites live data.
 */
import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

export const BACKUP_MANIFEST = "manifest.sha256";
export const BACKUP_INFO = "backup.json";

const sha256File = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const isSqlite = (name: string) => name.endsWith(".sqlite");
const isBackedUp = (name: string) => isSqlite(name) || name.endsWith(".json");

export class BackupError extends Error {
  constructor(message: string) { super(message); this.name = "BackupError"; }
}

export interface BackupResult { dir: string; files: string[]; createdAt: string }

export function backupDataDir(dataDir: string, backupRoot: string, now: Date = new Date()): BackupResult {
  if (!fs.existsSync(dataDir)) throw new BackupError(`Data directory ${dataDir} does not exist.`);
  const createdAt = now.toISOString();
  const dir = path.join(backupRoot, `scholar-data-${createdAt.replace(/[:.]/g, "-")}`);
  if (fs.existsSync(dir)) throw new BackupError(`Backup folder ${dir} already exists.`);
  fs.mkdirSync(dir, { recursive: true });
  const names = fs.readdirSync(dataDir).filter(n => isBackedUp(n) && fs.statSync(path.join(dataDir, n)).isFile()).sort();
  for (const name of names) {
    const src = path.join(dataDir, name);
    const dest = path.join(dir, name);
    if (isSqlite(name)) {
      const db = new DatabaseSync(src, { readOnly: true });
      try {
        db.prepare("VACUUM INTO ?").run(dest);
      } finally {
        db.close();
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  }
  fs.writeFileSync(path.join(dir, BACKUP_INFO), JSON.stringify({ schemaVersion: 1, createdAt, sourceDir: dataDir, files: names }, null, 2) + "\n");
  const listed = [...names, BACKUP_INFO].sort();
  fs.writeFileSync(path.join(dir, BACKUP_MANIFEST), listed.map(n => `${sha256File(path.join(dir, n))}  ${n}`).join("\n") + "\n");
  return { dir, files: listed, createdAt };
}

export interface BackupCheck { ok: boolean; mismatched: string[]; missing: string[]; corrupt: string[]; files: string[] }

export function verifyBackup(backupDir: string): BackupCheck {
  const manifestPath = path.join(backupDir, BACKUP_MANIFEST);
  if (!fs.existsSync(manifestPath)) return { ok: false, mismatched: [], missing: [BACKUP_MANIFEST], corrupt: [], files: [] };
  const entries = fs.readFileSync(manifestPath, "utf8").split("\n")
    .map(l => /^([0-9a-f]{64}) {2}(.+)$/.exec(l)).filter((m): m is RegExpExecArray => Boolean(m))
    .map(m => ({ hash: m[1], name: m[2] }));
  const mismatched: string[] = []; const missing: string[] = []; const corrupt: string[] = [];
  for (const { hash, name } of entries) {
    const file = path.join(backupDir, name);
    if (name.includes("/") || name.includes("\\") || !fs.existsSync(file)) { missing.push(name); continue; }
    if (sha256File(file) !== hash) { mismatched.push(name); continue; }
    if (isSqlite(name)) {
      const db = new DatabaseSync(file, { readOnly: true });
      try {
        const row = db.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
        if (row?.integrity_check !== "ok") corrupt.push(name);
      } catch {
        corrupt.push(name);
      } finally {
        db.close();
      }
    }
  }
  return { ok: !mismatched.length && !missing.length && !corrupt.length && entries.length > 0, mismatched, missing, corrupt, files: entries.map(e => e.name) };
}

export function restoreDataDir(backupDir: string, targetDir: string): string[] {
  const check = verifyBackup(backupDir);
  if (!check.ok) {
    throw new BackupError(`Backup ${backupDir} failed verification (changed: ${check.mismatched.join(", ") || "none"}; missing: ${check.missing.join(", ") || "none"}; corrupt: ${check.corrupt.join(", ") || "none"}). Nothing was restored.`);
  }
  if (fs.existsSync(targetDir) && fs.readdirSync(targetDir).length > 0) {
    throw new BackupError(`Restore target ${targetDir} is not empty. Restore into an empty directory, then point SCHOLAR_DATA_DIR at it.`);
  }
  const staging = `${targetDir.replace(/[\\/]+$/, "")}.restoring-${process.pid}`;
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(staging, { recursive: true });
  const restored = check.files.filter(n => n !== BACKUP_MANIFEST && n !== BACKUP_INFO);
  for (const name of restored) fs.copyFileSync(path.join(backupDir, name), path.join(staging, name));
  // Only a complete copy becomes the target.
  if (fs.existsSync(targetDir)) fs.rmdirSync(targetDir);
  fs.renameSync(staging, targetDir);
  return restored;
}
