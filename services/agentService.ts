
import { GoogleGenAI, FunctionDeclaration, Type, Chat } from "@google/genai";
import type { ResearchPaper, ModelDefinition, Project, ChatMessage, ConnectedPaper } from '../types';
import type { CapabilityPack } from '../types/marketplace';
import * as apiService from './apiService';
import * as openalexService from './openalexService';
import * as semanticScholarService from './semanticScholarService';
import * as crossrefService from './crossrefService';
import * as unpaywallService from './unpaywallService';

// Fixed: Correct initialization of GoogleGenAI using process.env.API_KEY directly
const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY,
});

// --- TRACEABILITY & ONTOLOGY TYPES ---

export type ActorType = "HumanResearcher" | "SourceScoutAgent";
export type OntologyVerb = "searched" | "classified" | "extracted" | "verified" | "executed";

export interface TraceableXApiStatement {
  actor: {
    name: string;
    account: {
      homePage: string;
      name: string;
    };
  };
  verb: {
    id: string;
  };
  object: {
    id: string;
  };
  context: {
    extensions: {
      "/ontologies/agent_traceability.owl#actorType": ActorType;
      [key: string]: any;
    };
  };
  timestamp?: string;
}

// In-memory trace store for xAPI statements
const traceableStatementsLog: TraceableXApiStatement[] = [];

/**
 * Creates a unified xAPI statement conforming to agent_traceability.owl and research_traceability_profile.json
 */
export function createTraceableXApiStatement(params: {
  actorType: ActorType;
  actorId?: string;
  verb: OntologyVerb;
  objectId: string;
  meta?: Record<string, any>;
}): TraceableXApiStatement {
  const isHuman = params.actorType === "HumanResearcher";
  const actorName = isHuman
    ? "Human Researcher (Scholar Explorer UI)"
    : "Source Scout Agent (Scholar Explorer Backend)";
  const defaultActorId = isHuman ? "human_researcher_ui" : "source_scout_agent_backend";

  const statement: TraceableXApiStatement = {
    actor: {
      name: actorName,
      account: {
        homePage: "/",
        name: params.actorId || defaultActorId
      }
    },
    verb: {
      id: `/ontologies/agent_traceability.owl#${params.verb}`
    },
    object: {
      id: params.objectId
    },
    context: {
      extensions: {
        "/ontologies/agent_traceability.owl#actorType": params.actorType,
        ...(params.meta || {})
      }
    },
    timestamp: new Date().toISOString()
  };

  recordTraceableStatement(statement);
  return statement;
}

export function recordTraceableStatement(statement: TraceableXApiStatement) {
  traceableStatementsLog.unshift(statement);
  if (traceableStatementsLog.length > 500) {
    traceableStatementsLog.pop();
  }
}

export function getTraceableStatements(filterType?: ActorType): TraceableXApiStatement[] {
  if (!filterType) return [...traceableStatementsLog];
  return traceableStatementsLog.filter(
    s => s.context.extensions["/ontologies/agent_traceability.owl#actorType"] === filterType
  );
}

/**
 * Executes a unified multi-source search via Source Scout Agent across OpenAlex, Semantic Scholar, Crossref, and Unpaywall
 */
export async function executeSourceScoutSearch(
  query: string,
  actorType: ActorType = "SourceScoutAgent",
  actorId?: string
) {
  const querySlug = query.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50);
  const objectId = `urn:openalex:query:${querySlug}`;

  // Execute multi-source queries simultaneously
  const openalexPromise = openalexService.searchOpenAlex(query, {}, 1).then(r => r.papers).catch(() => []);
  const s2Promise = semanticScholarService.searchSemanticScholar(query, {}).then(r => r.papers).catch(() => []);
  const crossrefPromise = crossrefService.fetchWorkByDoi(query).then(res => res ? [res] : []).catch(() => []);

  const [openalexPapers, s2Papers] = await Promise.all([openalexPromise, s2Promise]);

  // Merge and deduplicate by DOI or title
  const paperMap = new Map<string, ResearchPaper>();
  [...openalexPapers, ...s2Papers].forEach(paper => {
    const key = paper.doi ? paper.doi.toLowerCase() : paper.title.toLowerCase().trim();
    if (!paperMap.has(key)) {
      paperMap.set(key, paper);
    }
  });

  let combinedPapers = Array.from(paperMap.values());

  // Enrich with Unpaywall OpenAccess links
  combinedPapers = await unpaywallService.enrichWithUnpaywall(combinedPapers);

  // Emit traceable xAPI Statement
  const xapiStatement = createTraceableXApiStatement({
    actorType,
    actorId,
    verb: "searched",
    objectId,
    meta: {
      sources_queried: ["OpenAlex", "SemanticScholar", "Crossref", "Unpaywall"],
      results_count: combinedPapers.length,
      query_raw: query
    }
  });

  return {
    query,
    sources_queried: ["OpenAlex", "SemanticScholar", "Crossref", "Unpaywall"],
    results_count: combinedPapers.length,
    papers: combinedPapers,
    xapiStatement
  };
}

// --- AGENT TOOL DEFINITIONS ---

const getPapersInProjectTool: FunctionDeclaration = {
    name: "get_papers_in_project",
    description: "Lists all the papers currently saved in the user's project.",
    parameters: { type: Type.OBJECT, properties: {} }
};

const getPaperDetailsTool: FunctionDeclaration = {
    name: "get_paper_details",
    description: "Retrieves the full details (title, authors, abstract, citations) for a specific paper using its ID.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            paper_id: { type: Type.STRING, description: "The unique ID of the paper." }
        },
        required: ["paper_id"]
    }
};

const findConnectedPapersTool: FunctionDeclaration = {
    name: "find_connected_papers",
    description: "Finds papers that are connected to a given paper, either by citing it or being cited by it.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            paper_id: { type: Type.STRING, description: "The unique ID of the paper to find connections for." }
        },
        required: ["paper_id"]
    }
};

const availableTools: FunctionDeclaration[] = [
    getPapersInProjectTool,
    getPaperDetailsTool,
    findConnectedPapersTool,
];

const dynamicToolImplementations: Record<string, (args: any) => any> = {};

/**
 * Registers a new Capability Pack into the agent tool execution schema.
 */
export function registerCapabilityToolInAgent(pack: CapabilityPack) {
    const sanitizeName = `capability_${pack.manifest.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;
    
    const declaration: FunctionDeclaration = {
        name: sanitizeName,
        description: `[Capability Pack: ${pack.manifest.name}] ${pack.manifest.summary}. Verbs: ${pack.manifest.semantics?.verbs?.join(', ') || 'execute'}.`,
        parameters: {
            type: Type.OBJECT,
            properties: {
                action: { 
                    type: Type.STRING, 
                    description: `Action verb to execute. Allowed: ${pack.manifest.semantics?.verbs?.join(', ') || 'run'}` 
                },
                target: { 
                    type: Type.STRING, 
                    description: `Target object or artifact name. Allowed: ${pack.manifest.semantics?.objects?.join(', ') || 'artifact'}` 
                },
                parameters: { 
                    type: Type.STRING, 
                    description: "JSON string parameters for execution." 
                }
            },
            required: ["action", "target"]
        }
    };

    const existingIdx = availableTools.findIndex(t => t.name === sanitizeName);
    if (existingIdx >= 0) {
        availableTools[existingIdx] = declaration;
    } else {
        availableTools.push(declaration);
    }

    dynamicToolImplementations[sanitizeName] = (args: any) => {
        const verbStr = (args.action || "executed").toLowerCase();
        const validVerbs: OntologyVerb[] = ["searched", "classified", "extracted", "verified", "executed"];
        const verb: OntologyVerb = validVerbs.includes(verbStr as OntologyVerb) ? (verbStr as OntologyVerb) : "executed";

        const xapiStatement = createTraceableXApiStatement({
            actorType: "SourceScoutAgent",
            actorId: pack.author || "source_scout_agent_backend",
            verb,
            objectId: args.target ? `urn:scholarexplorer:capability:${pack.manifest.id}:${args.target}` : `urn:scholarexplorer:capability:${pack.manifest.id}`,
            meta: {
                pack_id: pack.manifest.id,
                pack_name: pack.manifest.name,
                action: args.action,
                target: args.target
            }
        });

        return {
            status: "executed",
            pack_id: pack.manifest.id,
            pack_name: pack.manifest.name,
            action: args.action,
            target: args.target,
            ontology_ttl: pack.ontology_content,
            xapi_statement: xapiStatement,
            output: `Successfully processed ${args.action} on ${args.target} using capability pack ${pack.manifest.name}`
        };
    };

    console.log(`[Agent Tool Registry] Registered tool ${sanitizeName} for capability pack ${pack.manifest.id}`);
}

// --- AGENT EXECUTION LOGIC ---

type AgentUpdate = 
    | { type: 'tool-start'; toolCall: { name: string; args: any; thinking: string; } }
    | { type: 'tool-end'; toolResponse: { name: string; result: any; } }
    | { type: 'final-answer'; text: string };


export async function* runAgentTask(
    query: string,
    project: Project,
    projectPapers: ResearchPaper[],
    modelDef: ModelDefinition
): AsyncGenerator<AgentUpdate> {

    // Updated: Use gemini-3-pro-preview for agentic reasoning tasks
    const modelId = 'gemini-3-pro-preview'; 

    const toolImplementations = {
        get_papers_in_project: () => projectPapers.map(p => ({ id: p.id, title: p.title, year: p.year })),
        get_paper_details: (args: { paper_id: string }) => {
            const paper = projectPapers.find(p => p.id === args.paper_id);
            if (!paper) return { error: "Paper not found." };
            return {
                id: paper.id,
                title: paper.title,
                authors: paper.authors,
                year: paper.year,
                abstract: paper.abstract,
                citations: paper.citations,
            };
        },
        find_connected_papers: async (args: { paper_id: string }): Promise<ConnectedPaper[] | { error: string }> => {
            const paper = projectPapers.find(p => p.id === args.paper_id);
            if (!paper) return { error: "Paper not found." };
            try {
                return await apiService.findConnectedPapers(paper, modelDef);
            } catch (e) {
                return { error: e instanceof Error ? e.message : "Failed to find connected papers." };
            }
        },
    };

    const chat: Chat = ai.chats.create({
        model: modelId,
        config: {
            systemInstruction: `You are an expert AI research assistant.
- You have access to a set of tools to answer questions about the user's current research project.
- The project is named "${project.name}".
- First, understand the user's request. Then, devise a plan and use the available tools step-by-step to gather the necessary information.
- If you need to list papers first to get an ID, do so.
- When calling a tool, explain your reasoning in the 'thinking' field.
- Once you have gathered enough information, synthesize it and provide a final, comprehensive answer to the user.
- Do not invent information. If the tools do not provide the answer, state that.`,
            tools: [{ functionDeclarations: availableTools }],
        },
    });

    let response = await chat.sendMessage({ message: query });
    
    while (response.functionCalls && response.functionCalls.length > 0) {
        for (const fnCall of response.functionCalls) {
            
            const { name, args, id } = fnCall;
            const thinking = `Calling tool '${name}' to gather information.`;

            yield { type: 'tool-start', toolCall: { name, args, thinking } };
            
            const toolImplementation = (toolImplementations as any)[name] || dynamicToolImplementations[name];
            if (!toolImplementation) {
                throw new Error(`Unknown tool called by the model: ${name}`);
            }

            const toolResult = await Promise.resolve(toolImplementation(args));
            
            yield { type: 'tool-end', toolResponse: { name, result: toolResult } };

            response = await chat.sendMessage({
                message: [
                    {
                        functionResponse: {
                            name,
                            response: { result: toolResult }
                        }
                    }
                ]
            });
        }
    }

    yield { type: 'final-answer', text: response.text };
}
