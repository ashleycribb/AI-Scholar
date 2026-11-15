/**
 * Fix 8: the server data directory is configurable, and a backup restores to the same data.
 */
import { describe, expect, test } from "bun:test";
import fs from "fs";
import os from "os";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import { SqlLrsStore } from "./lrsDatabase";
import { backupDataDir, restoreDataDir, verifyBackup, BACKUP_MANIFEST } from "./dataBackup";
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
});
