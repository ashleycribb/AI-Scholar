/**
 * Server data backup / restore (docs/data/DURABLE_STORAGE.md).
 *
 *   npx tsx scripts/data-backup.ts backup  [backupRoot]      # data dir = SCHOLAR_DATA_DIR or ./local_engine
 *   npx tsx scripts/data-backup.ts verify  <backupDir>
 *   npx tsx scripts/data-backup.ts restore <backupDir> <emptyTargetDir>
 *   npx tsx scripts/data-backup.ts daily   [backupRoot]      # backup, verify, prune to BACKUP_KEEP (default 30)
 */
import path from "path";
import { backupDataDir, restoreDataDir, verifyBackup, runDailyBackup, DEFAULT_BACKUP_KEEP } from "../server/dataBackup";
import { serverDataDir } from "../server/dataDir";

const [cmd, a, b] = process.argv.slice(2);
try {
  if (cmd === "backup") {
    const res = backupDataDir(serverDataDir(), path.resolve(a || "backups"));
    console.log(`Backed up ${res.files.length} files to ${res.dir} at ${res.createdAt}`);
  } else if (cmd === "verify" && a) {
    const res = verifyBackup(path.resolve(a));
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else if (cmd === "restore" && a && b) {
    const files = restoreDataDir(path.resolve(a), path.resolve(b));
    console.log(`Restored ${files.length} files into ${path.resolve(b)}. Point SCHOLAR_DATA_DIR at it and restart.`);
  } else if (cmd === "daily") {
    const root = path.resolve(a || process.env.BACKUP_ROOT || "backups");
    const keep = Number(process.env.BACKUP_KEEP ?? DEFAULT_BACKUP_KEEP);
    const res = runDailyBackup(serverDataDir(), root, keep);
    console.log(JSON.stringify({
      dir: res.backup.dir,
      createdAt: res.backup.createdAt,
      files: res.backup.files,
      verified: res.verify.ok,
      kept: res.pruned.kept.length,
      deleted: res.pruned.deleted.length,
    }, null, 2));
  } else {
    console.error("usage: data-backup.ts backup [backupRoot] | verify <backupDir> | restore <backupDir> <emptyTargetDir> | daily [backupRoot]");
    process.exit(2);
  }
} catch (err: any) {
  console.error(err?.message || err);
  process.exit(1);
}
