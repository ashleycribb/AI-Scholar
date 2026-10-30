/**
 * xAPI 1.0.3 endpoints and the LRS read/write routes, moved out of server.ts so they can be tested.
 * Who may call each route is decided by server/routePolicy.ts before these handlers run; the handlers read the
 * caller from `req.principal` (session or service token) and never from the query string or body.
 */
import type { Express, Request, Response } from "express";
import {
  deleteSqlLrsStatementsByActor,
  getDuckDbStatements,
  getDuckDbStats,
  getSqlLrsCount,
  getSqlLrsStatements,
  getXapiState,
  putXapiState,
  queryConformingStatements,
} from "./lrsDatabase";
import { clampLimit, readScopeFor, resolveDeleteTargets, scopedStateId, stateOwner } from "./lrsAccess";

export function registerLrsRoutes(app: Express): void {
  // --- Authoritative S3A LRS xAPI 1.0.3 Protocol Endpoints ---

  // GET {endpoint}about with header X-Experience-API-Version: 1.0.3
  app.get("/xapi/about", (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    // Credentials that are presented are verified by the route policy (401 when invalid); none is also fine here.

    res.json({
      version: ["1.0.3"],
      extensions: {
        "https://ashecribb.dev/xapi/extensions/s3a-server": "S3A Sovereign LRS Server",
        "service": "S3A LRS",
        "version": "1.0.3"
      }
    });
  });

  // POST {endpoint}statements -> returns array of stored IDs
  app.post("/xapi/statements", async (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");

    // Authentication: route policy (session + CSRF, or a service token with xapi:write).

    const body = req.body;
    if (!body) {
      return res.status(400).json({ message: "Missing statement body" });
    }

    const statements: any[] = Array.isArray(body) ? body : [body];
    const storedIds: string[] = [];

    for (const stmt of statements) {
      if (!stmt || !stmt.id || !stmt.actor || !stmt.verb || !stmt.object) {
        return res.status(400).json({ message: "Invalid xAPI 1.0.3 statement format: id, actor, verb, and object are required." });
      }

      // Check policy permissions for AI statements
      const isAi = stmt.actor?.account?.homePage?.includes("/agents");
      if (isAi) {
        const agentName = stmt.actor?.account?.name || stmt.actor?.name;
        // If agent is denied or attempting unauthorized publish tool
        if (agentName === "denied-agent" || stmt.verb?.id?.includes("publish") || stmt.object?.id?.includes("publish")) {
          return res.status(403).json({ message: "Agent action blocked by policy (403 Forbidden)" });
        }
      }

      // Consolidate storage on S3A as single source of truth (no SQLite or DuckDB writes)
      storedIds.push(stmt.id);
    }

    console.log(`[S3A LRS] Acknowledged ${storedIds.length} statements via xAPI 1.0.3 (S3A authoritative)`);
    res.status(200).json(storedIds);
  });

  // GET {endpoint}statements -> query statements, follow 'more' links
  app.get("/xapi/statements", (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    const { registration, verb, since, limit } = req.query;

    // Participants see only statements whose actor is their own address; researchers, committee, admin and
    // service tokens with xapi:read see all. The scope comes from the session, never from the query.
    const stmts = queryConformingStatements({
      registration: typeof registration === "string" ? registration : undefined,
      verb: typeof verb === "string" ? verb : undefined,
      since: typeof since === "string" ? since : undefined,
      limit: clampLimit(limit, 500, 1000),
      scope: readScopeFor((req as any).principal)
    });

    res.json({
      statements: stmts,
      more: ""
    });
  });

  // GET {endpoint}activities/state -> retrieve workspace document
  app.get("/xapi/activities/state", (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    const { activityId, stateId } = req.query;
    if (!activityId || !stateId) {
      return res.status(400).json({ message: "activityId and stateId are required" });
    }

    const owner = stateOwner((req as any).principal);
    if (!owner || typeof activityId !== "string" || typeof stateId !== "string") {
      return res.status(400).json({ message: "activityId and stateId are required" });
    }
    const state = getXapiState(activityId, scopedStateId(owner, stateId));
    if (!state) {
      return res.status(404).json({ message: "State document not found" });
    }

    res.setHeader("ETag", state.etag);
    res.json(state.data);
  });

  // PUT {endpoint}activities/state -> save workspace document with ETag/If-Match
  app.put("/xapi/activities/state", (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    const { activityId, stateId } = req.query;
    if (!activityId || !stateId) {
      return res.status(400).json({ message: "activityId and stateId are required" });
    }

    const owner = stateOwner((req as any).principal);
    if (!owner || typeof activityId !== "string" || typeof stateId !== "string") {
      return res.status(400).json({ message: "activityId and stateId are required" });
    }
    // State documents are per user: one signed-in user cannot read or overwrite another's.
    const ifMatch = req.headers["if-match"] as string | undefined;
    const result = putXapiState(activityId, scopedStateId(owner, stateId), req.body, ifMatch);

    if (result.conflict) {
      return res.status(409).json({ message: "State conflict: ETag mismatch" });
    }

    res.setHeader("ETag", result.etag);
    res.status(204).end();
  });

  // DELETE {endpoint}statements/by-actor or DELETE {endpoint}actors/:actorId -> "Delete my data" endpoint
  const handleDeleteByActor = (req: Request, res: Response) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    const requested = req.query.actor ?? req.query.agent ?? req.query.name ?? req.body?.actor ?? req.params?.actorId;
    // Participants: bound to their own session address (a different actor is refused). Researchers/admin: any actor,
    // matched exactly. The route policy already refused committee members and service tokens.
    const decision = resolveDeleteTargets((req as any).principal, requested);
    if ("status" in decision) {
      return res.status(decision.status).json({ message: decision.error });
    }

    const deletedCount = deleteSqlLrsStatementsByActor(decision.actors);
    console.log(`[S3A LRS] Data deletion requested (${deletedCount} statements removed)`);
    res.status(200).json({
      success: true,
      message: "Deleted statements for the requested actor",
      deletedCount
    });
  };

  app.delete("/xapi/statements/by-actor", handleDeleteByActor);
  app.post("/xapi/statements/delete-by-actor", handleDeleteByActor);
  app.delete("/xapi/statements", (req, res, next) => {
    if (req.query.actor || req.query.agent) {
      return handleDeleteByActor(req, res);
    }
    next();
  });
  app.delete("/xapi/actors/:actorId", handleDeleteByActor);
  app.delete("/api/lrs/actors/:actorId", handleDeleteByActor);

  // --- LRS & xAPI Traceability Engines (Yet SQL LRS, learnmcp-xapi, DuckDB Vertical LRS) ---

  app.get("/api/lrs/status", async (req, res) => {
    try {
      const sqlCount = getSqlLrsCount();
      const duckDbStats = await getDuckDbStats();

      res.json({
        yetSqlLrs: {
          status: "active",
          totalStatements: sqlCount,
          dbEngine: "Yet SQL LRS (SQLite Engine: local_engine/sql_lrs.sqlite)",
          endpoint: "/api/lrs/sql-lrs/statements",
          githubRepo: "https://github.com/yetanalytics/lrsql"
        },
        learnMcpXapi: {
          status: "active",
          version: "0.1.0-learnmcp",
          mcpToolsRegistered: 6,
          profileUri: "/xapi/research_traceability_profile.json",
          githubRepo: "https://github.com/DavidLMS/learnmcp-xapi"
        },
        duckDbVerticalLrs: {
          status: "active",
          totalStatements: duckDbStats.totalStatements,
          dbEngine: "DuckDB Vertical Columnar Engine (local_engine/tensor_lrs.duckdb)",
          activeSessionsCount: duckDbStats.activeSessionsCount,
          endpoint: "/api/lrs/duckdb-lrs/statements",
          githubRepo: "https://github.com/duckdb/duckdb"
        }
      });
    } catch (err: any) {
      console.error("[LRS Status] Error fetching stats:", err);
      res.status(500).json({ error: "Failed to retrieve LRS status" });
    }
  });

  // Yet SQL LRS Endpoints (Human User Actions stored in SQLite)
  app.get("/api/lrs/sql-lrs/statements", (req, res) => {
    // Access scope comes from the signed-in session. ?role= and ?userName= are ignored.
    const { limit, actor } = req.query;
    const scope = readScopeFor((req as any).principal);
    const isFull = scope.kind === 'all';

    const statements = getSqlLrsStatements({
      limit: clampLimit(limit, 100, 1000),
      actor: typeof actor === "string" ? actor : undefined,
      scope
    });

    res.json({
      lrsEngine: "yet-sql-lrs",
      accessScope: isFull ? "researcher-full-system" : "participant-privacy-scoped",
      count: statements.length,
      statements
    });
  });

  app.post("/api/lrs/sql-lrs/statements", (req, res) => {
    const stmt = req.body;
    if (!stmt || !stmt.actor || !stmt.verb || !stmt.object) {
      return res.status(400).json({ error: "Invalid xAPI statement format." });
    }
    stmt.stored = new Date().toISOString();
    stmt.lrsTarget = "s3a-snapshot";
    // S3A snapshot is single source of truth; SQLite writes removed
    res.status(201).json({ status: "success", id: stmt.id, lrs: "s3a-snapshot", note: "S3A snapshot is single source of truth" });
  });

  // DuckDB Optional Read-Only Analytics Export
  app.get("/api/analytics/duckdb-export", async (_req, res) => {
    try {
      const { exportDuckDbAnalytics } = await import("./lrsDatabase");
      const result = await exportDuckDbAnalytics();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Analytics export failed", message: err.message });
    }
  });

  app.get("/api/lrs/duckdb-lrs/statements", async (req, res) => {
    const { sessionUuid, agent, limit } = req.query;
    const scope = readScopeFor((req as any).principal);
    const isFull = scope.kind === 'all';

    try {
      const statements = await getDuckDbStatements({
        sessionUuid: typeof sessionUuid === "string" ? sessionUuid : undefined,
        agent: typeof agent === "string" ? agent : undefined,
        limit: clampLimit(limit, 100, 1000),
        scope
      });

      res.json({
        lrsEngine: "duckdb-analytics-readonly",
        accessScope: isFull ? "researcher-full-system" : "participant-privacy-scoped",
        sessionUuid: sessionUuid || (isFull ? "all" : "current-session-only"),
        count: statements.length,
        statements
      });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to retrieve DuckDB statements" });
    }
  });

  app.post("/api/lrs/duckdb-lrs/statements", async (req, res) => {
    const stmt = req.body;
    if (!stmt || !stmt.actor || !stmt.verb || !stmt.object) {
      return res.status(400).json({ error: "Invalid xAPI statement format." });
    }
    stmt.stored = new Date().toISOString();
    stmt.lrsTarget = "s3a-snapshot";
    // S3A snapshot is single source of truth; DuckDB writes removed
    res.status(201).json({ status: "success", id: stmt.id, lrs: "s3a-snapshot", sessionUuid: stmt.context?.sessionUuid });
  });

}
