// agent-backend/src/tools/researchTools.ts
import { Tool } from "@langchain/core/tools";
import { z } from "zod";

import * as CrossrefService from "../services/crossrefService";
import * as OpenAlexService from "../services/openAlexService";
import * as ArxivService from "../services/arxivService";
import * as UnpaywallService from "../services/unpaywallService";
import * as GeminiService from "../services/geminiService";
import * as MetadataService from "../services/metadataService";
import * as RetrievalService from "../services/retrievalService";
import * as EntailmentService from "../services/entailmentService";
import * as ScoringService from "../services/scoringService";
import * as CitationServiceBackend from "../services/citationService"; // From old backend's services

import { ResearchPaper, ModelDefinition, AdvancedSearchOptions, SummaryLength, SummaryStyle, PaperAnalysis, SynthesisResult, VerificationResult, CitationStats } from "../types";
import { MIN_EVIDENCE_SPANS_FOR_VERIFIED, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants";


// Define a default model. In a real agent, this would be passed dynamically or configured for the agent.
const DEFAULT_MODEL: ModelDefinition = { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' };

// --- LangChain Tools ---

export class OpenAlexSearchTool extends Tool {
    name = "search_openalex";
    description = "Searches the OpenAlex academic database for research papers. Returns an array of ResearchPaper objects in JSON format.";
    schema = z.object({
        query: z.string().describe("The primary search query for papers."),
        options: z.object({
            startYear: z.string().optional().describe("Optional: Start year for publication date range (e.g., '2020')."),
            endYear: z.string().optional().describe("Optional: End year for publication date range (e.g., '2023')."),
            authors: z.string().optional().describe("Optional: Comma-separated list of author names to filter by."),
        }).partial().optional().describe("Optional: Advanced search options."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const papers = await OpenAlexService.searchOpenAlex(input.query, input.options || {} as AdvancedSearchOptions);
        return JSON.stringify(papers);
    }
}

export class ArxivSearchTool extends Tool {
    name = "search_arxiv";
    description = "Searches the arXiv open-access archive for pre-print and published papers in physics, mathematics, computer science, and related fields. Returns an array of ResearchPaper objects in JSON format.";
    schema = z.object({
        query: z.string().describe("The search query for arXiv papers."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const papers = await ArxivService.searchArxiv(input.query);
        return JSON.stringify(papers);
    }
}

export class FindOpenAccessPdfTool extends Tool {
    name = "find_open_access_pdf";
    description = "Finds a direct URL to a legal, open-access PDF version of a paper using its Digital Object Identifier (DOI). Returns the PDF URL string or null if not found.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper to find the PDF for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string | null> {
        const pdfUrl = await UnpaywallService.findOpenAccessPdf(input.doi);
        return pdfUrl;
    }
}

export class FetchMetadataByDoiTool extends Tool {
    name = "fetch_paper_metadata_by_doi";
    description = "Fetches comprehensive metadata for a single paper using its DOI. Returns a detailed ResearchPaper object in JSON format, or null if not found.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper to fetch metadata for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const paper = await OpenAlexService.searchOpenAlexByDoi(input.doi); // OpenAlex is used in frontend's fetchMetadataByDOI via apiService
        return JSON.stringify(paper);
    }
}

export class FindDoiForPaperTool extends Tool {
    name = "find_doi_for_paper";
    description = "Attempts to find the Digital Object Identifier (DOI) for a paper given its title and authors. Returns the DOI string or null if not found.";
    schema = z.object({
        paper: z.object({
            title: z.string().describe("The title of the paper."),
            authors: z.string().describe("The authors of the paper (comma-separated)."),
        }).describe("The ResearchPaper object (or partial) to find the DOI for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string | null> {
        const doi = await CrossrefService.findDoiForPaper(input.paper as ResearchPaper);
        return doi;
    }
}

export class GenerateHypotheticalAnswerTool extends Tool {
    name = "generate_hypothetical_answer";
    description = "Generates a concise, academic-style hypothetical abstract that directly answers a given research question. Used for semantic search. Returns the hypothetical abstract as a string.";
    schema = z.object({
        userQuery: z.string().describe("The user's research question."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        return await GeminiService.generateHypotheticalAnswer(input.userQuery, input.model as ModelDefinition);
    }
}

export class EvaluateScreeningFitTool extends Tool {
    name = "evaluate_screening_fit";
    description = "Evaluates how well a research paper abstract fits given inclusion and exclusion criteria, returning a JSON object with 'score' (0-100) and 'rationale'.";
    schema = z.object({
        paper: z.object({
            title: z.string(),
            abstract: z.string(),
        }).describe("The research paper to evaluate."),
        inclusionCriteria: z.string().describe("The criteria for including papers."),
        exclusionCriteria: z.string().describe("The criteria for excluding papers."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const result = await GeminiService.evaluateScreeningFit(input.paper as ResearchPaper, input.inclusionCriteria, input.exclusionCriteria, input.model as ModelDefinition);
        return JSON.stringify(result);
    }
}

export class GenerateSummaryForPapersTool extends Tool {
    name = "generate_summary_for_papers";
    description = "Generates an overall summary for a collection of research papers based on their abstracts. Returns the summary as a string.";
    schema = z.object({
        papers: z.array(z.object({
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of research papers to summarize."),
        summaryLength: z.enum(["short", "medium", "detailed"]).optional().default("medium").describe("Desired length of the summary."),
        summaryStyle: z.enum(["paragraph", "bullets", "qa"]).optional().default("paragraph").describe("Desired style of the summary."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        return await GeminiService.generateSummaryForPapers(input.papers as ResearchPaper[], input.summaryLength as SummaryLength, input.summaryStyle as SummaryStyle, input.model as ModelDefinition);
    }
}

export class AnalyzeResearchGapsTool extends Tool {
    name = "analyze_research_gaps";
    description = "Analyzes a collection of research papers to identify research gaps, unanswered questions, and future directions, outputting a markdown report as a string.";
    schema = z.object({
        papers: z.array(z.object({
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of research papers for gap analysis."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        return await GeminiService.analyzeResearchGaps(input.papers as ResearchPaper[], input.model as ModelDefinition);
    }
}

export class AnalyzeSinglePaperTool extends Tool {
    name = "analyze_single_paper";
    description = "Performs a structured analysis of a single research paper, extracting its research question, methodology, key findings, and limitations. Returns a JSON object of type PaperAnalysis.";
    schema = z.object({
        paper: z.object({
            title: z.string(),
            abstract: z.string(),
        }).describe("The research paper to analyze."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const analysisResult = await GeminiService.analyzeSinglePaper(input.paper as ResearchPaper, input.model as ModelDefinition);
        return JSON.stringify(analysisResult);
    }
}

export class ExtractKeyConceptsTool extends Tool {
    name = "extract_key_concepts";
    description = "Extracts the 3-5 most important key concepts or technical terms from a paper's abstract. Returns an array of strings in JSON format.";
    schema = z.object({
        abstract: z.string().describe("The abstract text from which to extract key concepts."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const concepts = await GeminiService.extractKeyConcepts(input.abstract, input.model as ModelDefinition);
        return JSON.stringify(concepts);
    }
}

export class SynthesizePapersTool extends Tool {
    name = "synthesize_papers";
    description = "Synthesizes key information from a collection of research papers into a structured comparative overview. Returns a JSON array of SynthesisResult objects.";
    schema = z.object({
        papers: z.array(z.object({
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of research papers to synthesize."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const synthesisResult = await GeminiService.synthesizePapers(input.papers as ResearchPaper[], input.model as ModelDefinition);
        return JSON.stringify(synthesisResult);
    }
}

export class ExtractCitationMetadataTool extends Tool {
    name = "extract_citation_metadata";
    description = "Extracts and formats citation metadata from a research paper into CSL JSON format, suitable for bibliography generators. Returns a JSON object.";
    schema = z.object({
        paper: z.object({
            title: z.string(),
            authors: z.string(),
            year: z.number(),
            journal: z.string().optional(),
            sourceURL: z.string().optional(),
            doi: z.string().optional(),
        }).describe("The research paper from which to extract citation metadata."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const cslMetadata = await GeminiService.extractCitationMetadata(input.paper as ResearchPaper, input.model as ModelDefinition);
        return JSON.stringify(cslMetadata);
    }
}

export class ClassifyStudyDesignTool extends Tool {
    name = "classify_study_design";
    description = "Classifies the study design of a research paper from its abstract into categories like 'Randomized Controlled Trial', 'Systematic Review', 'Observational Study', 'Qualitative Study', or 'Other'. Returns the classified study design as a string.";
    schema = z.object({
        paper: z.object({
            abstract: z.string(),
        }).describe("The research paper whose study design is to be classified."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        return await GeminiService.classifyStudyDesign(input.paper as ResearchPaper, input.model as ModelDefinition);
    }
}

export class RerankForScreeningTool extends Tool {
    name = "rerank_for_screening";
    description = "Re-ranks unscreened papers based on examples of included and excluded papers provided by the user in a systematic review context. Returns a JSON object with 'score' and 'rationale'.";
    schema = z.object({
        included: z.array(z.object({
            id: z.string(),
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of papers explicitly marked as 'included' by the user."),
        excluded: z.array(z.object({
            id: z.string(),
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of papers explicitly marked as 'excluded' by the user."),
        paperToRerank: z.object({
            id: z.string(),
            title: z.string(),
            abstract: z.string(),
        }).describe("The unscreened paper to be re-ranked."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const result = await GeminiService.rerankByScreeningExample(
            input.included as ResearchPaper[],
            input.excluded as ResearchPaper[],
            input.paperToRerank as ResearchPaper,
            input.model as ModelDefinition
        );
        return JSON.stringify(result);
    }
}

export class GenerateRAGAnswerTool extends Tool {
    name = "generate_rag_answer";
    description = "Generates an answer to a user's question by synthesizing information *only* from provided context snippets (e.g., abstracts from a project). Returns the answer as a string.";
    schema = z.object({
        query: z.string().describe("The user's question to answer."),
        context: z.array(z.string()).describe("An array of context strings (e.g., paper abstracts) from which to derive the answer."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        return await GeminiService.generateRAGAnswer(input.query, input.context, input.model as ModelDefinition);
    }
}

export class GeneratePaperBasedSuggestionsTool extends Tool {
    name = "generate_paper_based_suggestions";
    description = "Generates new search query suggestions based on a seed research paper's title and abstract to find related or follow-up research. Returns an array of suggested queries in JSON format.";
    schema = z.object({
        paper: z.object({
            title: z.string(),
            abstract: z.string(),
        }).describe("The seed research paper to base suggestions on."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const suggestions = await GeminiService.generatePaperBasedSuggestions(input.paper as ResearchPaper, input.model as ModelDefinition);
        return JSON.stringify(suggestions);
    }
}

export class AnalyzeCitationsTool extends Tool {
    name = "analyze_citations";
    description = "Fetches citation contexts and computes simple support/contradict counts for a given DOI. Returns a JSON object of type CitationStats.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper to analyze citations for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const stats = await CitationServiceBackend.analyzeCitations(input.doi);
        return JSON.stringify(stats);
    }
}

export class FetchMetadataForVACS extends Tool {
    name = "fetch_metadata_for_vacs";
    description = "Fetches comprehensive metadata for a paper by DOI, including temporal and credibility scores, for VACS calculation. Returns a JSON object of type Metadata.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper to fetch VACS metadata for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const metadata = await MetadataService.fetchMetadataByDOI(input.doi);
        return JSON.stringify(metadata);
    }
}

export class FindSupportingPassagesTool extends Tool {
    name = "find_supporting_passages";
    description = "For a given DOI and claim, retrieves and scores candidate text passages from the paper's full text or abstract that might support the claim. Returns an array of EvidenceSpan objects in JSON format.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper."),
        claim: z.string().describe("The claim to find supporting passages for."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const passages = await RetrievalService.findSupportingPassages(input.doi, input.claim);
        return JSON.stringify(passages);
    }
}

export class CheckEntailmentTool extends Tool {
    name = "check_entailment";
    description = "Calls an entailment model to check if a given passage supports a claim, returning a verdict ('SUPPORT', 'REFUTE', 'NEI') and a confidence score. Returns a JSON object with 'verdict' and 'confidence'.";
    schema = z.object({
        claim: z.string().describe("The claim to check entailment against."),
        passage: z.string().describe("The passage of text to evaluate."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const result = await EntailmentService.checkEntailment(input.claim, input.passage);
        return JSON.stringify(result);
    }
}

export class ComputeVACSTool extends Tool {
    name = "compute_vacs";
    description = "Computes the VACS (Veracity, Accuracy, Credibility Score) based on paper metadata, citation statistics, and supporting evidence spans. Returns a JSON object of type VerificationResult.";
    schema = z.object({
        meta: z.any().describe("The metadata object for the paper (type Metadata)."),
        citationStats: z.any().describe("Citation statistics for the paper (type CitationStats)."),
        evidenceSpans: z.array(z.any()).describe("An array of scored evidence passages (type EvidenceSpan[])."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const result = ScoringService.computeVACS(input.meta, input.citationStats, input.evidenceSpans);
        return JSON.stringify(result);
    }
}

// Tool: Verify Claim (VACS) - This wraps the entire old backend logic
// This tool combines multiple sub-tools to perform the full VACS verification process.
export class VerifyClaimTool extends Tool {
    name = "verify_claim";
    description = "Performs an advanced verification of a specific claim against a research paper using its DOI, assessing veracity, accuracy, and credibility (VACS). Returns a JSON object of type VerificationResult.";
    schema = z.object({
        doi: z.string().describe("The DOI of the paper to verify."),
        claimText: z.string().describe("The specific claim from the paper (or about the paper) to verify."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        try {
            const meta = await MetadataService.fetchMetadataByDOI(input.doi);
            const claim = input.claimText.trim() || meta.title || 'Main claim of the paper';
            
            const candidatePassages = await RetrievalService.findSupportingPassages(input.doi, claim);
            
            const evidenceResults = [];
            if (candidatePassages.length > 0) {
                const entailmentPromises = candidatePassages.map(p => 
                    EntailmentService.checkEntailment(claim, p.passage).then(ent => ({...p, ...ent}))
                );
                const allEntailments = await Promise.all(entailmentPromises);
                
                for (const p of allEntailments) {
                    if (p.verdict === 'SUPPORT' && p.confidence >= MIN_SUPPORT_EVIDENCE_CONFIDENCE) {
                        evidenceResults.push({
                            source: p.source,
                            passage: p.passage,
                            score: p.confidence
                        });
                    }
                }
            }

            const citationStats = await CitationServiceBackend.analyzeCitations(input.doi);
            
            const result: VerificationResult = ScoringService.computeVACS(meta, citationStats, evidenceResults);

            if (result.verdict === 'Verified' && result.evidence.length < MIN_EVIDENCE_SPANS_FOR_VERIFIED) {
              result.verdict = 'Inconclusive';
              result.rationale.push('Verdict changed to Inconclusive: Not enough supporting evidence found.');
            }

            return JSON.stringify(result);

        } catch (e: any) {
            console.error('VerifyClaimTool error', e);
            throw new Error(e.message || 'Unknown error during claim verification');
        }
    }
}