# Durable server storage, backups and the bundled S3A engine

Status: documented, **not deployed**. Nothing here has been applied to the running Cloud Run service.

## What the server stores

All server data lives in one directory, set by `SCHOLAR_DATA_DIR` (`server/dataDir.ts`):

| File | Contents |
|---|---|
| `sql_lrs.sqlite` | xAPI statement log (append-only) and the signed-in workspace copy (`xapi_states`) |
| `auth.sqlite` | accounts and sessions (`AUTH_DB_PATH` still overrides this one file) |
| `research_provenance.sqlite` | claims and evidence |
| `source_registry.json` | source registry |
| `tensor_lrs.duckdb` | optional analytics copy (`ENABLE_DUCKDB_ANALYTICS=true`), rebuildable, not backed up |

Without `SCHOLAR_DATA_DIR` the directory is `./local_engine`. On Cloud Run that is the container's own disk, which
is lost on every redeploy, restart and scale-down; the server logs a warning at startup when it runs in production
(`NODE_ENV=production` or Cloud Run's `K_SERVICE`) without `SCHOLAR_DATA_DIR`.

The browser's IndexedDB log stays the researcher's source of truth (data fix 1); the server copy is a second copy.

## Cloud Run setting (to apply by hand)

Cloud Run can mount an NFS share (for example a Filestore instance) as a volume
([docs](https://cloud.google.com/run/docs/configuring/services/nfs-volume-mounts)). The service must be on the
Filestore VPC network (Direct VPC egress) and run in the second-generation execution environment.

```sh
gcloud run services update SERVICE \
  --region REGION \
  --execution-environment gen2 \
  --network NETWORK --subnet SUBNET \
  --add-volume name=scholar-data,type=nfs,location=FILESTORE_IP:/share1 \
  --add-volume-mount volume=scholar-data,mount-path=/mnt/scholar-data \
  --update-env-vars SCHOLAR_DATA_DIR=/mnt/scholar-data \
  --max-instances 1
```

Why `--max-instances 1`: Cloud Run mounts NFS **without file locking**. SQLite relies on locks to keep two writers
apart, so only one instance (one process) may write these files. With more than one instance the databases can be
corrupted. Do not use a Cloud Storage FUSE volume for these files: it does not support the file locking and
in-place writes SQLite needs.

If the service must scale beyond one instance, the statement log and workspace copy need to move to a database
server (for example Cloud SQL); that is a separate change.

Check after applying: the startup log shows `[data] Server data directory: /mnt/scholar-data (SCHOLAR_DATA_DIR).`;
redeploy, sign in, and the queue and statements are still there.

## Backups and restore

```sh
npm run data:backup -- /path/to/backups        # consistent copy of every .sqlite (VACUUM INTO) and .json
npm run data:verify -- /path/to/backups/scholar-data-<UTC time>
npm run data:restore -- /path/to/backups/scholar-data-<UTC time> /path/to/empty/dir
```

- A backup folder holds the files, `backup.json` (UTC time, file list) and `manifest.sha256` (`sha256sum -c`).
- `VACUUM INTO` gives a consistent copy while the server keeps running, including committed WAL content.
- Restore checks every SHA-256 and runs `PRAGMA integrity_check` on each database, then writes into an **empty**
  directory only (all-or-nothing). Point `SCHOLAR_DATA_DIR` at it and restart; live data is never overwritten.
- Daily: run `npm run data:backup` once a day against the mounted directory (for example a Cloud Run job on the same
  volume, triggered by Cloud Scheduler) and copy the folder off the share (for example to a Cloud Storage bucket),
  or use Filestore's own scheduled backups. Neither is set up yet.
- Restore drill: `server/dataBackup.test.ts` backs up a live directory, deletes it, restores into an empty
  directory and checks that statements, workspace state, other databases and JSON files are identical.

## S3A engine: bundled, pinned, verified

- The engine glue (`services/wasm/s3a_wasm_snapshot.js`) is bundled with the app; the binary is served from the
  app's own origin (`public/s3a_wasm_snapshot_bg.wasm`). Nothing is loaded from jsDelivr.
- Before the binary is used its SHA-256 is compared with the value published for s3a-wasm-dist v0.1.56
  (`services/wasm/BUILD_INFO.txt`, `S3A_ENGINE_WASM_SHA256`). A different file is refused.
- To upgrade: copy the new release's `s3a_wasm_snapshot.js`, `.d.ts` and `_bg.wasm` into `services/wasm/`, the
  `.wasm` into `public/`, its `BUILD_INFO.txt` into `services/wasm/`, and update `S3A_ENGINE_VERSION` and
  `S3A_ENGINE_WASM_SHA256`.

Known limits:

- Research-graph edges (tile 13) are still encoded in TypeScript (`buildGraphDeltaPacket`) and applied with the
  engine's `apply_delta`. The engine's WebAssembly API (v0.1.56; v0.1.75 has the same surface) has no call that adds
  an edge, so this cannot be replaced by an engine call until the engine exposes one (the Rust graph has `add_edge`,
  but it is not exported to WebAssembly).
- No third-party CDN (data fix 10). Tailwind 3.4.17 is compiled at build time (PostCSS, `tailwind.config.js`), the
  Inter / Playfair Display / JetBrains Mono fonts come from `@fontsource` packages, and jsPDF 2.5.1 and citation-js
  0.7.6 (core, plugin-csl, plugin-ris) are npm imports; all are served from the app's own origin.
  `npm run check:no-cdn` (also a CI step) fails if any built HTML/CSS in `dist/` or `dist-extension/` loads a script,
  stylesheet or font from another origin. Checked in headless Chrome against the production build with every host but
  localhost unresolvable: the page renders with the bundled stylesheet. PDF download and citation-js formatting were
  not clicked through in the browser; citation-js APA output was checked under Node.
