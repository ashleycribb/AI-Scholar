/**
 * Fix 8: the server data directory is configurable, and a backup restores to the same data.
 */
import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { SqlLrsStore } from "./lrsDatabase";
import { backupDataDir, restoreDataDir, verifyBackup, BACKUP_MANIFEST, runDailyBackup, pruneBackupRoot, listBackupDirs, DEFAULT_BACKUP_KEEP } from "./dataBackup";
import { dataDirNotice, dataFile, serverDataDir, SERVER_DATA_FILES } from "./dataDir";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "scholar-data-"));
const stmt = (id: string, name: string) => ({
  id, actor: { objectType: "Agent", name, mbox: `mailto:${name.toLowerCase().replace(/\W+/g, ".")}@uni.edu` },
  verb: { id: "http://adlnet.gov/expapi/verbs/experienced", display: { "en-US": "experienced" } },
  object: { objectType: "Activity", id: `https://scholar.example/works/${id}` },
  timestamp: "2026-11-15T04:00:00.000Z",
});

describe("server data directory", () => {
  test("SCHOLAR_DATA_DIR moves every data file; unset in production is a visible warning", () => {
    const dir = tmp();
    const env = { SCHOLAR_DATA_DIR: dir } as NodeJS.ProcessEnv;
    expect(serverDataDir(env)).toBe(path.resolve(dir));
    expect(dataFile(SERVER_DATA_FILES.lrs, env)).toBe(path.join(dir, "sql_lrs.sqlite"));
    expect(dataDirNotice(env).level).toBe("info");
    const prod = dataDirNotice({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    expect(prod.level).toBe("warn");
    expect(prod.message).toMatch(/lost on redeploy/);
    expect(dataDirNotice({ K_SERVICE: "scholar" } as NodeJS.ProcessEnv).level).toBe("warn");
    expect(serverDataDir({} as NodeJS.ProcessEnv)).toBe(path.join(process.cwd(), "local_engine"));
  });
});

describe("backup and restore drill", () => {
  function seed(dir: string) {
    const lrs = new SqlLrsStore(new DatabaseSync(path.join(dir, SERVER_DATA_FILES.lrs)));
    lrs.insertStatements([stmt("00000000-0000-4000-8000-000000000001", "Zoë Ångström"), stmt("00000000-0000-4000-8000-000000000002", "山田 太郎")], { objectType: "Agent", mbox: "mailto:server@scholar.example" }, new Date("2026-11-15T04:00:01.000Z"));
    lrs.putState("https://scholar.example/workspace", "workspace", { schemaVersion: 1, papers: [{ id: "doi:10.1162/neco.1997.9.8.1735", title: "Long Short-Term Memory" }] });
    fs.writeFileSync(path.join(dir, SERVER_DATA_FILES.sourceRegistry), JSON.stringify({ sources: [{ id: "base_search" }] }));
    const prov = new DatabaseSync(path.join(dir, SERVER_DATA_FILES.provenance));
    prov.exec("CREATE TABLE claims (id TEXT PRIMARY KEY, claim_text TEXT); INSERT INTO claims VALUES ('c1', 'Mémoire à long terme');");
    prov.close();
    return lrs;
  }

  const snapshot = (dir: string) => {
    const lrs = new SqlLrsStore(new DatabaseSync(path.join(dir, SERVER_DATA_FILES.lrs)));
    const prov = new DatabaseSync(path.join(dir, SERVER_DATA_FILES.provenance), { readOnly: true });
    const out = {
      statements: lrs.getStatements({ limit: 100, scope: { kind: "all" } }),
      count: lrs.count(),
      state: lrs.getState("https://scholar.example/workspace", "workspace"),
      claims: prov.prepare("SELECT * FROM claims").all(),
      registry: fs.readFileSync(path.join(dir, SERVER_DATA_FILES.sourceRegistry), "utf8"),
    };
    prov.close();
    return out;
  };

  test("a restore reproduces the statements, the workspace state, other databases and JSON files", () => {
    const live = tmp();
    const lrs = seed(live); // still open, WAL mode: the backup must include committed WAL content
    const before = snapshot(live);
    expect(before.count).toBe(2);

    const backups = tmp();
    const res = backupDataDir(live, backups, new Date("2026-11-15T05:00:00.000Z"));
    expect(path.basename(res.dir)).toBe("scholar-data-2026-11-15T05-00-00-000Z");
    expect(res.files).toEqual(["backup.json", "research_provenance.sqlite", "source_registry.json", "sql_lrs.sqlite"]);
    expect(verifyBackup(res.dir).ok).toBe(true);

    // Lose the live data (what a redeploy does to the container disk), then restore into an empty directory.
    void lrs;
    fs.rmSync(live, { recursive: true, force: true });
    const target = path.join(tmp(), "restored");
    expect(restoreDataDir(res.dir, target).sort()).toEqual(["research_provenance.sqlite", "source_registry.json", "sql_lrs.sqlite"]);
    expect(snapshot(target)).toEqual(before);

    // The restored log is still append-only.
    const db = new DatabaseSync(path.join(target, SERVER_DATA_FILES.lrs));
    expect(() => db.prepare("UPDATE xapi_statements SET verb_name = 'x'").run()).toThrow();
    db.close();
  });

  test("a changed backup file or a non-empty target is refused, and nothing is written", () => {
    const live = tmp();
    seed(live);
    const res = backupDataDir(live, tmp());
    const bytes = fs.readFileSync(path.join(res.dir, SERVER_DATA_FILES.sourceRegistry));
    fs.writeFileSync(path.join(res.dir, SERVER_DATA_FILES.sourceRegistry), Buffer.concat([bytes, Buffer.from(" ")]));
    const target = path.join(tmp(), "t1");
    expect(() => restoreDataDir(res.dir, target)).toThrow(/failed verification \(changed: source_registry\.json/);
    expect(fs.existsSync(target)).toBe(false);

    const good = backupDataDir(live, tmp());
    const busy = tmp();
    fs.writeFileSync(path.join(busy, "keep.txt"), "live data");
    expect(() => restoreDataDir(good.dir, busy)).toThrow(/not empty/);
    expect(fs.readdirSync(busy)).toEqual(["keep.txt"]);

    fs.rmSync(path.join(good.dir, BACKUP_MANIFEST));
    expect(verifyBackup(good.dir).ok).toBe(false);
  });

  test("runDailyBackup verifies the new folder and keeps only the newest 30 dailies", () => {
    const live = tmp();
    const root = tmp();
    seed(live);
    const dates = (n: number) => new Date(Date.UTC(2026, 0, n, 12, 0, 0));
    for (let d = 1; d <= 32; d++) {
      const res = backupDataDir(live, root, dates(d));
      expect(verifyBackup(res.dir).ok).toBe(true);
    }
    expect(listBackupDirs(root)).toHaveLength(32);

    const daily = runDailyBackup(live, root, DEFAULT_BACKUP_KEEP, dates(33));
    expect(daily.verify.ok).toBe(true);
    expect(fs.existsSync(path.join(daily.backup.dir, BACKUP_MANIFEST))).toBe(true);
    expect(listBackupDirs(root)).toHaveLength(30);
    expect(daily.pruned.kept).toHaveLength(30);
    expect(daily.pruned.deleted).toHaveLength(3); // 32 existing + 1 new - 30 kept
    expect(daily.pruned.kept[0]).toBe(daily.backup.dir);
    const names = listBackupDirs(root).map(r => path.basename(r.dir));
    expect(names.some(n => n.includes("2026-01-01"))).toBe(false);
    expect(names.some(n => n.includes("2026-01-03"))).toBe(false);
    expect(names.some(n => n.includes("2026-01-04"))).toBe(true);
    // Date.UTC(2026, 0, 33) is 2026-02-02
    expect(names.some(n => n.includes("2026-02-02"))).toBe(true);
  });

  test("runDailyBackup throws and does not prune when the data directory is missing", () => {
    const root = tmp();
    const live = tmp();
    seed(live);
    backupDataDir(live, root, new Date("2026-01-01T00:00:00.000Z"));
    backupDataDir(live, root, new Date("2026-01-02T00:00:00.000Z"));
    const before = listBackupDirs(root).map(r => r.dir);
    expect(() => runDailyBackup(path.join(live, "does-not-exist"), root, 30)).toThrow(/does not exist/);
    expect(listBackupDirs(root).map(r => r.dir)).toEqual(before);
  });

  test("prune leaves unrelated folders alone and rejects keep < 1", () => {
    const root = tmp();
    fs.writeFileSync(path.join(root, "notes.txt"), "not a backup");
    fs.mkdirSync(path.join(root, "other"));
    expect(pruneBackupRoot(root, 30)).toEqual({ kept: [], deleted: [] });
    expect(fs.existsSync(path.join(root, "notes.txt"))).toBe(true);
    expect(() => pruneBackupRoot(root, 0)).toThrow(/BACKUP_KEEP/);
  });
});
