
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { McpStatus, LocalLibraryMetadata, ResearchPaper } from '../types';

const DEFAULT_MCP_URL = '/mcp';

class McpClientService {
    private client: Client | null = null;
    private transport: SSEClientTransport | null = null;
    private currentStatus: McpStatus = {
        isConnected: false,
        serverUrl: DEFAULT_MCP_URL,
        capabilities: []
    };

    /**
     * Connects to an MCP server via SSE.
     */
    public async connect(url: string = DEFAULT_MCP_URL): Promise<McpStatus> {
        console.log(`[MCP] Building bridge to ${url}...`);
        
        try {
            // Close existing connection if any
            if (this.client) {
                await this.client.close();
            }

            // The SSEClientTransport connects to the GET endpoint for events
            // and uses the same URL (or a sub-path) for POSTing messages
            const baseUrl = url.startsWith('http') ? url : `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
            this.transport = new SSEClientTransport(new URL(baseUrl));
            
            this.client = new Client(
                {
                    name: "scholar-explorer-web-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {}
                }
            );

            await this.client.connect(this.transport);
            
            // List tools to verify capabilities
            const tools = await this.client.listTools();
            const resources = await this.client.listResources();
            
            this.currentStatus = {
                isConnected: true,
                serverUrl: url,
                version: "1.0.0",
                capabilities: [
                  ...tools.tools.map(t => `tool:${t.name}`),
                  ...resources.resources.map(r => `res:${r.name}`)
                ]
            };
            
            console.log("[MCP] Bridge established successfully.");
        } catch (e) {
            console.error("[MCP] Failed to connect to bridge", e);
            this.currentStatus = { ...this.currentStatus, isConnected: false, serverUrl: url };
        }
        
        return this.currentStatus;
    }

    public getStatus(): McpStatus {
        return this.currentStatus;
    }

    /**
     * Queries the local MCP workspace server for metadata using tools.
     */
    public async getLocalLibraryStats(): Promise<LocalLibraryMetadata | null> {
        if (!this.currentStatus.isConnected || !this.client) return null;
        
        try {
            // We'll use the search tool with an empty query to get all paper info if needed,
            // or we could add a dedicated 'stats' tool. For now, let's try the search tool.
            const result = await this.client.callTool({
                name: "search_local_library",
                arguments: { query: "" }
            });
            
            if (result.content && result.content[0].type === "text") {
                const papers = JSON.parse(result.content[0].text);
                return {
                    paperCount: papers.length,
                    collectionCount: 1 // Default
                };
            }
        } catch (e) {
            console.error("[MCP] Failed to fetch library stats via tool", e);
        }
        return null;
    }

    /**
     * Checks if a paper exists in the local researcher's collection via MCP.
     */
    public async checkLocalLibrary(paper: ResearchPaper): Promise<boolean> {
        if (!this.currentStatus.isConnected || !this.client) return false;

        try {
            const result = await this.client.callTool({
                name: "search_local_library",
                arguments: { query: paper.title }
            });
            
            if (result.content && result.content[0].type === "text") {
                const matches = JSON.parse(result.content[0].text);
                return matches.length > 0;
            }
        } catch (e) {
            console.error("[MCP] Tool call failed", e);
        }
        return false;
    }

    /**
     * Ingests a paper to the local AI vault via MCP tool.
     */
    public async syncToLocal(paper: ResearchPaper): Promise<string | null> {
        if (!this.currentStatus.isConnected || !this.client) return null;

        try {
            const result = await this.client.callTool({
                name: "ingest_to_local_vault",
                arguments: { 
                  paperId: paper.id,
                  title: paper.title,
                  doi: paper.doi || undefined,
                  pdfUrl: paper.pdfURL || paper.openAccessPdfUrl || undefined
                }
            });
            
            if (result.content && result.content[0].type === "text") {
                return result.content[0].text;
            }
        } catch (e) {
            console.error("[MCP] Vault ingestion tool call failed", e);
        }
        return null;
    }

    /**
     * Retrieves the Logician Trust Audit trail for a specific paper.
     */
    public async getVaultAuditTrail(doi: string): Promise<any | null> {
        if (!this.currentStatus.isConnected || !this.client) return null;

        try {
            const result = await this.client.callTool({
                name: "get_vault_audit_trail",
                arguments: { doi }
            });
            
            if (result.content && result.content[0].type === "text") {
                return JSON.parse(result.content[0].text);
            }
        } catch (e) {
            console.error("[MCP] Audit trail tool call failed", e);
        }
        return null;
    }
}

export const mcpService = new McpClientService();
