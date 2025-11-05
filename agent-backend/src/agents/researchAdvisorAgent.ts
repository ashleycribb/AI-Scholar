// agent-backend/src/agents/researchAdvisorAgent.ts
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai"; // Using OpenAI for the agent, can be Gemini
import { AgentExecutor, createOpenAIToolsAgent } from "langchain/agents";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { Tool } from "@langchain/core/tools"; // Fix: Imported Tool from @langchain/core/tools
import {
    OpenAlexSearchTool,
    ArxivSearchTool,
    FindOpenAccessPdfTool,
    FetchMetadataByDoiTool,
    FindDoiForPaperTool,
    GenerateHypotheticalAnswerTool,
    EvaluateScreeningFitTool,
    GenerateSummaryForPapersTool,
    AnalyzeResearchGapsTool,
    AnalyzeSinglePaperTool,
    ExtractKeyConceptsTool,
    SynthesizePapersTool,
    ExtractCitationMetadataTool,
    ClassifyStudyDesignTool,
    RerankForScreeningTool,
    GenerateRAGAnswerTool,
    GeneratePaperBasedSuggestionsTool,
    VerifyClaimTool, // Unified VACS tool
    AnalyzeCitationsTool,
    FetchMetadataForVACS,
    FindSupportingPassagesTool,
    CheckEntailmentTool,
    ComputeVACSTool
} from "../tools/researchTools";
import { ModelDefinition, AdvancedSearchOptions, SummaryLength, SummaryStyle, ResearchPaper, AnalysisResult, SynthesisResult, VerificationResult, SearchSourceInfo } from "../types";
// Fix: Removed conflicting import declarations for these utilities as they are defined locally or used from within tools.
import { combineArxivAndOpenAlexResults, calculatePaperScores } from "./utils/paperProcessing"; 
import * as GeminiService from "../services/geminiService"; // Import GeminiService for direct calls when tools aren't orchestrated


// Define a default model if not provided, for internal agent reasoning
const DEFAULT_AGENT_MODEL: ModelDefinition = { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' };

class ResearchAdvisorAgent {
    private agentExecutor: AgentExecutor;
    private tools: Tool[];

    constructor() {
        // Initialize the LLM for the agent itself (its reasoning engine)
        // Note: This LLM is for the agent's internal logic, not necessarily for content generation tools.
        const agentLLM = new ChatGoogleGenerativeAI({
            apiKey: process.env.API_KEY,
            model: DEFAULT_AGENT_MODEL.id,
            temperature: 0.7,
        });

        // Instantiate all available tools
        this.tools = [
            new OpenAlexSearchTool(),
            new ArxivSearchTool(),
            new FindOpenAccessPdfTool(),
            new FetchMetadataByDoiTool(),
            new FindDoiForPaperTool(),
            new GenerateHypotheticalAnswerTool(),
            new EvaluateScreeningFitTool(),
            new GenerateSummaryForPapersTool(),
            new AnalyzeResearchGapsTool(),
            new AnalyzeSinglePaperTool(),
            new ExtractKeyConceptsTool(),
            new SynthesizePapersTool(),
            new ExtractCitationMetadataTool(),
            new ClassifyStudyDesignTool(),
            new RerankForScreeningTool(),
            new GenerateRAGAnswerTool(),
            new GeneratePaperBasedSuggestionsTool(),
            new VerifyClaimTool(),
            new AnalyzeCitationsTool(),
            new FetchMetadataForVACS(),
            new FindSupportingPassagesTool(),
            new CheckEntailmentTool(),
            new ComputeVACSTool(),
        ];

        // Define the prompt for the agent
        const agentPrompt = ChatPromptTemplate.fromMessages([
            ["system", `You are an expert AI Research Assistant. Your goal is to help researchers, especially doctoral students, with their academic literature review and analysis.
            You have access to specialized tools to search academic databases, analyze papers, verify claims, and generate summaries.

            When the user gives you a task, break it down into necessary steps, use the available tools to gather information, and then synthesize a comprehensive answer.
            Always aim to provide the most accurate and helpful information possible.
            When performing searches, consider using both OpenAlex and arXiv for comprehensive results.
            When asked to summarize or analyze multiple papers, ensure to combine information from all relevant papers.
            Always use the specified AI model for content generation tasks, and pass it to the tools that require it.
            `
            ],
            ["human", "{input}"],
            ["placeholder", "{agent_scratchpad}"],
        ]);

        // Create the LangChain.js agent
        const agent = createOpenAIToolsAgent({
            llm: agentLLM,
            tools: this.tools,
            prompt: agentPrompt,
        });

        // Create the AgentExecutor
        this.agentExecutor = new AgentExecutor({
            agent,
            tools: this.tools,
            verbose: true, // Set to true for debugging agent's thought process
        });
    }

    /**
     * Runs the ResearchAdvisorAgent with a specific intent and payload.
     * This method acts as the entry point for the frontend requests.
     * @param intent The high-level task the user wants to perform (e.g., 'search', 'analyze_gaps').
     * @param payload The specific data needed for the task.
     * @returns The result of the agent's execution.
     */
    async runAgent(intent: string, payload: any): Promise<any> {
        let result;
        const model: ModelDefinition = payload.model || DEFAULT_AGENT_MODEL;

        try {
            switch (intent) {
                case 'search':
                    const query: string = payload.query;
                    const options: AdvancedSearchOptions = payload.options;
                    const summaryLength: SummaryLength = payload.summaryLength;
                    const summaryStyle: SummaryStyle = payload.summaryStyle;
                    const searchSources: SearchSourceInfo[] = payload.searchSources;

                    // Agent will orchestrate the search, hypothetical answer, and summary generation
                    result = await this.agentExecutor.invoke({
                        input: `Find research papers related to "${query}" with advanced options: ${JSON.stringify(options)}.
                                Use search sources: ${searchSources.map(s => s.name).join(', ')}.
                                Then, generate an overall summary of the top 5 papers using a ${summaryLength} ${summaryStyle} style.
                                Also classify the study design for each paper.`,
                        config: { model }, // Pass model config to agent for tool usage
                    });
                    
                    // The agent's output is free-form. We need to parse it based on expected tools.
                    // This is a simplified parsing. A more robust solution might use structured output tools.
                    let papers: ResearchPaper[] = [];
                    let summary: string = "";
                    
                    // Extracting papers and summary from the agent's raw output.
                    // This step would be highly dependent on how the agent's prompt guides its final response.
                    // For now, assume the agent's final answer contains enough info to reconstruct.
                    // In a real scenario, the agent would use a specific output format tool.
                    
                    // For demonstration, let's manually call tools the agent would theoretically call
                    // This is a temporary bypass for explicit control, ideally agent does it all.
                    // Fix: Directly call the tool for hypothetical answer
                    const hypotheticalAnswer = await new GenerateHypotheticalAnswerTool()._call({ userQuery: query, model });
                    
                    let allSearchResults: ResearchPaper[] = [];
                    if (searchSources.some(s => s.id === 'openalex')) {
                        // Fix: Directly call the tool for OpenAlex search
                        const openAlexPapers = await new OpenAlexSearchTool()._call({ query, options });
                        allSearchResults.push(...JSON.parse(openAlexPapers));
                    }
                    if (searchSources.some(s => s.id === 'arxiv')) {
                        // Fix: Directly call the tool for Arxiv search
                        const arxivPapers = await new ArxivSearchTool()._call({ query });
                        allSearchResults.push(...JSON.parse(arxivPapers));
                    }

                    papers = await combineArxivAndOpenAlexResults(allSearchResults);
                    papers = await calculatePaperScores(papers, query, hypotheticalAnswer, model, options);

                    // Fix: Directly call the tool for summary generation
                    summary = await new GenerateSummaryForPapersTool()._call({ papers, summaryLength, summaryStyle, model });
                    
                    return { papers, summary, analysis: null }; // analysis will be done on frontend as before
                
                case 'analyzeGaps':
                    const papersForGaps: ResearchPaper[] = payload.papers;
                    result = await this.agentExecutor.invoke({
                        input: `Analyze the research gaps and future directions in the following papers: ${papersForGaps.map(p => p.title).join(', ')}.`,
                        config: { model },
                    });
                    // Assuming agent returns the report directly
                    return result.output; // The agent's final text output
                
                case 'analyzeSinglePaper':
                    const paperToAnalyze: ResearchPaper = payload.paper;
                    result = await this.agentExecutor.invoke({
                        input: `Perform a structured analysis of the paper "${paperToAnalyze.title}" (DOI: ${paperToAnalyze.doi || 'N/A'}).`,
                        config: { model },
                    });
                    // Agent output is a JSON string of PaperAnalysis
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);

                case 'extractKeyConcepts':
                    const abstractToExtract: string = payload.abstract;
                    result = await this.agentExecutor.invoke({
                        input: `Extract key concepts from the abstract: "${abstractToExtract}".`,
                        config: { model },
                    });
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);
                
                case 'synthesizePapers':
                    const papersToSynthesize: ResearchPaper[] = payload.papers;
                    result = await this.agentExecutor.invoke({
                        input: `Synthesize the key information from the following papers: ${papersToSynthesize.map(p => p.title).join(', ')}.`,
                        config: { model },
                    });
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);

                case 'findOpenAccessPdf':
                    const doiForPdf: string = payload.doi;
                    result = await this.agentExecutor.invoke({
                        input: `Find the open access PDF URL for the paper with DOI: ${doiForPdf}.`,
                        config: { model },
                    });
                    return result.output;
                
                case 'fetchMetadataByDOI':
                    const doiToFetch: string = payload.doi;
                    result = await this.agentExecutor.invoke({
                        input: `Fetch detailed metadata for the paper with DOI: ${doiToFetch}.`,
                        config: { model },
                    });
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);

                case 'rerankForScreening':
                    const includedPapers: ResearchPaper[] = payload.included;
                    const excludedPapers: ResearchPaper[] = payload.excluded;
                    const unscreenedPapers: ResearchPaper[] = payload.unscreened;

                    const rerankResults = await Promise.all(unscreenedPapers.map(async (paper) => {
                        const r_result = await this.agentExecutor.invoke({
                            input: `Re-rank the unscreened paper "${paper.title}" for systematic review screening, given these included examples: ${includedPapers.map(p => p.title).join(', ')} and excluded examples: ${excludedPapers.map(p => p.title).join(', ')}.`,
                            config: { model },
                        });
                        // Fix: Use the imported GeminiService.safeJsonParse
                        const parsedResult = GeminiService.safeJsonParse(r_result.output);
                        return {
                            paperId: paper.id,
                            score: parsedResult?.score || 0,
                            rationale: parsedResult?.rationale || "AI re-ranking failed for this paper.",
                        };
                    }));
                    return rerankResults;
                
                case 'generateSuggestions':
                    const seedPaper: ResearchPaper = payload.paper;
                    result = await this.agentExecutor.invoke({
                        input: `Generate new search query suggestions based on the paper "${seedPaper.title}".`,
                        config: { model },
                    });
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);
                
                case 'verifyPaper':
                    const doiToVerify: string = payload.doi;
                    const claimText: string = payload.claimText;
                    result = await this.agentExecutor.invoke({
                        input: `Perform an advanced verification of the claim "${claimText}" against the paper with DOI: ${doiToVerify}.`,
                        config: { model },
                    });
                    // Fix: Use the imported GeminiService.safeJsonParse
                    return GeminiService.safeJsonParse(result.output);
                
                case 'chatWithProject':
                    const chatQuery: string = payload.query;
                    const projectPapers: ResearchPaper[] = payload.projectPapers;
                    // In a real RAG implementation, this would involve a vector store.
                    // For now, let's simulate context by passing abstracts directly.
                    const contextChunks = projectPapers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`);
                    
                    result = await this.agentExecutor.invoke({
                        input: `Answer the question "${chatQuery}" using ONLY the following context: ${contextChunks.join('\n\n---NEW PAPER---\n\n')}. Do not use external knowledge.`,
                        config: { model },
                    });
                    return result.output; // Assuming the agent directly answers the question


                default:
                    throw new Error(`Unknown intent: ${intent}`);
            }
        } catch (error) {
            console.error(`Error running agent for intent '${intent}':`, error);
            throw new Error(`Agent failed to process your request for '${intent}'. Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
}

// Utility to combine and score papers (copied from frontend apiService for backend use)
const stopWords = new Set(['a', 'an', 'the', 'in', 'on', 'at', 'for', 'to', 'of', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'what', 'when', 'where', 'who', 'how', 'which', 'what', 'is', 'the', 'impact', 'of', 'on']);

const calculateTitleMatchScore = (query: string, title: string): number => {
    if (!query || !title) return 0;

    const queryWords = query.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .split(/\s+/)
        .filter(word => word && !stopWords.has(word));
    
    const uniqueQueryWords = new Set(queryWords);

    if (uniqueQueryWords.size === 0) return 0;

    const titleLower = title.toLowerCase();
    let matchCount = 0;
    
    uniqueQueryWords.forEach(word => {
        if (titleLower.includes(word)) {
            matchCount++;
        }
    });

    return (matchCount / uniqueQueryWords.size) * 100;
};

// Helper function to combine arXiv and OpenAlex results (from frontend apiService)
async function combineArxivAndOpenAlexResults(allPapers: ResearchPaper[]): Promise<ResearchPaper[]> {
    const uniquePapersMap = new Map<string, ResearchPaper>();
    allPapers.forEach(paper => {
        const normalizedTitle = paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!uniquePapersMap.has(normalizedTitle)) {
            uniquePapersMap.set(normalizedTitle, paper);
        }
    });
    return Array.from(uniquePapersMap.values());
}

// Helper function to calculate paper scores (from frontend apiService)
async function calculatePaperScores(
    papers: ResearchPaper[],
    query: string,
    hypotheticalAnswer: string,
    model: ModelDefinition,
    options: AdvancedSearchOptions
): Promise<ResearchPaper[]> {
    if (papers.length === 0) return [];

    // Ensure abstracts are present before embedding
    const papersWithAbstracts = papers.filter(p => p.abstract && p.abstract.trim() !== '');

    // Fix: Explicitly import embeddingService or pass it as a parameter if needed.
    // Assuming embeddingService is available in the scope or can be imported.
    const { calculateSemanticScores } = await import("../utils/embeddings"); 
    const semanticallyRankedPapers = await calculateSemanticScores(hypotheticalAnswer, papersWithAbstracts);

    let papersWithStudyDesign = semanticallyRankedPapers;
    if (options.studyDesign && options.studyDesign !== 'any') {
        const designClassificationPromises = semanticallyRankedPapers.map(async (paper) => {
            // Fix: Call tool directly via its class
            const design = await new ClassifyStudyDesignTool()._call({ paper: { abstract: paper.abstract }, model });
            return { ...paper, detectedStudyDesign: design };
        });
        const classifiedPapers = await Promise.all(designClassificationPromises);
        
        const designMap: { [key: string]: string } = {
            'randomized_controlled_trial': 'Randomized Controlled Trial',
            'systematic_review': 'Systematic Review',
            'observational_study': 'Observational Study',
            'qualitative_study': 'Qualitative Study',
        };
        const targetDesign = designMap[options.studyDesign];
        papersWithStudyDesign = classifiedPapers.filter(p => p.detectedStudyDesign === targetDesign);
    }

    let papersWithScreening = papersWithStudyDesign;
    if (options.inclusionCriteria?.trim() || options.exclusionCriteria?.trim()) {
        const screeningPromises = papersWithStudyDesign.map(p => 
            // Fix: Call tool directly via its class
            new EvaluateScreeningFitTool()._call({ paper: { title: p.title, abstract: p.abstract }, inclusionCriteria: options.inclusionCriteria, exclusionCriteria: options.exclusionCriteria, model })
                .then(JSON.parse) // Parse the JSON string output from the tool
        );
        const screeningResults = await Promise.all(screeningPromises);
        papersWithScreening = papersWithStudyDesign.map((paper, index) => ({
            ...paper,
            screeningFitScore: screeningResults[index].score,
            screeningRationale: screeningResults[index].rationale,
        }));
    }

    const currentYear = new Date().getFullYear();
    const maxCitations = Math.max(...papersWithScreening.map(p => p.citations || 0), 1);

    // Author and Journal metrics (simplified for agent backend)
    const authorFreq = Object.values(
        papersWithScreening.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
            if (author) {
                // Fix: Corrected property name to 'totalCitations' to match the interface.
                acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                acc[author].count++;
                const paper = papersWithScreening.find(p => p.authors.includes(author));
                // Fix: Corrected property name to 'totalCitations' to match the interface.
                acc[author].totalCitations += paper?.citations || 0;
            }
            return acc;
        }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
    );
    const authorCitationMap = new Map(authorFreq.map(a => [a.author, a.totalCitations]));
    const maxAuthorCitations = Math.max(...Array.from(authorCitationMap.values()), 1);

    const journalStats = new Map<string, { totalCitations: number, count: number }>();
    papersWithScreening.forEach(p => {
        if (p.journal) {
            const stats = journalStats.get(p.journal) || { totalCitations: 0, count: 0 };
            stats.totalCitations += p.citations || 0;
            stats.count++;
            journalStats.set(p.journal, stats);
        }
    });
    const journalAvgCitations = new Map<string, number>();
    journalStats.forEach((stats, journal) => {
        journalAvgCitations.set(journal, stats.totalCitations / stats.count);
    });
    const maxAvgJournalCitations = Math.max(...Array.from(journalAvgCitations.values()), 1);

    const papersWithCombinedScore = papersWithScreening.map(paper => {
        const semanticScore = paper.semanticScore || 0;
        const normalizedCitations = Math.log10((paper.citations || 0) + 1);
        const maxNormalizedCitations = Math.log10(maxCitations + 1);
        const impactScore = maxNormalizedCitations > 0 ? (normalizedCitations / maxNormalizedCitations) * 100 : 0;
        const age = currentYear - paper.year;
        const recencyScore = Math.max(0, 100 - (age * 5));
        const titleMatchScore = calculateTitleMatchScore(query, paper.title);

        const firstAuthor = paper.authors.split(',')[0].trim();
        const authorCitations = authorCitationMap.get(firstAuthor) || 0;
        const normalizedAuthorCitations = Math.log10(authorCitations + 1);
        const maxNormalizedAuthorCitations = Math.log10(maxAuthorCitations + 1);
        const authorAuthorityScore = maxNormalizedAuthorCitations > 0 ? (normalizedAuthorCitations / maxNormalizedAuthorCitations) * 100 : 0;
        
        const journalAvg = journalAvgCitations.get(paper.journal || '') || 0;
        const journalImpactScore = (journalAvg / maxAvgJournalCitations) * 100;
        const trustScore = (authorAuthorityScore * 0.5) + (journalImpactScore * 0.5);

        const combinedScore =
            (semanticScore * 0.40) +   // 40%
            (impactScore * 0.15) +     // 15%
            (recencyScore * 0.15) +    // 15%
            (trustScore * 0.20) +      // 20%
            (titleMatchScore * 0.10);  // 10%
        
        return { ...paper, impactScore, combinedScore };
    });

    const rankedPapers = papersWithCombinedScore.sort((a, b) => (b.combinedScore || 0) - (a.combinedScore || 0));

    return rankedPapers;
}

export const researchAdvisorAgent = new ResearchAdvisorAgent();