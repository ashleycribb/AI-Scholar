// agent-backend/src/agents/researchAdvisorAgent.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Tool } from "@langchain/core/tools";
import {
    OpenAlexSearchTool,
    ArxivSearchTool,
    GenerateHypotheticalAnswerTool,
    GenerateSummaryForPapersTool,
    AnalyzeResearchGapsTool,
    AnalyzeSinglePaperTool,
    ExtractKeyConceptsTool,
    ExtractKnowledgeGraphTool,
    SynthesizePapersTool,
    ExtractCitationMetadataTool,
    RerankForScreeningTool,
    GenerateRAGAnswerTool,
    GeneratePaperBasedSuggestionsTool,
    VerifyClaimTool,
    ExtractFactsTool,
    ReasonOverGraphTool,
    AnalyzeSearchResultsTool
} from "../tools/researchTools";
import { ModelDefinition, AdvancedSearchOptions, SummaryLength, SummaryStyle, ResearchPaper, SearchSourceInfo } from "../types";
import { combineArxivAndOpenAlexResults, calculatePaperScores } from "./utils/paperProcessing"; 
import * as GeminiService from "../services/geminiService";

const DEFAULT_AGENT_MODEL: ModelDefinition = { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' };

class ResearchAdvisorAgent {
    private agentExecutor: AgentExecutor;
    private tools: Tool[];

    constructor() {
        const agentLLM = new ChatGoogleGenerativeAI({
            apiKey: process.env.API_KEY,
            model: DEFAULT_AGENT_MODEL.id,
            temperature: 0.7,
        });

        this.tools = [
            new OpenAlexSearchTool(),
            new ArxivSearchTool(),
            new GenerateHypotheticalAnswerTool(),
            new GenerateSummaryForPapersTool(),
            new AnalyzeResearchGapsTool(),
            new AnalyzeSinglePaperTool(),
            new ExtractKeyConceptsTool(),
            new ExtractKnowledgeGraphTool(),
            new SynthesizePapersTool(),
            new ExtractCitationMetadataTool(),
            new RerankForScreeningTool(),
            new GenerateRAGAnswerTool(),
            new GeneratePaperBasedSuggestionsTool(),
            new VerifyClaimTool(),
            new ExtractFactsTool(),
            new ReasonOverGraphTool(),
            new AnalyzeSearchResultsTool(),
        ];

        const agentPrompt = ChatPromptTemplate.fromMessages([
            ["system", `You are an expert AI Research Assistant. Your goal is to help researchers with their academic literature review and analysis.
            You have access to specialized tools to search academic databases, analyze papers, verify claims, and generate summaries.
            When the user gives you a task, break it down into necessary steps, use the available tools to gather information, and then synthesize a comprehensive answer.
            Always use the specified AI model for content generation tasks, and pass it to the tools that require it.
            `
            ],
            ["human", "{input}"],
            ["placeholder", "{agent_scratchpad}"],
        ]);

        const agent = createOpenAIToolsAgent({
            llm: agentLLM,
            tools: this.tools,
            prompt: agentPrompt,
        });

        this.agentExecutor = new AgentExecutor({
            agent,
            tools: this.tools,
            verbose: true,
        });
    }

    private async handleSearch(payload: any): Promise<any> {
        const { query, options, summaryLength, summaryStyle, model, searchSources } = payload;
        
        // 1. Generate a hypothetical answer for semantic search
        const hypotheticalAnswer = await new GenerateHypotheticalAnswerTool()._call({ userQuery: query, model });
        
        // 2. Search across specified sources
        let allSearchResults: ResearchPaper[] = [];
        if (searchSources.some((s: SearchSourceInfo) => s.id === 'openalex')) {
            const openAlexPapers = await new OpenAlexSearchTool()._call({ query, options });
            allSearchResults.push(...JSON.parse(openAlexPapers));
        }
        if (searchSources.some((s: SearchSourceInfo) => s.id === 'arxiv')) {
            const arxivPapers = await new ArxivSearchTool()._call({ query });
            allSearchResults.push(...JSON.parse(arxivPapers));
        }

        // 3. Process, de-duplicate, and score papers
        let papers: ResearchPaper[] = await combineArxivAndOpenAlexResults(allSearchResults);
        papers = await calculatePaperScores(papers, query, hypotheticalAnswer, model, options);
        
        // 4. Generate overall summary
        const summary: string = await new GenerateSummaryForPapersTool()._call({ papers: papers.slice(0, 5), summaryLength, summaryStyle, model });
        
        // 5. Perform bibliometric and cluster analysis
        const analysis = await new AnalyzeSearchResultsTool()._call({ papers });
        
        return { papers, summary, analysis: JSON.parse(analysis) };
    }

    async runAgent(intent: string, payload: any): Promise<any> {
        try {
            switch (intent) {
                case 'search':
                    return await this.handleSearch(payload);
                
                case 'analyzeGaps':
                    const papersForGaps: ResearchPaper[] = payload.papers;
                    return GeminiService.safeJsonParse(await new AnalyzeResearchGapsTool()._call({ papers: papersForGaps, model: payload.model }));

                case 'analyzeSinglePaper':
                    const paperToAnalyze: ResearchPaper = payload.paper;
                    return GeminiService.safeJsonParse(await new AnalyzeSinglePaperTool()._call({ paper: paperToAnalyze, model: payload.model }));

                case 'extractKeyConcepts':
                    const abstractToExtract: string = payload.abstract;
                    return GeminiService.safeJsonParse(await new ExtractKeyConceptsTool()._call({ abstract: abstractToExtract, model: payload.model }));

                case 'extractKnowledgeGraph':
                    const abstractForGraph: string = payload.abstract;
                    return GeminiService.safeJsonParse(await new ExtractKnowledgeGraphTool()._call({ abstract: abstractForGraph, model: payload.model }));
                
                case 'synthesizePapers':
                    const papersToSynthesize: ResearchPaper[] = payload.papers;
                    return GeminiService.safeJsonParse(await new SynthesizePapersTool()._call({ papers: papersToSynthesize, model: payload.model }));

                case 'extractCitationMetadata':
                    return GeminiService.safeJsonParse(await new ExtractCitationMetadataTool()._call(payload));

                case 'rerankForScreening':
                    const { included, excluded, unscreened, model } = payload;
                    return await Promise.all(unscreened.map(async (paper: ResearchPaper) => {
                        const result = await new RerankForScreeningTool()._call({ included, excluded, paperToRerank: paper, model });
                        const parsed = GeminiService.safeJsonParse(result);
                        return {
                            paperId: paper.id,
                            score: parsed?.score || 0,
                            rationale: parsed?.rationale || "AI re-ranking failed.",
                        };
                    }));
                
                case 'generateSuggestions':
                    return GeminiService.safeJsonParse(await new GeneratePaperBasedSuggestionsTool()._call(payload));
                
                case 'verifyPaper':
                    return GeminiService.safeJsonParse(await new VerifyClaimTool()._call(payload));
                
                case 'chatWithProject':
                    const { query, projectPapers } = payload;
                    const contextChunks = projectPapers.map((p: ResearchPaper) => `Title: ${p.title}\nAbstract: ${p.abstract}`);
                    return await new GenerateRAGAnswerTool()._call({ query, context: contextChunks, model: payload.model });

                default:
                    // Fallback to general agent executor for simpler, direct tool calls if needed
                    const result = await this.agentExecutor.invoke({
                        input: `Execute the intent '${intent}' with the following payload: ${JSON.stringify(payload)}`,
                    });
                    return GeminiService.safeJsonParse(result.output) || result.output;
            }
        } catch (error) {
            console.error(`Error running agent for intent '${intent}':`, error);
            throw new Error(`Agent failed to process your request for '${intent}'. Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}

export const researchAdvisorAgent = new ResearchAdvisorAgent();
