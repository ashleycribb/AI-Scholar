import path from 'path';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import duckdb from 'duckdb';

const localEngineDir = path.join(process.cwd(), 'local_engine');
if (!fs.existsSync(localEngineDir)) {
  fs.mkdirSync(localEngineDir, { recursive: true });
}

// 1. SQLite Database for Yet SQL LRS (Human Interaction Tracking)
const sqlLrsPath = path.join(localEngineDir, 'sql_lrs.sqlite');

/** Who is asking, as far as data scoping goes. Always derived from the server-side session, never from the request. */
export type LrsScope =
  | { kind: 'all' }
  | { kind: 'own'; actors: string[] };

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS xapi_statements (
    id TEXT PRIMARY KEY,
    timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
    stored TEXT DEFAULT CURRENT_TIMESTAMP,
    actor_name TEXT,
    actor_mbox TEXT,
    verb_id TEXT,
    verb_name TEXT,
    object_id TEXT,
    object_name TEXT,
    payload TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_sql_lrs_timestamp ON xapi_statements (timestamp);
  CREATE INDEX IF NOT EXISTS idx_sql_lrs_actor ON xapi_statements (actor_name);

  CREATE TABLE IF NOT EXISTS xapi_states (
    activity_id TEXT,
    state_id TEXT,
    etag TEXT,
    data TEXT,
    updated_at TEXT,
    PRIMARY KEY (activity_id, state_id)
  );
`;

/** Matches one actor identifier exactly (no wildcards): column values or the actor fields inside the stored payload. */
const ACTOR_MATCH_SQL = `(
  LOWER(actor_mbox) = LOWER(?)
  OR LOWER(actor_name) = LOWER(?)
  OR (CASE WHEN json_valid(payload) THEN LOWER(json_extract(payload, '$.actor.mbox')) END) = LOWER(?)
  OR (CASE WHEN json_valid(payload) THEN LOWER(json_extract(payload, '$.actor.name')) END) = LOWER(?)
  OR (CASE WHEN json_valid(payload) THEN LOWER(json_extract(payload, '$.actor.account.name')) END) = LOWER(?)
)`;
const actorMatchParams = (actor: string) => [actor, actor, actor, actor, actor];
const matchAny = (actors: string[]) => ({
  sql: actors.map(() => ACTOR_MATCH_SQL).join(' OR '),
  params: actors.flatMap(actorMatchParams),
});

export const MAX_ACTOR_LENGTH = 256;

/** Exact-match identifiers only: non-empty, bounded, no control characters. */
export function normalizeActorIdentifier(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const v = input.trim();
  if (!v || v.length > MAX_ACTOR_LENGTH || /[\u0000-\u001f\u007f]/.test(v)) return null;
  return v;
}

export class SqlLrsStore {
  readonly db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
    this.db.exec(SCHEMA_SQL);
  }

  getStatements(filter: { limit?: number; actor?: string; scope: LrsScope }): any[] {
    try {
      let query = `SELECT payload FROM xapi_statements`;
      const params: any[] = [];
      if (filter.scope.kind === 'own') {
        if (filter.scope.actors.length === 0) return [];
        const m = matchAny(filter.scope.actors);
        query += ` WHERE ${m.sql}`;
        params.push(...m.params);
      } else if (filter.actor) {
        // Researcher search box: plain case-insensitive substring (instr), not a LIKE pattern.
        query += ` WHERE instr(LOWER(actor_name), LOWER(?)) > 0`;
        params.push(filter.actor);
      }
      query += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(filter.limit || 100);
      const rows = this.db.prepare(query).all(...params) as { payload: string }[];
      return rows.map(r => { try { return JSON.parse(r.payload); } catch { return null; } }).filter(Boolean);
    } catch (err) {
      console.error('[SQL LRS] Failed to query SQLite:', err);
      return [];
    }
  }

  count(): number {
    try {
      const row = this.db.prepare(`SELECT COUNT(*) as cnt FROM xapi_statements`).get() as { cnt: number };
      return row?.cnt || 0;
    } catch (err) {
      console.error('[SQL LRS] Failed to get count:', err);
      return 0;
    }
  }

  /** Deletes statements whose actor equals one of `actors` exactly. Parameterized; `%` and `_` are ordinary characters. */
  deleteByActors(actors: string[]): number {
    const clean = actors.map(normalizeActorIdentifier).filter((a): a is string => !!a);
    if (clean.length === 0) return 0;
    const m = matchAny(clean);
    const result = this.db.prepare(`DELETE FROM xapi_statements WHERE ${m.sql}`).run(...m.params);
    return Number(result.changes || 0);
  }

  getState(activityId: string, stateId: string): { data: any; etag: string } | null {
    try {
      const row = this.db.prepare(`SELECT data, etag FROM xapi_states WHERE activity_id = ? AND state_id = ?`).get(activityId, stateId) as { data: string; etag: string } | undefined;
      if (!row) return null;
      return { data: JSON.parse(row.data), etag: row.etag };
    } catch (err) {
      console.error('[xAPI State] Error getting state:', err);
      return null;
    }
  }

  putState(activityId: string, stateId: string, data: any, ifMatch?: string | null): { etag: string; conflict?: boolean } {
    try {
      const existing = this.db.prepare(`SELECT etag FROM xapi_states WHERE activity_id = ? AND state_id = ?`).get(activityId, stateId) as { etag: string } | undefined;
      if (ifMatch && existing && existing.etag !== ifMatch) {
        return { etag: existing.etag, conflict: true };
      }
      const newEtag = `"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
      this.db.prepare(`
        INSERT OR REPLACE INTO xapi_states (activity_id, state_id, etag, data, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(activityId, stateId, newEtag, JSON.stringify(data), new Date().toISOString());
      return { etag: newEtag };
    } catch (err) {
      console.error('[xAPI State] Error putting state:', err);
      return { etag: `"${Date.now()}"` };
    }
  }

  queryConforming(params: { registration?: string; verb?: string; limit?: number; since?: string; scope: LrsScope }): any[] {
    try {
      let sql = `SELECT payload FROM xapi_statements`;
      const where: string[] = [];
      const args: any[] = [];
      if (params.scope.kind === 'own') {
        if (params.scope.actors.length === 0) return [];
        const m = matchAny(params.scope.actors);
        where.push(`(${m.sql})`);
        args.push(...m.params);
      }
      if (params.verb) { where.push(`verb_id = ?`); args.push(params.verb); }
      if (params.since) { where.push(`timestamp >= ?`); args.push(params.since); }
      if (where.length > 0) sql += ` WHERE ` + where.join(' AND ');
      sql += ` ORDER BY timestamp ASC LIMIT ?`;
      args.push(params.limit || 500);

      const rows = this.db.prepare(sql).all(...args) as { payload: string }[];
      const list: any[] = [];
      for (const r of rows) {
        try {
          const stmt = JSON.parse(r.payload);
          if (params.registration) {
            const reg = stmt.context?.registration || stmt.context?.extensions?.sessionUuid;
            if (reg && reg.toLowerCase() !== params.registration.toLowerCase()) continue;
          }
          list.push(stmt);
        } catch {}
      }
      return list;
    } catch (err) {
      console.error('[xAPI Statements] Error querying statements:', err);
      return [];
    }
  }
}

// Opened on first use (not at import) so importing this module never touches local_engine/sql_lrs.sqlite.
let sqlLrsInstance: SqlLrsStore | null = null;
const sqlLrs = (): SqlLrsStore => (sqlLrsInstance ??= new SqlLrsStore(new DatabaseSync(sqlLrsPath)));

/** Test seam: swap the store the module-level functions use (e.g. an in-memory database). Returns the previous one. */
export function useSqlLrsStore(store: SqlLrsStore | null): SqlLrsStore | null {
  const previous = sqlLrsInstance;
  sqlLrsInstance = store;
  return previous;
}

export function insertSqlLrsStatement(_stmt: any): void {
  // S3A WASM Snapshot is the single source of truth.
  // SQLite statement writing is disabled to consolidate storage on S3A.
}

/**
 * `scope` comes from the caller's server-side session (see server/lrsAccess.ts), never from the query string.
 * `actor` is an optional researcher-only substring filter.
 */
export function getSqlLrsStatements(filter: { limit?: number; actor?: string; scope: LrsScope }): any[] {
  return sqlLrs().getStatements(filter);
}

export function getSqlLrsCount(): number {
  return sqlLrs().count();
}

/**
 * Deletes every statement whose actor is exactly one of `actors` (SQLite, and DuckDB when enabled).
 * Exact, case-insensitive equality with bound parameters: there is no LIKE pattern, so `%` or `_` in an
 * identifier is just a character and cannot widen the match. Who may call this is decided by the route.
 */
export function deleteSqlLrsStatementsByActor(actors: string | string[]): number {
  const list = (Array.isArray(actors) ? actors : [actors])
    .map(normalizeActorIdentifier)
    .filter((a): a is string => !!a);
  if (list.length === 0) return 0;
  try {
    const removed = sqlLrs().deleteByActors(list);
    deleteDuckDbByActors(list);
    console.log(`[S3A LRS] Deleted ${removed} statement(s) for ${list.length} actor identifier(s)`);
    return removed;
  } catch (err) {
    console.error('[SQL LRS] Failed to delete statements by actor:', err);
    return 0;
  }
}

export function getXapiState(activityId: string, stateId: string): { data: any; etag: string } | null {
  return sqlLrs().getState(activityId, stateId);
}

export function putXapiState(activityId: string, stateId: string, data: any, ifMatch?: string | null): { etag: string; conflict?: boolean } {
  return sqlLrs().putState(activityId, stateId, data, ifMatch);
}

export function queryConformingStatements(params: {
  registration?: string;
  verb?: string;
  limit?: number;
  since?: string;
  scope: LrsScope;
}): any[] {
  return sqlLrs().queryConforming(params);
}

// 2. DuckDB Optional Read-Only Analytics Export (Off by default)
export const ENABLE_DUCKDB_ANALYTICS = process.env.ENABLE_DUCKDB_ANALYTICS === 'true';
const duckDbPath = path.join(localEngineDir, 'tensor_lrs.duckdb');
let duckDbInstance: any = null;

if (ENABLE_DUCKDB_ANALYTICS) {
  try {
    duckDbInstance = new duckdb.Database(duckDbPath);
    console.log('[DuckDB Analytics] Read-only analytics engine enabled at:', duckDbPath);
  } catch (err: any) {
    console.warn('[DuckDB Analytics] Failed to initialize analytics engine:', err.message);
  }
}

/** Parameterized, exact-match delete for the optional DuckDB audit table. */
export function buildDuckDbDelete(actors: string[]): { sql: string; params: string[] } {
  const one = `(LOWER(agent_name) = LOWER(?)
    OR LOWER(json_extract_string(xapi_payload, '$.actor.mbox')) = LOWER(?)
    OR LOWER(json_extract_string(xapi_payload, '$.actor.name')) = LOWER(?)
    OR LOWER(json_extract_string(xapi_payload, '$.actor.account.name')) = LOWER(?))`;
  return {
    sql: `DELETE FROM xapi_audit_trail WHERE ${actors.map(() => one).join(' OR ')}`,
    params: actors.flatMap(a => [a, a, a, a]),
  };
}

function deleteDuckDbByActors(actors: string[]): void {
  if (!duckDbInstance || actors.length === 0) return;
  const { sql, params } = buildDuckDbDelete(actors);
  try {
    duckDbInstance.run(sql, ...params, (err: any) => {
      if (err) console.warn('[DuckDB Analytics] Delete by actor failed:', err.message);
    });
  } catch (err: any) {
    console.warn('[DuckDB Analytics] Delete by actor failed:', err?.message);
  }
}

export function insertDuckDbStatement(_stmt: any): Promise<void> {
  // S3A WASM Snapshot is the single source of truth.
  // DuckDB writes are removed to consolidate storage on S3A.
  return Promise.resolve();
}

export function getDuckDbStatements(filter: {
  sessionUuid?: string;
  agent?: string;
  limit?: number;
  /** From the caller's server-side session. 'own' (participants) must name a sessionUuid; 'all' is researcher/committee/admin. */
  scope: LrsScope;
}): Promise<any[]> {
  if (!ENABLE_DUCKDB_ANALYTICS || !duckDbInstance) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    try {
      const isResearcher = filter.scope.kind === 'all';
      let sql = `SELECT xapi_payload FROM xapi_audit_trail`;
      const params: any[] = [];
      const whereClauses: string[] = [];

      if (!isResearcher) {
        if (filter.sessionUuid) {
          whereClauses.push(`session_uuid = ?`);
          params.push(filter.sessionUuid);
        } else {
          return resolve([]);
        }
      } else {
        if (filter.sessionUuid) {
          whereClauses.push(`session_uuid = ?`);
          params.push(filter.sessionUuid);
        }
        if (filter.agent) {
          // Plain substring match: strpos, not LIKE, so `%` and `_` are ordinary characters.
          whereClauses.push(`strpos(LOWER(agent_name), LOWER(?)) > 0`);
          params.push(filter.agent);
        }
      }

      if (whereClauses.length > 0) {
        sql += ` WHERE ` + whereClauses.join(' AND ');
      }

      sql += ` ORDER BY timestamp DESC LIMIT ?`;
      params.push(filter.limit || 100);

      const prep = duckDbInstance.prepare(sql);
      prep.all(...params, (err: any, rows: any[]) => {
        if (err) {
          prep.finalize(() => resolve([]));
          return;
        }
        const statements = (rows || []).map(r => {
          try {
            return typeof r.xapi_payload === 'string' ? JSON.parse(r.xapi_payload) : r.xapi_payload;
          } catch {
            return null;
          }
        }).filter(Boolean);
        prep.finalize(() => resolve(statements));
      });
    } catch (e) {
      resolve([]);
    }
  });
}

export function getDuckDbStats(): Promise<{ totalStatements: number; activeSessionsCount: number }> {
  if (!ENABLE_DUCKDB_ANALYTICS || !duckDbInstance) {
    return Promise.resolve({ totalStatements: 0, activeSessionsCount: 0 });
  }

  return new Promise((resolve) => {
    duckDbInstance.all(
      `SELECT COUNT(*) as total, COUNT(DISTINCT session_uuid) as sessions FROM xapi_audit_trail`,
      (err: any, rows: any[]) => {
        if (err || !rows || rows.length === 0) {
          return resolve({ totalStatements: 0, activeSessionsCount: 0 });
        }
        resolve({
          totalStatements: Number(rows[0].total) || 0,
          activeSessionsCount: Number(rows[0].sessions) || 0
        });
      }
    );
  });
}

/**
 * Optional read-only analytics export
 */
export async function exportDuckDbAnalytics(): Promise<{ enabled: boolean; count: number; statements: any[] }> {
  if (!ENABLE_DUCKDB_ANALYTICS) {
    return { enabled: false, count: 0, statements: [] };
  }
  const statements = await getDuckDbStatements({ scope: { kind: 'all' }, limit: 1000 });
  return { enabled: true, count: statements.length, statements };
}
