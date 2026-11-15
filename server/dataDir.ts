/**
 * Where the server keeps its data (data fix 8).
 *
 * SCHOLAR_DATA_DIR names a directory on durable storage (a mounted volume). When it is not set, data goes to
 * ./local_engine under the working directory, which on Cloud Run is the container's own disk: it is lost on every
 * redeploy, restart or scale-down. The server says so at startup instead of pretending the data is safe.
 * See docs/data/DURABLE_STORAGE.md.
 */
import fs from "fs";
import path from "path";

export const DATA_DIR_ENV = "SCHOLAR_DATA_DIR";

/** Files the server writes in the data directory. */
export const SERVER_DATA_FILES = {
  lrs: "sql_lrs.sqlite",
  auth: "auth.sqlite",
  provenance: "research_provenance.sqlite",
  sourceRegistry: "source_registry.json",
  analytics: "tensor_lrs.duckdb",
} as const;

export function serverDataDir(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env[DATA_DIR_ENV]?.trim();
  return configured ? path.resolve(configured) : path.join(process.cwd(), "local_engine");
}

export function isDataDirConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[DATA_DIR_ENV]?.trim());
}

/** Absolute path of a data file; creates the data directory if needed. */
export function dataFile(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const dir = serverDataDir(env);
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, name);
}

/** One line for the startup log: where data lives and whether that is durable. */
export function dataDirNotice(env: NodeJS.ProcessEnv = process.env): { level: "info" | "warn"; message: string } {
  const dir = serverDataDir(env);
  if (isDataDirConfigured(env)) return { level: "info", message: `[data] Server data directory: ${dir} (${DATA_DIR_ENV}).` };
  const production = env.NODE_ENV === "production" || Boolean(env.K_SERVICE);
  return {
    level: production ? "warn" : "info",
    message: production
      ? `[data] ${DATA_DIR_ENV} is not set: server data is on the container disk (${dir}) and is lost on redeploy or scale-down. Mount durable storage and set ${DATA_DIR_ENV} (docs/data/DURABLE_STORAGE.md).`
      : `[data] Server data directory: ${dir} (default; set ${DATA_DIR_ENV} for durable storage).`,
  };
}
