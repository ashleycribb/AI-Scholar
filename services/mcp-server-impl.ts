
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListResourceTemplatesRequestSchema
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "child_process";
import express from "express";
import path from "path";
import fs from "fs";
import { 
  registerCapabilityPackInRegistry, 
  getCapabilitiesSince, 
  getPackById 
} from "./marketplaceService.js";
import { registerCapabilityToolInAgent } from "./agentService.js";

/**
 * Scholar Explorer Workspace MCP Server
 * This server acts as a bridge between the local researcher's environment 
 * and the cloud-based platform.
 */
export class WorkspaceMcpServer {
  private server: Server;
  
  // Mock local library for demonstration
  private localLibrary = [
    { id: "loc_1", title: "Attention Is All You Need", author: "Vaswani et al.", year: 2017, status: "read" },
    { id: "loc_2", title: "Language Models are Few-Shot Learners", author: "Brown et al.", year: 2020, status: "to-read" }
  ];

  constructor() {
    this.server = new Server(
      {
        name: "scholar-explorer-workspace",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          logging: {}
        },
      }
    );

    this.setupHandlers();
  }

  private setupHandlers() {
    // 1. List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_local_library",
          description: "Search the researcher's local paper collection",
          inputSchema: {
            type: "object",
            properties: {
              query: { type: "string" }
            },
            required: ["query"]
          }
        },
        {
          name: "ingest_to_local_vault",
          description: "Trigger the local AI Lab to ingest a paper: downloads PDF, converts to MarkDown via MarkItDown, and indexes to DuckDB.",
          inputSchema: {
            type: "object",
            properties: {
              paperId: { type: "string" },
              doi: { type: "string" },
              pdfUrl: { type: "string" },
              title: { type: "string" }
            },
            required: ["paperId", "title"]
          }
        },
        {
          name: "get_vault_audit_trail",
          description: "Retrieve the Logician Trust Audit trail for a specific paper from the local DuckDB LRS.",
          inputSchema: {
            type: "object",
            properties: {
              doi: { type: "string" }
            },
            required: ["doi"]
          }
        },
        {
          name: "run_logician_verification",
          description: "Wake up the Logician Nanobot to read the ingested Markdown file, check it against EdTech logic rules, and write a Trust Audit to the DuckDB Tensor LRS.",
          inputSchema: {
            type: "object",
            properties: {
              mdxPath: { type: "string", description: "Path to the markdown file in the vault." }
            },
            required: ["mdxPath"]
          }
        },
        {
          name: "publish_capability_pack",
          description: "Publish or update an ontological Capability Pack to the central Scholar Explorer Capability Marketplace.",
          inputSchema: {
            type: "object",
            properties: {
              pack: {
                type: "object",
                description: "Capability Pack payload including manifest, ontology_content (.ttl), xapi_content, tools_content, workflow_content, and trust_card_content.",
                properties: {
                  manifest: { type: "object" },
                  ontology_content: { type: "string" },
                  xapi_content: { type: "string" },
                  tools_content: { type: "string" },
                  workflow_content: { type: "string" },
                  trust_card_content: { type: "string" },
                  domain: { type: "string" }
                },
                required: ["manifest", "ontology_content", "xapi_content"]
              },
              author: { type: "string", description: "Researcher or lab identifier submitting the pack." }
            },
            required: ["pack"]
          }
        },
        {
          name: "list_new_capabilities",
          description: "Fetch capability packs published or updated since a given timestamp from the central Scholar Explorer marketplace.",
          inputSchema: {
            type: "object",
            properties: {
              since: { type: "string", description: "ISO 8601 timestamp or millisecond timestamp string." }
            }
          }
        },
        {
          name: "learnmcp_query_audit_trail",
          description: "Query DuckDB xAPI audit trail for AI actions or human actions by session UUID, paper DOI, or agent name.",
          inputSchema: {
            type: "object",
            properties: {
              sessionUuid: { type: "string", description: "Session UUID to filter statements" },
              doi: { type: "string", description: "Paper DOI to filter statements" },
              agent: { type: "string", description: "Agent name filter" },
              limit: { type: "number", description: "Maximum statements to return" }
            }
          }
        },
        {
          name: "learnmcp_record_statement",
          description: "Record an xAPI statement conforming to the Research Traceability profile to DuckDB (for AI) or Yet SQL LRS (for humans).",
          inputSchema: {
            type: "object",
            properties: {
              actorName: { type: "string", description: "Actor or agent name" },
              verbId: { type: "string", description: "xAPI verb URI from ontology" },
              verbDisplay: { type: "string", description: "Human-readable verb display" },
              objectId: { type: "string", description: "Object URI / DOI / URN" },
              objectName: { type: "string", description: "Object title / definition" },
              lrsTarget: { type: "string", enum: ["duckdb-vertical-lrs", "yet-sql-lrs"], description: "Destination LRS" },
              sessionUuid: { type: "string", description: "Session UUID for traceability" },
              details: { type: "object", description: "Result and extension metadata" }
            },
            required: ["actorName", "verbId", "objectId", "lrsTarget"]
          }
        },
        {
          name: "learnmcp_get_status",
          description: "Retrieve health, statement metrics, and database engine statuses for Yet SQL LRS and DuckDB Vertical LRS.",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    }));

    // 2. Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (name === "publish_capability_pack") {
        try {
          const rawArgs = args as any;
          const packPayload = rawArgs?.pack_data || rawArgs?.pack || rawArgs;
          const author = rawArgs?.author || packPayload?.author || "Local Lab MCP Agent";

          const registeredPack = registerCapabilityPackInRegistry(packPayload, author);
          registerCapabilityToolInAgent(registeredPack);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                status: "success",
                pack_id: registeredPack.manifest.id,
                registered_at: registeredPack.published_at,
                author: registeredPack.author,
                message: `Capability Pack "${registeredPack.manifest.name}" [${registeredPack.manifest.id}] successfully registered to Scholar Explorer central marketplace via MCP.`
              }, null, 2)
            }]
          };
        } catch (err: any) {
          return {
            isError: true,
            content: [{ type: "text", text: `MCP Capability Publish Error: ${err.message}` }]
          };
        }
      }

      if (name === "list_new_capabilities") {
        const rawArgs = (args || {}) as any;
        const sinceVal = rawArgs?.since_timestamp || rawArgs?.since;
        const newPacks = getCapabilitiesSince(sinceVal);
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              schema: "scholar-explorer-marketplace-catalog@0.1.0",
              generated_at: new Date().toISOString(),
              count: newPacks.length,
              packs: newPacks
            }, null, 2)
          }]
        };
      }

      if (name === "search_local_library") {
        const query = (args?.query as string || "").toLowerCase();
        const results = this.localLibrary.filter(p => 
          p.title.toLowerCase().includes(query) || 
          p.author.toLowerCase().includes(query)
        );
        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }]
        };
      }

      if (name === "ingest_to_local_vault") {
        const { paperId, doi, pdfUrl, title } = args as { paperId: string, doi?: string, pdfUrl?: string, title: string };
        
        console.log(`[Workspace Server] Initiating ingestion for "${title}"...`);
        
        // Handoff to Python Nanobot
        const pythonScript = path.join(process.cwd(), "local_engine", "nanobots", "ingestor.py");
        
        return new Promise((resolve) => {
          const child = spawn("python3", [
            pythonScript, 
            doi || "no_doi", 
            pdfUrl || "no_url",
            title
          ]);

          let output = "";
          let errorOutput = "";

          child.stdout.on("data", (data) => {
            const str = data.toString();
            output += str;
            // Send real-time log back to platform via MCP logging
            this.server.sendLoggingMessage({
              level: "info",
              data: `[Ingestor] ${str.trim()}`,
              logger: "python-nanobot"
            });
          });

          child.stderr.on("data", (data) => {
            errorOutput += data.toString();
          });

          child.on("close", (code) => {
            if (code === 0) {
              this.localLibrary.push({ 
                id: `loc_${Date.now()}`, 
                title, 
                author: "Local AI Ingested", 
                year: new Date().getFullYear(),
                status: "vaulted"
              });
              resolve({
                content: [{ 
                  type: "text", 
                  text: `Successfully ingested "${title}" to local AI vault.\n\nLab Output:\n${output}` 
                }]
              });
            } else {
              resolve({
                isError: true,
                content: [{ 
                  type: "text", 
                  text: `Failed to ingest paper. Code: ${code}\nError: ${errorOutput}` 
                }]
              });
            }
          });
        });
      }

      if (name === "get_vault_audit_trail") {
        const { doi } = args as { doi: string };
        const pythonScript = path.join(process.cwd(), "local_engine", "nanobots", "querier.py");

        return new Promise((resolve) => {
          const child = spawn("python3", [pythonScript, doi]);
          let output = "";
          
          child.stdout.on("data", (data) => {
            output += data.toString();
          });

          child.on("close", (code) => {
            if (code === 0) {
              resolve({
                content: [{ type: "text", text: output.trim() }]
              });
            } else {
              resolve({
                isError: true,
                content: [{ type: "text", text: JSON.stringify({ error: `Code ${code}` }) }]
              });
            }
          });
        });
      }

      if (name === "run_logician_verification") {
        const { mdxPath } = args as { mdxPath: string };
        const pythonScript = path.join(process.cwd(), "local_engine", "nanobots", "logician.py");
        
        console.log(`[Workspace Server] Initiating Logician verification for "${mdxPath}"...`);

        return new Promise((resolve) => {
          const child = spawn("python3", [pythonScript, mdxPath]);
          let output = "";
          let errorOutput = "";
          
          child.stdout.on("data", (data) => {
            const str = data.toString();
            output += str;
            // Send real-time log back to platform via MCP logging
            this.server.sendLoggingMessage({
              level: "info",
              data: `[Logician] ${str.trim()}`,
              logger: "python-nanobot"
            });
          });

          child.stderr.on("data", (data) => {
            errorOutput += data.toString();
          });

          child.on("close", (code) => {
            if (code === 0 || code === null || !code) { // logician.py doesn't error out generally
              resolve({
                content: [{ 
                    type: "text", 
                    text: `Logician completed analysis.\n\nOutput:\n${output}` 
                }]
              });
            } else {
              resolve({
                isError: true,
                content: [{ type: "text", text: `Logician Error. Code ${code}\nError: ${errorOutput}` }]
              });
            }
          });
        });
      }

      if (name === "learnmcp_query_audit_trail") {
        const { sessionUuid, doi, agent, limit } = (args || {}) as any;
        const { getDuckDbStatements } = await import("../server/lrsDatabase.js");
        const results = await getDuckDbStatements({
          sessionUuid,
          agent,
          limit: limit || 50,
          role: "researcher"
        });

        // If doi was specified, filter by matching object id
        const filtered = doi ? results.filter(r => JSON.stringify(r).includes(doi)) : results;

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              engine: "DuckDB Vertical LRS",
              count: filtered.length,
              statements: filtered
            }, null, 2)
          }]
        };
      }

      if (name === "learnmcp_record_statement") {
        const { actorName, verbId, verbDisplay, objectId, objectName, lrsTarget, sessionUuid, details } = (args || {}) as any;
        const stmt = {
          id: `stmt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          actor: {
            name: actorName,
            account: { homePage: "https://scholar-explorer.com", name: actorName }
          },
          verb: {
            id: verbId,
            display: { "en-US": verbDisplay || verbId }
          },
          object: {
            id: objectId,
            definition: { name: { "en-US": objectName || objectId } }
          },
          result: details,
          context: {
            platform: "Scholar Explorer MCP",
            sessionUuid,
            extensions: details
          },
          timestamp: new Date().toISOString(),
          stored: new Date().toISOString(),
          lrsTarget
        };

        if (lrsTarget === "duckdb-vertical-lrs") {
          const { insertDuckDbStatement } = await import("../server/lrsDatabase.js");
          await insertDuckDbStatement(stmt);
        } else {
          const { insertSqlLrsStatement } = await import("../server/lrsDatabase.js");
          insertSqlLrsStatement(stmt);
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "success",
              id: stmt.id,
              target: lrsTarget,
              message: `Statement recorded to ${lrsTarget}`
            }, null, 2)
          }]
        };
      }

      if (name === "learnmcp_get_status") {
        const { getSqlLrsCount, getDuckDbStats } = await import("../server/lrsDatabase.js");
        const sqlCount = getSqlLrsCount();
        const duckDbStats = await getDuckDbStats();

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              yetSqlLrs: {
                status: "active",
                totalStatements: sqlCount,
                dbEngine: "Yet SQL LRS (SQLite Engine: local_engine/sql_lrs.sqlite)"
              },
              learnMcpXapi: {
                status: "active",
                version: "0.1.0-learnmcp",
                mcpToolsRegistered: 6,
                profileUri: "/xapi/research_traceability_profile.json"
              },
              duckDbVerticalLrs: {
                status: "active",
                totalStatements: duckDbStats.totalStatements,
                dbEngine: "DuckDB Vertical Columnar Engine (local_engine/tensor_lrs.duckdb)",
                activeSessionsCount: duckDbStats.activeSessionsCount
              }
            }, null, 2)
          }]
        };
      }

      throw new Error(`Tool not found: ${name}`);
    });

    // 3. List resources & templates
    this.server.setRequestHandler(ListResourceTemplatesRequestSchema, async () => ({
      resourceTemplates: [
        {
          uriTemplate: "capability://{pack_id}",
          name: "Scholar Explorer Capability Pack Template",
          description: "Fetches complete ontological Capability Pack manifest, ontology.ttl, xAPI profile, and tools policy by pack_id",
          mimeType: "application/json"
        }
      ]
    }));

    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      const allPacks = getCapabilitiesSince(0);
      const capabilityResources = allPacks.map(p => ({
        uri: `capability://${p.manifest.id}`,
        name: `Capability Pack: ${p.manifest.name} (v${p.manifest.version})`,
        description: p.manifest.summary,
        mimeType: "application/json"
      }));

      return {
        resources: [
          {
            uri: "workspace://notes/current_project",
            name: "Current Project Research Notes",
            mimeType: "text/plain"
          },
          ...capabilityResources
        ]
      };
    });

    // 4. Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;

      if (uri === "workspace://notes/current_project") {
        return {
          contents: [{
            uri,
            mimeType: "text/plain",
            text: "Researcher Notes: Focusing on transformer architecture and its impact on citation networks. Need to verify recent citations."
          }]
        };
      }

      if (uri.startsWith("capability://")) {
        const packId = uri.replace("capability://", "").trim();
        const pack = await getPackById(packId);

        if (pack) {
          return {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify(pack, null, 2)
            }]
          };
        }
        throw new Error(`Capability Pack not found for ID: ${packId}`);
      }

      throw new Error(`Resource not found: ${uri}`);
    });
  }

  /**
   * Mounts the MCP server onto an Express application using SSE.
   */
  public mount(app: express.Application, basePath: string) {
    const transports = new Map<string, SSEServerTransport>();

    app.get(basePath, async (req, res) => {
      console.log("[MCP] SSE connection received");
      
      // Prevent buffering by proxies
      res.setHeader('X-Accel-Buffering', 'no');
      
      const transport = new SSEServerTransport(`${basePath}/messages`, res);
      const sessionId = transport.sessionId;
      transports.set(sessionId, transport);
      
      console.log(`[MCP] New session created: ${sessionId}`);

      // When the client closes the SSE connection, clean up the transport
      req.on('close', () => {
        console.log(`[MCP] Session ${sessionId} closed`);
        transports.delete(sessionId);
      });

      await this.server.connect(transport);
    });

    app.post(`${basePath}/messages`, async (req, res) => {
      const sessionId = req.query.sessionId as string;
      console.log(`[MCP] POST message received for session: ${sessionId}`);
      
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.handlePostMessage(req, res);
      } else {
        console.error(`[MCP] No active SSE transport for session: ${sessionId}`);
        res.status(400).send("No active SSE transport for this session");
      }
    });
  }
}
