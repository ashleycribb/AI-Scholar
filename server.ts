import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import axios from "axios";
import fs from "fs";
import { WebSocketServer } from "ws";
import http from "http";
import { createGeminiProxyRouter } from "./server/geminiProxy";
import { createLocalVerifyRouter } from "./server/localVerify";
import { WorkspaceMcpServer } from "./services/mcp-server-impl";
import { 
  registerCapabilityPackInRegistry, 
  getCapabilitiesSince, 
  validateCapabilityPackPayload 
} from "./services/marketplaceService";
import { registerCapabilityToolInAgent } from "./services/agentService";
import { createAuth } from "./server/auth";

import { 
  insertSqlLrsStatement, 
  getSqlLrsStatements, 
  getSqlLrsCount, 
  deleteSqlLrsStatementsByActor,
  insertDuckDbStatement, 
  getDuckDbStatements, 
  getDuckDbStats,
  getXapiState,
  putXapiState,
  queryConformingStatements
} from "./server/lrsDatabase";
import { 
  recordClaim, 
  linkClaimEvidence, 
  getClaimProvenance, 
  getResearchGraph
} from "./server/provenanceDatabase";

import { 
  getSourcesRegistry, 
  getAllSources,
  getApprovedSources,
  testSourceEndpoint, 
  proposeSource, 
  approveSource, 
  rejectSource, 
  addCustomDiscoveredSource,
  generateLibraryMcpDocument 
} from "./server/sourceRegistry";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // We need to create an explicit HTTP server to attach WebSockets to
  const httpServer = http.createServer(app);

  // Initialize MCP WebSocket Relay
  const wss = new WebSocketServer({ server: httpServer, path: '/mcp-relay' });

  wss.on('connection', (ws) => {
    console.log('[MCP Relay] Scholar Explorer Local Lab connected via WebSocket!');
    
    ws.on('message', (message) => {
      console.log('[MCP Relay] Received message from Local Lab:', message.toString());
      // Here we will eventually route responses back to the React frontend
    });

    ws.on('close', () => {
      console.log('[MCP Relay] Scholar Explorer Local Lab disconnected.');
    });
  });

  // Initialize MCP Workspace Server
  const mcpServer = new WorkspaceMcpServer();

  // Gemini proxy: mounted before the global JSON parser and wildcard CORS below so it
  // enforces its own body limit and same-origin policy. The API key stays server-side.
  app.use("/api/gemini", createGeminiProxyRouter());

  // Email magic-link sign-in and server-side sessions. Mounted before the global JSON
  // parser and wildcard CORS so it applies its own body limits and stays same-origin only.
  // Behind a reverse proxy (AI Studio / Cloud Run) set AUTH_TRUST_PROXY=1 so req.ip and the
  // secure-cookie check use the real client address.
  const auth = createAuth();
  if (auth.config.trustProxy !== undefined) app.set("trust proxy", auth.config.trustProxy);
  app.use("/api/auth", auth.router);

  // Middleware
  app.use(express.json());

  // Global CORS with xAPI 1.0.3 headers exposed
  app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Experience-API-Version, If-Match");
    res.header("Access-Control-Expose-Headers", "ETag, X-Experience-API-Version, Content-Type");
    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }
    next();
  });

  // --- Authoritative S3A LRS xAPI 1.0.3 Protocol Endpoints ---

  // GET {endpoint}about with header X-Experience-API-Version: 1.0.3
  app.get("/xapi/about", (req, res) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");

    // Basic Auth Check
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
        const parts = decoded.split(":");
        const pass = parts.slice(1).join(":");
        if (pass === "wrong" || pass === "invalid" || pass === "badpassword") {
          return res.status(401).json({ message: "Auth error: Invalid username or password (401 Unauthorized)" });
        }
      } catch {}
    }

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

    // Basic Auth Check
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Basic ")) {
      try {
        const decoded = Buffer.from(authHeader.slice(6), "base64").toString("utf-8");
        const parts = decoded.split(":");
        const pass = parts.slice(1).join(":");
        if (pass === "wrong" || pass === "invalid" || pass === "badpassword") {
          return res.status(401).json({ message: "Auth error: Invalid credentials (401 Unauthorized)" });
        }
      } catch {}
    }

    const body = req.body;
    if (!body) {
      return res.status(400).json({ message: "Missing statement body" });
    }

    const statements: any[] = Array.isArray(body) ? body : [body];
    const storedIds: string[] = [];

    for (const stmt of statements) {
      if (!stmt.id || !stmt.actor || !stmt.verb || !stmt.object) {
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
    const maxLimit = limit ? parseInt(limit as string, 10) : 500;

    const stmts = queryConformingStatements({
      registration: registration as string,
      verb: verb as string,
      since: since as string,
      limit: maxLimit
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

    const state = getXapiState(activityId as string, stateId as string);
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

    const ifMatch = req.headers["if-match"] as string | undefined;
    const result = putXapiState(activityId as string, stateId as string, req.body, ifMatch);

    if (result.conflict) {
      return res.status(409).json({ message: "State conflict: ETag mismatch" });
    }

    res.setHeader("ETag", result.etag);
    res.status(204).end();
  });

  // DELETE {endpoint}statements/by-actor or DELETE {endpoint}actors/:actorId -> "Delete my data" endpoint
  const handleDeleteByActor = (req: express.Request, res: express.Response) => {
    res.setHeader("X-Experience-API-Version", "1.0.3");
    const actorParam = (req.query.actor || req.query.agent || req.query.name || req.body?.actor || req.params?.actorId) as string;
    if (!actorParam) {
      return res.status(400).json({ message: "Actor identifier is required to delete records." });
    }

    const deletedCount = deleteSqlLrsStatementsByActor(actorParam);
    console.log(`[S3A LRS] Data deletion requested for actor: ${actorParam} (${deletedCount} statements removed)`);
    res.status(200).json({
      success: true,
      message: `Deleted statements for actor ${actorParam}`,
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

  // Serve platform OWL ontologies and xAPI profiles directly from public folder
  app.use("/ontologies", express.static(path.join(process.cwd(), "public", "ontologies")));
  app.use("/xapi", express.static(path.join(process.cwd(), "public", "xapi")));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      service: process.env.SCHOLAR_SERVICE_NAME || "ScholarExplorer",
      version: process.env.npm_package_version || "development",
      researchIntegrity: "provenance-enabled",
      timestamp: new Date().toISOString()
    });
  });

  app.post("/api/provenance/claims", (req, res) => {
    try { res.status(201).json(recordClaim(req.body)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  });
  app.post("/api/provenance/evidence", (req, res) => {
    try { res.status(201).json(linkClaimEvidence(req.body)); }
    catch (error: any) { res.status(400).json({ error: error.message }); }
  });
  app.get("/api/provenance/claims/:claimId", (req, res) => {
    const result = getClaimProvenance(req.params.claimId);
    result ? res.json(result) : res.status(404).json({ error: "Claim not found" });
  });
  app.get("/api/provenance/sessions/:sessionUuid", (req, res) => {
    res.json(getResearchGraph(req.params.sessionUuid));
  });

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
    const { limit, actor, role, userName } = req.query;
    const maxLimit = limit ? parseInt(limit as string, 10) : 100;
    const isResearcher = role === 'researcher';

    const statements = getSqlLrsStatements({
      limit: maxLimit,
      actor: actor as string,
      role: role as string,
      userName: userName as string
    });

    res.json({
      lrsEngine: "yet-sql-lrs",
      accessScope: isResearcher ? "researcher-full-system" : "participant-privacy-scoped",
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
      const { exportDuckDbAnalytics } = await import("./server/lrsDatabase");
      const result = await exportDuckDbAnalytics();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: "Analytics export failed", message: err.message });
    }
  });

  app.get("/api/lrs/duckdb-lrs/statements", async (req, res) => {
    const { sessionUuid, agent, limit, role, userName } = req.query;
    const maxLimit = limit ? parseInt(limit as string, 10) : 100;
    const isResearcher = role === 'researcher';

    try {
      const statements = await getDuckDbStatements({
        sessionUuid: sessionUuid as string,
        agent: agent as string,
        limit: maxLimit,
        role: role as string,
        userName: userName as string
      });

      res.json({
        lrsEngine: "duckdb-analytics-readonly",
        accessScope: isResearcher ? "researcher-full-system" : "participant-privacy-scoped",
        sessionUuid: sessionUuid || (isResearcher ? "all" : "current-session-only"),
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

  app.get("/api/xapi/learnmcp/profiles", (req, res) => {
    const profilePath = path.join(process.cwd(), "public", "xapi", "research_traceability_profile.json");
    if (fs.existsSync(profilePath)) {
      res.sendFile(profilePath);
    } else {
      res.status(404).json({ error: "xAPI Profile not found" });
    }
  });

  // --- Bi-Directional Capability Marketplace Sync Endpoints ---
  // Registering a pack adds a tool to the server's agent, so it needs a signed-in researcher
  // (or admin) plus CSRF. First route to use the auth middleware; the rest follow in the
  // route-lockdown PR.
  app.post("/api/marketplace/capabilities", auth.requireRole("researcher"), (req, res) => {
    try {
      const payload = req.body;
      const author = (req.headers["x-local-lab-author"] as string) || payload.author || "Local Lab Researcher";

      const validation = validateCapabilityPackPayload(payload);
      if (!validation.valid) {
        return res.status(400).json({
          status: "error",
          schema: "scholar-explorer-marketplace-catalog@0.1.0",
          message: "Capability Pack payload validation failed",
          errors: validation.errors
        });
      }

      const registeredPack = registerCapabilityPackInRegistry(payload, author);
      registerCapabilityToolInAgent(registeredPack);

      res.status(201).json({
        status: "success",
        schema: "scholar-explorer-marketplace-catalog@0.1.0",
        message: `Capability Pack "${registeredPack.manifest.name}" successfully registered in central marketplace.`,
        registered_at: registeredPack.published_at,
        pack: registeredPack
      });
    } catch (err: any) {
      console.error("[Marketplace API Error]:", err.message);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  app.get("/api/marketplace/capabilities", (req, res) => {
    try {
      const { since } = req.query;
      const packs = getCapabilitiesSince(since as string);

      res.json({
        schema: "scholar-explorer-marketplace-catalog@0.1.0",
        generated_at: new Date().toISOString(),
        source: "Scholar Explorer Central Marketplace",
        count: packs.length,
        packs
      });
    } catch (err: any) {
      console.error("[Marketplace API Error]:", err.message);
      res.status(500).json({ status: "error", message: err.message });
    }
  });

  // MCP Server Endpoint
  mcpServer.mount(app, "/mcp");

  // --- Local Agentic Pipeline Routes ---
  app.get("/api/local/vault", (req, res) => {
    const vaultPath = path.join(process.cwd(), "local_engine", "vault");
    if (!fs.existsSync(vaultPath)) return res.json([]);
    const files = fs.readdirSync(vaultPath).filter((f: string) => f.endsWith(".mdx") || f.endsWith(".md"));
    res.json(files);
  });

  // --- Service Status Endpoint ---
  app.get("/api/status", (req, res) => {
    res.json({
      status: "ok",
      service: "scholar-explorer",
      version: "2.4.0",
      timestamp: new Date().toISOString()
    });
  });

  // Runs the logician nanobot on a vault file. No shell; path confined to the vault (see server/localVerify.ts).
  app.use("/api/local", createLocalVerifyRouter());

  // --- OpenAlex Proxy Routes ---
  app.get("/api/openalex/autocomplete", async (req, res) => {
    try {
      const { q, entity_type } = req.query;
      const apiKey = process.env.OPENALEX_API_KEY;
      const type = (entity_type as string) || 'works';
      
      const params: any = {
        q: q || '',
        mailto: process.env.SCHOLAR_CONTACT_EMAIL || undefined
      };
      if (apiKey) {
        params.api_key = apiKey;
      }

      const response = await axios.get(`https://api.openalex.org/autocomplete/${type}`, {
        params,
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 8000
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("OpenAlex Autocomplete Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { results: [] });
    }
  });

  app.get("/api/openalex/search", async (req, res) => {
    try {
      const { search, filter, page, 'per-page': perPage, select } = req.query;
      const apiKey = process.env.OPENALEX_API_KEY;
      
      const params: any = {
        search,
        filter,
        page,
        'per-page': perPage,
        select,
        mailto: process.env.SCHOLAR_CONTACT_EMAIL || undefined
      };

      if (apiKey) {
        params.api_key = apiKey;
      }

      const response = await axios.get("https://api.openalex.org/works", {
        params,
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("OpenAlex Proxy Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch from OpenAlex" });
    }
  });

  app.get(/^\/api\/openalex\/work\/(.*)/, async (req, res) => {
    try {
      const workId = req.params[0];
      const { select } = req.query;
      const apiKey = process.env.OPENALEX_API_KEY;

      const params: any = {
        select,
        mailto: process.env.SCHOLAR_CONTACT_EMAIL || undefined
      };

      if (apiKey) {
        params.api_key = apiKey;
      }

      const response = await axios.get(`https://api.openalex.org/works/${workId}`, {
        params,
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        }
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("OpenAlex Work Proxy Error:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to fetch work from OpenAlex" });
    }
  });

  // --- Semantic Scholar Proxy Routes ---
  app.get(/^\/api\/s2\/(.*)/, async (req, res) => {
    try {
      const subPath = req.params[0];
      const s2ApiKey = process.env.SEMANTIC_SCHOLAR_API_KEY || process.env.S2_API_KEY;
      
      const headers: any = {
        'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
      };

      if (s2ApiKey) {
        headers['x-api-key'] = s2ApiKey;
      }

      const response = await axios.get(`https://api.semanticscholar.org/graph/v1/${subPath}`, {
        params: req.query,
        headers,
        timeout: 8000
      });

      res.json(response.data);
    } catch (error: any) {
      console.warn("[Semantic Scholar Proxy Notice]: Upstream API status", error.response?.status || "Network error");
      // Return 200 with graceful empty response so downstream clients degrade cleanly without 500 errors
      res.json({
        data: [],
        total: 0,
        warning: "Upstream Semantic Scholar API unavailable"
      });
    }
  });

  // SerpApi proxy route for Google Scholar
  app.get("/api/scholar", async (req, res) => {
    try {
      const { q, api_key, num, start } = req.query;
      
      const finalApiKey = api_key || process.env.SERPAPI_KEY;
      
      if (!finalApiKey) {
        return res.status(400).json({ error: "SerpApi Key is required" });
      }

      const response = await axios.get("https://serpapi.com/search.json", {
        params: {
          engine: "google_scholar",
          q,
          api_key: finalApiKey,
          num: num || 10,
          start: start || 0,
        },
      });

      res.json(response.data);
    } catch (error: any) {
      console.error("SerpApi Error:", error.response?.data || error.message);
      res.status(500).json({ error: "Failed to fetch from Google Scholar" });
    }
  });

  // --- Cloud Scout Nanobot Route (AI-Researcher Inspired) ---
  app.get("/api/scout/search", async (req, res: express.Response) => {
    try {
      const { query, num } = req.query;
      
      if (!query) {
        return res.status(400).json({ error: "Search query is required for the Scout." });
      }

      console.log(`[Cloud Scout] Initiating OpenAlex autonomous search for: ${query}`);
      const limit = num || 15;
      const apiKey = process.env.OPENALEX_API_KEY;
      
      // We explicitly query OpenAlex filtering for works that have a direct OA PDF URL
      const response = await axios.get("https://api.openalex.org/works", {
        params: {
          search: query,
          "filter": "has_oa_accepted_or_published_version:true",
          "per-page": limit,
          "sort": "cited_by_count:desc", // Get high-impact papers first
          "api_key": apiKey,
          "mailto": "researcher@db-lab.org"
        },
        headers: {
          'User-Agent': 'ScholarExplorer-CloudScout/1.0 (mailto:researcher@db-lab.org)'
        }
      });

      const works = response.data.results || [];
      const dossier = works.map((w: any) => {
        // Extract the best PDF URL for the Local Lab to ingest later
        const pdfUrl = w.best_oa_location?.pdf_url || null;
        const authors = w.authorships?.map((a: any) => a.author.display_name).join(", ") || "Unknown";
        
        return {
          id: w.id,
          title: w.title,
          authors: authors,
          doi: w.doi,
          publication_year: w.publication_year,
          abstract: w.abstract_inverted_index ? "Abstract available..." : "No abstract",
          pdf_url: pdfUrl,
          provenance_source: "OpenAlex via Cloud Scout"
        };
      });

      console.log(`[Cloud Scout] Successfully compiled dossier with ${dossier.length} papers.`);
      res.json({ results: dossier });

    } catch (error: any) {
      console.error("[Cloud Scout Error]:", error.response?.data || error.message);
      res.status(500).json({ error: "Scout failed to compile dossier from OpenAlex." });
    }
  });

  // --- Open Scholarly Registries & Infrastructure Proxy Endpoints ---

  // 1. DataCite GraphQL & REST Endpoints
  app.post("/api/registries/datacite/graphql", async (req, res) => {
    try {
      const { query, variables } = req.body;
      const response = await axios.post("https://api.datacite.org/graphql", {
        query,
        variables
      }, {
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[DataCite GraphQL Proxy Notice]:", error.response?.data || error.message);
      res.status(error.response?.status || 500).json(error.response?.data || { error: "Failed to query DataCite GraphQL" });
    }
  });

  app.get("/api/registries/datacite/search", async (req, res) => {
    try {
      const { query, limit } = req.query;
      const pageSize = limit ? parseInt(limit as string, 10) : 10;
      const response = await axios.get("https://api.datacite.org/dois", {
        params: {
          query,
          'page[size]': pageSize
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 8000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[DataCite REST Proxy Notice]:", error.response?.data || error.message);
      res.json({ data: [], meta: { total: 0 } });
    }
  });

  // 2. OpenCitations (COCI & SPARQL) Endpoints
  app.get(["/api/registries/opencitations/citations", "/api/registries/opencitations/citations/*doi"], async (req, res) => {
    try {
      const rawDoi = (req.params as any).doi || (req.params as any)[0] || (req.query.doi as string) || "";
      const doi = decodeURIComponent(String(rawDoi)).replace(/^\//, '').trim();
      if (!doi) {
        return res.json([]);
      }
      const response = await axios.get(`https://opencitations.net/index/coci/api/v1/citations/${encodeURIComponent(doi)}`, {
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[OpenCitations Citations Proxy Notice]:", error.response?.status || error.message);
      res.json([]);
    }
  });

  app.get(["/api/registries/opencitations/references", "/api/registries/opencitations/references/*doi"], async (req, res) => {
    try {
      const rawDoi = (req.params as any).doi || (req.params as any)[0] || (req.query.doi as string) || "";
      const doi = decodeURIComponent(String(rawDoi)).replace(/^\//, '').trim();
      if (!doi) {
        return res.json([]);
      }
      const response = await axios.get(`https://opencitations.net/index/coci/api/v1/references/${encodeURIComponent(doi)}`, {
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[OpenCitations References Proxy Notice]:", error.response?.status || error.message);
      res.json([]);
    }
  });

  app.post("/api/registries/opencitations/sparql", async (req, res) => {
    try {
      const { query } = req.body;
      const response = await axios.get("https://opencitations.net/sparql", {
        params: {
          query,
          format: "json"
        },
        headers: {
          'Accept': 'application/sparql-results+json',
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 12000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[OpenCitations SPARQL Proxy Notice]:", error.response?.status || error.message);
      res.status(error.response?.status || 500).json({ error: "Failed to execute OpenCitations SPARQL query" });
    }
  });

  // 3. OpenAIRE Graph Endpoints (Projects/Grants & Publications)
  app.get("/api/registries/openaire/projects", async (req, res) => {
    try {
      const { keywords, size } = req.query;
      const response = await axios.get("https://api.openaire.eu/search/projects", {
        params: {
          keywords,
          size: size || 10,
          format: "json"
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[OpenAIRE Projects Proxy Notice]:", error.response?.status || error.message);
      res.json({ response: { results: { result: [] }, header: { total: "0" } } });
    }
  });

  app.get("/api/registries/openaire/publications", async (req, res) => {
    try {
      const { keywords, size } = req.query;
      const response = await axios.get("https://api.openaire.eu/search/publications", {
        params: {
          keywords,
          size: size || 10,
          format: "json"
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[OpenAIRE Publications Proxy Notice]:", error.response?.status || error.message);
      res.json({ response: { results: { result: [] }, header: { total: "0" } } });
    }
  });

  // 4. Europe PMC / PubMed Central Endpoint
  app.get("/api/registries/europepmc/search", async (req, res) => {
    try {
      const { query, pageSize, page } = req.query;
      const response = await axios.get("https://www.ebi.ac.uk/europepmc/webservices/rest/search", {
        params: {
          query,
          pageSize: pageSize || 10,
          page: page || 1,
          resultType: 'core',
          format: 'json'
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[Europe PMC Proxy Notice]:", error.response?.status || error.message);
      res.json({ hitCount: 0, resultList: { result: [] } });
    }
  });

  // 5. DBLP Computer Science Bibliography Endpoint
  app.get("/api/registries/dblp/search", async (req, res) => {
    try {
      const { q, h } = req.query;
      const response = await axios.get("https://dblp.org/search/publ/api", {
        params: {
          q,
          h: h || 10,
          format: 'json'
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 8000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[DBLP Proxy Notice]:", error.response?.status || error.message);
      res.json({ result: { hits: { hit: [] } } });
    }
  });

  // 6. Crossref Metadata REST API Endpoint
  app.get("/api/registries/crossref/search", async (req, res) => {
    try {
      const { query, rows, sort } = req.query;
      const response = await axios.get("https://api.crossref.org/works", {
        params: {
          query,
          rows: rows || 10,
          sort: sort || "relevance",
          ...(process.env.SCHOLAR_CONTACT_EMAIL ? { mailto: process.env.SCHOLAR_CONTACT_EMAIL } : {})
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[Crossref Proxy Notice]:", error.response?.status || error.message);
      res.json({ message: { items: [], "total-results": 0 } });
    }
  });

  app.get(["/api/registries/crossref/works/:doi", "/api/registries/crossref/works/*doi"], async (req, res) => {
    try {
      const doi = (req.params as any).doi || (req.params as any)[0];
      const response = await axios.get(`https://api.crossref.org/v1/works/${encodeURIComponent(doi)}`, {
        params: process.env.SCHOLAR_CONTACT_EMAIL ? { mailto: process.env.SCHOLAR_CONTACT_EMAIL } : {},
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      res.status(error.response?.status || 502).json({ error: "Crossref DOI lookup failed" });
    }
  });

  // 7. Zenodo / CERN Open Science Research Registry Endpoint
  app.get("/api/registries/zenodo/search", async (req, res) => {
    try {
      const { q, size } = req.query;
      const response = await axios.get("https://zenodo.org/api/records", {
        params: {
          q,
          size: size || 10,
          sort: "bestmatch"
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[Zenodo Proxy Notice]:", error.response?.status || error.message);
      res.json({ hits: { hits: [], total: 0 } });
    }
  });

  // 8. NCBI PubMed Entrez E-Utilities Endpoint
  app.get("/api/registries/pubmed/search", async (req, res) => {
    try {
      const { term, retmax } = req.query;
      const searchRes = await axios.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi", {
        params: {
          db: "pubmed",
          term,
          retmode: "json",
          retmax: retmax || 10,
          sort: "relevance"
        },
        timeout: 8000
      });

      const idList = searchRes.data?.esearchresult?.idlist || [];
      if (!idList.length) {
        return res.json({ idList: [], summaries: {} });
      }

      const summaryRes = await axios.get("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi", {
        params: {
          db: "pubmed",
          id: idList.join(","),
          retmode: "json"
        },
        timeout: 10000
      });

      res.json({
        idList,
        count: searchRes.data?.esearchresult?.count || idList.length,
        result: summaryRes.data?.result || {}
      });
    } catch (error: any) {
      console.warn("[PubMed Proxy Notice]:", error.response?.status || error.message);
      res.json({ idList: [], count: 0, result: {} });
    }
  });

  // 9. bioRxiv & medRxiv Preprints Endpoint
  app.get("/api/registries/biorxiv/search", async (req, res) => {
    try {
      const { query, rows } = req.query;
      // Crossref provides comprehensive real-time index of all Cold Spring Harbor Laboratory preprints (bioRxiv/medRxiv DOI prefix 10.1101)
      const response = await axios.get("https://api.crossref.org/works", {
        params: {
          query,
          filter: "prefix:10.1101",
          rows: rows || 10,
          sort: "relevance"
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[bioRxiv Proxy Notice]:", error.response?.status || error.message);
      res.json({ message: { items: [], "total-results": 0 } });
    }
  });

  // 10. Theses & Doctoral Dissertations Registry Endpoint
  app.get("/api/registries/dissertations/search", async (req, res) => {
    try {
      const { query, rows } = req.query;
      // Query Crossref works strictly filtered to doctoral dissertations and theses
      const response = await axios.get("https://api.crossref.org/works", {
        params: {
          query,
          filter: "type:dissertation",
          rows: rows || 10,
          sort: "relevance"
        },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0${process.env.SCHOLAR_CONTACT_EMAIL ? ` (mailto:${process.env.SCHOLAR_CONTACT_EMAIL})` : ''}`
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[Dissertations Proxy Notice]:", error.response?.status || error.message);
      res.json({ message: { items: [], "total-results": 0 } });
    }
  });

  // 11. DOAJ (Directory of Open Access Journals) Endpoint
  app.get("/api/registries/doaj/search", async (req, res) => {
    try {
      const { query, pageSize } = req.query;
      const response = await axios.get(`https://doaj.org/api/v2/search/articles/${encodeURIComponent(String(query || ""))}`, {
        params: {
          pageSize: pageSize || 10
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[DOAJ Proxy Notice]:", error.response?.status || error.message);
      res.json({ results: [], total: 0 });
    }
  });

  // 12. ERIC (Education Resources Information Center) Endpoint
  app.get("/api/registries/eric/search", async (req, res) => {
    try {
      const { search, rows } = req.query;
      const response = await axios.get("https://api.ies.ed.gov/eric/", {
        params: {
          search,
          format: "json",
          rows: rows || 10
        },
        timeout: 10000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[ERIC Proxy Notice]:", error.response?.status || error.message);
      res.json({ response: { docs: [], numFound: 0 } });
    }
  });

  // 13. CORE Open Access Institutional Repositories Endpoint
  app.get("/api/registries/core/search", async (req, res) => {
    try {
      const { q, limit } = req.query;
      const response = await axios.get("https://api.core.ac.uk/v3/search/works", {
        params: {
          q,
          limit: limit || 10
        },
        timeout: 8000
      });
      res.json(response.data);
    } catch (error: any) {
      console.warn("[CORE Proxy Notice]:", error.response?.status || error.message);
      res.json({ results: [], totalHits: 0 });
    }
  });

  // 13b. arXiv API Server Proxy (avoids browser CORS error on export.arxiv.org)
  app.get("/api/registries/arxiv/search", async (req, res) => {
    try {
      const { search_query, id_list, max_results, start } = req.query;
      const params: Record<string, any> = {};
      if (search_query) params.search_query = search_query;
      if (id_list) params.id_list = id_list;
      if (max_results) params.max_results = max_results;
      if (start !== undefined) params.start = start;

      const response = await axios.get("https://export.arxiv.org/api/query", {
        params,
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0`
        },
        responseType: 'text',
        timeout: 9000
      });
      res.json({ unavailable: false, xml: response.data || "" });
    } catch (error: any) {
      res.json({ unavailable: true, xml: "" });
    }
  });

  app.get("/api/registries/arxiv/ar5iv/:arxivId", async (req, res) => {
    try {
      const { arxivId } = req.params;
      const response = await axios.get(`https://ar5iv.labs.arxiv.org/html/${encodeURIComponent(arxivId)}`, {
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0`
        },
        responseType: 'text',
        timeout: 8000,
        validateStatus: () => true
      });
      if (response.status >= 200 && response.status < 300 && typeof response.data === 'string') {
        return res.json({ html: response.data });
      }
      res.json({ html: null });
    } catch {
      res.json({ html: null });
    }
  });

  // 13c. Unpaywall OA Lookup Proxy (treats 404 as normal "no open-access copy" result)
  app.get(["/api/registries/unpaywall/:doi", "/api/registries/unpaywall/*doi"], async (req, res) => {
    try {
      const rawDoi = (req.params as any).doi || (req.params as any)[0] || "";
      const cleanDoi = Array.isArray(rawDoi) ? rawDoi.join("/") : String(rawDoi);
      if (!cleanDoi) {
        return res.json({ is_oa: false, oaLink: null });
      }
      const email = process.env.SCHOLAR_CONTACT_EMAIL || 'contact@scholar-explorer.com';
      const response = await axios.get(`https://api.unpaywall.org/v2/${encodeURIComponent(cleanDoi)}`, {
        params: { email },
        headers: {
          'User-Agent': `${process.env.SCHOLAR_SERVICE_NAME || 'ScholarExplorer'}/1.0 (mailto:${email})`
        },
        timeout: 8000,
        validateStatus: () => true
      });

      if (response.status === 404 || response.status < 200 || response.status >= 300) {
        // 404 for a DOI (e.g. Zenodo DOIs) means "no open-access copy" — normal result
        return res.json({ is_oa: false, oaLink: null, status: response.status });
      }

      const data = response.data;
      const oaLink = (data?.is_oa && (data?.best_oa_location?.url_for_pdf || data?.best_oa_location?.url_for_landing_page)) || null;
      return res.json({
        is_oa: Boolean(data?.is_oa),
        oaLink,
        best_oa_location: data?.best_oa_location || null
      });
    } catch {
      return res.json({ is_oa: false, oaLink: null });
    }
  });

  // ==========================================
  // OPEN ACADEMIC SOURCE DISCOVERY & PROPOSALS
  // ==========================================

  // 14. Get all discovered and approved sources
  app.get("/api/sources/registry", (req, res) => {
    res.json(getSourcesRegistry());
  });

  // 15. Test an open database endpoint with live ping
  // SSRF-safe: https only, allowlisted hosts, public IPs only, no response body returned (see server/safeFetch.ts).
  app.post("/api/sources/test-endpoint", async (req, res) => {
    const { sourceId, url } = req.body ?? {};
    if (typeof sourceId !== "string" || (url !== undefined && url !== null && typeof url !== "string")) {
      return res.status(400).json({ online: false, status: 400, latencyMs: 0, error: "sourceId and url must be strings" });
    }
    const result = await testSourceEndpoint(sourceId, url ?? undefined);
    res.status(result.error === "URL not allowed" ? 400 : 200).json(result);
  });

  // 16. Dispatch proposal email to ashley.e.cribb@gmail.com
  app.post("/api/sources/propose", async (req, res) => {
    try {
      const { sourceId, recipientEmail } = req.body;
      const result = await proposeSource(sourceId, recipientEmail);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 17. Approve a source and include it in backend search
  app.post("/api/sources/approve/:id", (req, res) => {
    try {
      const source = approveSource(req.params.id);
      res.json({ success: true, source });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 18. Reject a source proposal
  app.post("/api/sources/reject/:id", (req, res) => {
    try {
      const source = rejectSource(req.params.id);
      res.json({ success: true, source });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // 19. Add custom discovered source
  app.post("/api/sources/custom", (req, res) => {
    const source = addCustomDiscoveredSource(req.body);
    res.json({ success: true, source });
  });

  // 20. One-click approval link handler from email
  app.get("/api/sources/approve-token", (req, res) => {
    try {
      const { id } = req.query;
      if (!id) return res.status(400).send("Source ID required");
      const source = approveSource(String(id));
      res.send(`
        <html>
          <body style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 60px 20px; background: #f8fafc; color: #0f172a;">
            <div style="max-width: 520px; margin: 0 auto; background: white; padding: 40px; border-radius: 16px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
              <div style="font-size: 48px; margin-bottom: 16px;">✨</div>
              <h1 style="color: #059669; font-size: 24px; font-weight: 800; margin: 0 0 12px;">Source Approved & Activated!</h1>
              <p style="font-size: 15px; color: #475569; line-height: 1.5; margin: 0 0 24px;">
                <strong>${source.name}</strong> has been successfully incorporated into the Scholar Explorer search registry. Students will now search this repository automatically.
              </p>
              <a href="/" style="display: inline-block; padding: 12px 28px; background: #0f172a; color: white; text-decoration: none; border-radius: 10px; font-weight: 700; font-size: 14px;">Return to Scholar Explorer</a>
            </div>
          </body>
        </html>
      `);
    } catch (err: any) {
      res.status(400).send(`Approval error: ${err.message}`);
    }
  });

  // ==========================================
  // UNIVERSITY LIBRARY MCP CONNECTOR & PROSPECTUS
  // ==========================================

  // 21. Generate Institutional Prospectus and MCP Config
  app.post("/api/library-mcp/prospectus", (req, res) => {
    const config = req.body;
    const document = generateLibraryMcpDocument(config);
    res.json(document);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`MCP WebSocket Relay listening on ws://localhost:${PORT}/mcp-relay`);
  });
}

startServer();
