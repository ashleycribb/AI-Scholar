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
import { applyLockdown } from "./server/lockdown";
import { authorizeRelayUpgrade } from "./server/relayAuth";
import { createSourceApprovalRouter } from "./server/sourceApproval";

import { registerLrsRoutes } from "./server/lrsRoutes";
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

  // CORS allowlist (no wildcard) and the route policy: who may call each route (server/routePolicy.ts).
  // Both run before the JSON parser and every handler below, so a rejected request is never parsed.
  // Handlers read the caller from `req.principal`. Service tokens for non-browser clients and the CORS
  // origins come from the environment (SERVICE_TOKENS, CORS_ALLOWED_ORIGINS); see server/auth/README.md.
  const { service, cors: corsConfig } = applyLockdown(app, auth);

  // Initialize MCP WebSocket Relay
  // Only a researcher session or a service token with the `relay` scope may connect, and browsers must come from an allowed origin.
  const wss = new WebSocketServer({
    server: httpServer,
    path: '/mcp-relay',
    verifyClient: (info: { origin: string; req: http.IncomingMessage }, done: (ok: boolean, code?: number, message?: string) => void) => {
      const verdict = authorizeRelayUpgrade(info.req, { auth, service, allowedOrigins: corsConfig.origins });
      if (!("status" in verdict)) return done(true);
      console.warn(`[MCP Relay] Rejected WebSocket upgrade (${verdict.status})`);
      done(false, verdict.status, verdict.reason);
    }
  });

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

  // Middleware
  app.use(express.json());

  // xAPI 1.0.3 endpoints and the LRS routes live in server/lrsRoutes.ts
  registerLrsRoutes(app);

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

  app.get("/api/xapi/learnmcp/profiles", (req, res) => {
    const profilePath = path.join(process.cwd(), "public", "xapi", "research_traceability_profile.json");
    if (fs.existsSync(profilePath)) {
      res.sendFile(profilePath);
    } else {
      res.status(404).json({ error: "xAPI Profile not found" });
    }
  });

  // --- Bi-Directional Capability Marketplace Sync Endpoints ---
  // Registering a pack adds a tool to the server's agent. The route policy requires a signed-in researcher
  // (or admin) with CSRF, or a service token with marketplace:write.
  app.post("/api/marketplace/capabilities", (req, res) => {
    try {
      const payload = req.body;
      // The recorded author is the authenticated caller, not a client-supplied header.
      const principal = (req as any).principal;
      const author = principal?.kind === "session" ? principal.email : `service:${principal?.name ?? "unknown"}`;

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
  app.post("/api/sources/test-endpoint", async (req, res) => {
    const { sourceId, url } = req.body;
    const result = await testSourceEndpoint(sourceId, url);
    res.json(result);
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

  // 20. One-click approval link from the proposal email: confirmation page + POST, single-use token,
  //     escaped output (server/sourceApproval.ts). The route policy leaves it public; the token is the credential.
  app.use("/api/sources", createSourceApprovalRouter());

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
