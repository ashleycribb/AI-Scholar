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
const sqliteDb = new DatabaseSync(sqlLrsPath);

// Initialize Yet SQL LRS Schema
sqliteDb.exec(`
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
`);

export function insertSqlLrsStatement(_stmt: any): void {
  // S3A WASM Snapshot is the single source of truth.
  // SQLite statement writing is disabled to consolidate storage on S3A.
}

export function getSqlLrsStatements(filter: {
  limit?: number;
  actor?: string;
  role?: string;
  userName?: string;
}): any[] {
  try {
    const isResearcher = filter.role === 'researcher';
    let query = `SELECT payload FROM xapi_statements`;
    const params: any[] = [];

    if (!isResearcher) {
      const targetUser = filter.userName || filter.actor;
      if (targetUser) {
        query += ` WHERE LOWER(actor_name) = LOWER(?) OR LOWER(actor_mbox) = LOWER(?)`;
        params.push(targetUser, targetUser);
      } else {
        query += ` WHERE LOWER(actor_name) LIKE '%scholar explorer user%'`;
      }
    } else if (filter.actor) {
      query += ` WHERE LOWER(actor_name) LIKE LOWER(?)`;
      params.push(`%${filter.actor}%`);
    }

    query += ` ORDER BY timestamp DESC LIMIT ?`;
    params.push(filter.limit || 100);

    const rows = sqliteDb.prepare(query).all(...params) as { payload: string }[];
    return rows.map(r => {
      try {
        return JSON.parse(r.payload);
      } catch {
        return null;
      }
    }).filter(Boolean);
  } catch (err) {
    console.error('[SQL LRS] Failed to query SQLite:', err);
    return [];
  }
}

export function getSqlLrsCount(): number {
  try {
    const row = sqliteDb.prepare(`SELECT COUNT(*) as cnt FROM xapi_statements`).get() as { cnt: number };
    return row?.cnt || 0;
  } catch (err) {
    console.error('[SQL LRS] Failed to get count:', err);
    return 0;
  }
}

export function deleteSqlLrsStatementsByActor(actorIdentifier: string): number {
  try {
    if (!actorIdentifier || !actorIdentifier.trim()) return 0;
    const actor = actorIdentifier.trim();
    const query = `
      DELETE FROM xapi_statements 
      WHERE actor_mbox = ? 
         OR actor_name = ? 
         OR payload LIKE ? 
         OR payload LIKE ?
    `;
    const pattern1 = `%"name":"${actor}"%`;
    const pattern2 = `%"name": "${actor}"%`;
    const result = sqliteDb.prepare(query).run(actor, actor, pattern1, pattern2);

    try {
      duckDbInstance.run(`DELETE FROM xapi_audit_trail WHERE xapi_payload LIKE '%${actor.replace(/'/g, "''")}%'`, () => {});
    } catch {}

    console.log(`[S3A LRS] Deleted statements for actor: ${actor}`);
    return Number(result.changes || 0);
  } catch (err) {
    console.error('[SQL LRS] Failed to delete statements by actor:', err);
    return 0;
  }
}

export function getXapiState(activityId: string, stateId: string): { data: any; etag: string } | null {
  try {
    const row = sqliteDb.prepare(`SELECT data, etag FROM xapi_states WHERE activity_id = ? AND state_id = ?`).get(activityId, stateId) as { data: string; etag: string } | undefined;
    if (!row) return null;
    return {
      data: JSON.parse(row.data),
      etag: row.etag
    };
  } catch (err) {
    console.error('[xAPI State] Error getting state:', err);
    return null;
  }
}

export function putXapiState(activityId: string, stateId: string, data: any, ifMatch?: string | null): { etag: string; conflict?: boolean } {
  try {
    const existing = sqliteDb.prepare(`SELECT etag FROM xapi_states WHERE activity_id = ? AND state_id = ?`).get(activityId, stateId) as { etag: string } | undefined;
    if (ifMatch && existing && existing.etag !== ifMatch) {
      return { etag: existing.etag, conflict: true };
    }
    const newEtag = `"${Date.now()}-${Math.random().toString(36).slice(2, 8)}"`;
    const dataStr = JSON.stringify(data);
    const updatedAt = new Date().toISOString();
    sqliteDb.prepare(`
      INSERT OR REPLACE INTO xapi_states (activity_id, state_id, etag, data, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(activityId, stateId, newEtag, dataStr, updatedAt);
    return { etag: newEtag };
  } catch (err) {
    console.error('[xAPI State] Error putting state:', err);
    const fallbackEtag = `"${Date.now()}"`;
    return { etag: fallbackEtag };
  }
}

export function queryConformingStatements(params: {
  registration?: string;
  verb?: string;
  limit?: number;
  since?: string;
}): any[] {
  try {
    let sql = `SELECT payload FROM xapi_statements`;
    const where: string[] = [];
    const args: any[] = [];

    if (params.verb) {
      where.push(`verb_id = ?`);
      args.push(params.verb);
    }
    if (params.since) {
      where.push(`timestamp >= ?`);
      args.push(params.since);
    }

    if (where.length > 0) {
      sql += ` WHERE ` + where.join(' AND ');
    }
    sql += ` ORDER BY timestamp ASC LIMIT ?`;
    args.push(params.limit || 500);

    const rows = sqliteDb.prepare(sql).all(...args) as { payload: string }[];
    const list: any[] = [];
    for (const r of rows) {
      try {
        const stmt = JSON.parse(r.payload);
        if (params.registration) {
          const reg = stmt.context?.registration || stmt.context?.extensions?.sessionUuid;
          if (reg && reg.toLowerCase() !== params.registration.toLowerCase()) {
            continue;
          }
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

export function insertDuckDbStatement(_stmt: any): Promise<void> {
  // S3A WASM Snapshot is the single source of truth.
  // DuckDB writes are removed to consolidate storage on S3A.
  return Promise.resolve();
}

export function getDuckDbStatements(filter: {
  sessionUuid?: string;
  agent?: string;
  limit?: number;
  role?: string;
  userName?: string;
}): Promise<any[]> {
  if (!ENABLE_DUCKDB_ANALYTICS || !duckDbInstance) {
    return Promise.resolve([]);
  }

  return new Promise((resolve) => {
    try {
      const isResearcher = filter.role === 'researcher';
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
          whereClauses.push(`LOWER(agent_name) LIKE LOWER(?)`);
          params.push(`%${filter.agent}%`);
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
  const statements = await getDuckDbStatements({ role: 'researcher', limit: 1000 });
  return { enabled: true, count: statements.length, statements };
}
