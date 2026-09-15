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
`);

export function insertSqlLrsStatement(stmt: any): void {
  try {
    const id = stmt.id || `stmt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const timestamp = stmt.timestamp || new Date().toISOString();
    const stored = stmt.stored || new Date().toISOString();
    const actorName = stmt.actor?.name || 'Scholar Explorer User';
    const actorMbox = stmt.actor?.mbox || stmt.actor?.account?.name || '';
    const verbId = stmt.verb?.id || 'http://adlnet.gov/expapi/verbs/interacted';
    const verbName = stmt.verb?.display?.['en-US'] || 'interacted';
    const objectId = stmt.object?.id || 'urn:scholarexplorer:action';
    const objectName = stmt.object?.definition?.name?.['en-US'] || stmt.object?.id || 'Scholarly Action';
    const payload = JSON.stringify(stmt);

    const insertStmt = sqliteDb.prepare(`
      INSERT OR REPLACE INTO xapi_statements 
      (id, timestamp, stored, actor_name, actor_mbox, verb_id, verb_name, object_id, object_name, payload)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertStmt.run(id, timestamp, stored, actorName, actorMbox, verbId, verbName, objectId, objectName, payload);
  } catch (err) {
    console.error('[SQL LRS] Failed to write statement to SQLite:', err);
  }
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

// 2. DuckDB Database for AI & AI Agent xAPI Profile Documentation (Columnar Vertical LRS)
const duckDbPath = path.join(localEngineDir, 'tensor_lrs.duckdb');
const duckDbInstance = new duckdb.Database(duckDbPath);

// Initialize DuckDB Audit Trail Table
duckDbInstance.run(`
  CREATE TABLE IF NOT EXISTS xapi_audit_trail (
    statement_id VARCHAR PRIMARY KEY,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    session_uuid VARCHAR,
    agent_name VARCHAR,
    verb_id VARCHAR,
    verb_name VARCHAR,
    object_id VARCHAR,
    object_name VARCHAR,
    xapi_payload JSON
  );
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON xapi_audit_trail (timestamp);
  CREATE INDEX IF NOT EXISTS idx_audit_session ON xapi_audit_trail (session_uuid);
`, (err) => {
  if (err) {
    console.warn('[DuckDB Vertical LRS] Notice on schema setup:', err.message);
  } else {
    console.log('[DuckDB Vertical LRS] xapi_audit_trail ready at:', duckDbPath);
  }
});

export function insertDuckDbStatement(stmt: any): Promise<void> {
  return new Promise((resolve) => {
    try {
      const id = stmt.id || `agent-stmt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const timestamp = stmt.timestamp ? new Date(stmt.timestamp).toISOString() : new Date().toISOString();
      const sessionUuid = stmt.context?.sessionUuid || stmt.context?.extensions?.sessionUuid || 'default-session';
      const agentName = stmt.actor?.name || 'AI Source Scout';
      const verbId = stmt.verb?.id || '/ontologies/agent_traceability.owl#executed';
      const verbName = stmt.verb?.display?.['en-US'] || 'executed';
      const objectId = stmt.object?.id || 'urn:scholarexplorer:agent-activity';
      const objectName = stmt.object?.definition?.name?.['en-US'] || stmt.object?.id || 'Agent Task';
      const payloadStr = JSON.stringify(stmt);

      const prep = duckDbInstance.prepare(
        `INSERT INTO xapi_audit_trail 
         (statement_id, timestamp, session_uuid, agent_name, verb_id, verb_name, object_id, object_name, xapi_payload)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (statement_id) DO UPDATE SET xapi_payload = EXCLUDED.xapi_payload`
      );

      prep.run(id, timestamp, sessionUuid, agentName, verbId, verbName, objectId, objectName, payloadStr, (err) => {
        if (err) {
          console.error('[DuckDB Vertical LRS] Insert error:', err);
        }
        prep.finalize(() => resolve());
      });
    } catch (e) {
      console.error('[DuckDB Vertical LRS] Exception inserting statement:', e);
      resolve();
    }
  });
}

export function getDuckDbStatements(filter: {
  sessionUuid?: string;
  agent?: string;
  limit?: number;
  role?: string;
  userName?: string;
}): Promise<any[]> {
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
          // In participant / non-researcher mode without session UUID, return empty
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
          console.error('[DuckDB Vertical LRS] Query error:', err);
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
      console.error('[DuckDB Vertical LRS] Query exception:', e);
      resolve([]);
    }
  });
}

export function getDuckDbStats(): Promise<{ totalStatements: number; activeSessionsCount: number }> {
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
