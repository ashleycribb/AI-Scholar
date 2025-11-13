// agent-backend/src/tools/researchTools.ts
import { Tool } from "@langchain/core/tools";
import { z } from "zod";

import * as CrossrefService from "../services/crossrefService.js";
import * as OpenAlexService from "../services/openAlexService.js";
import * as ArxivService from "../services/arxivService.js";
import * as UnpaywallService from "../services/unpaywallService.js";
import * as AiService from "../services/aiService.js";
import * as MetadataService from "../services/metadataService.js";
import * as RetrievalService from "../services/retrievalService.js";
import * as EntailmentService from "../services/entailmentService.js";
import * as ScoringService from "../services/scoringService.js";
import * as CitationServiceBackend from "../services/citationService.js"; // From old backend's services

import { ResearchPaper, ModelDefinition, AdvancedSearchOptions, SummaryLength, SummaryStyle, PaperAnalysis, SynthesisResult, VerificationResult, CitationStats, KnowledgeGraph, Entity, AuthorFrequencyData, PublicationYearData, Cluster, GraphNode, GraphEdge, AnalysisResult } from "../types/index.js";
import { MIN_EVIDENCE_SPANS_FOR_VERIFIED, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from "../utils/constants.js";
import { Type } from "@google/genai";


// Define a default model. In a real agent, this would be passed dynamically or configured for the agent.
const DEFAULT_MODEL: ModelDefinition = { id: 'gemini-2.5-flash', name: 'Gemini Flash', provider: 'gemini' };

// --- Phase 3: Neuro-Symbolic Types ---
interface Fact {
    subject: string;
    predicate: string;
    object: string;
    source_paper: string;
}

interface LogicalFindings {
    contradictions: { fact1: Fact; fact2: Fact }[];
    unexplored_areas: { area: string; details: string }[];
}


// --- Phase 3: New Tools ---

export class ExtractFactsTool extends Tool {
    name = "extract_logical_facts";
    description = "Extracts logical propositions (subject, predicate, object triples) from a given text abstract, associating them with a source paper title. Returns a JSON array of Fact objects.";
    schema = z.object({
        abstract: z.string().describe("The abstract text from which to extract facts."),
        paper_title: z.string().describe("The title of the paper, to be used as a primary subject for the facts."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const prompt = `You are a logic engine. From the following text, extract all logical propositions in the format of (Subject, Predicate, Object). The main subject of many facts should be the paper's title itself.

        **Example Predicates:**
        - 'uses_methodology'
        - 'investigates_concept'
        - 'reports_finding'
        - 'is_type_of'
        - 'supports'
        - 'contradicts'
        - 'is_limitation_of'
        
        **Paper Title:** "${input.paper_title}"
        **Abstract:** "${input.abstract}"
        
        Return a single JSON object with a key "facts", which is an array of objects, each with "subject", "predicate", "object", and "source_paper" keys. The "source_paper" should always be the provided title.`;

        const factsSchema = {
            type: Type.OBJECT,
            properties: {
                facts: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            subject: { type: Type.STRING },
                            predicate: { type: Type.STRING },
                            object: { type: Type.STRING },
                            source_paper: { type: Type.STRING },
                        },
                        required: ["subject", "predicate", "object", "source_paper"],
                    },
                },
            },
            required: ["facts"],
        };
        
        const result = await AiService.generateJsonWithModel(prompt, input.model, factsSchema);
        return JSON.stringify(result?.facts || []);
    }
}

export class ReasonOverGraphTool extends Tool {
    name = "reason_over_logical_facts";
    description = "Analyzes a collection of logical facts (triples) to find contradictions and unexplored connections. This is a code-based tool and does not call an LLM. Returns a JSON object of type LogicalFindings.";
    schema = z.object({
        facts: z.array(z.object({
            subject: z.string(),
            predicate: z.string(),
            object: z.string(),
            source_paper: z.string(),
        })).describe("An array of all facts extracted from multiple papers."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const facts: Fact[] = input.facts;
        const findings: LogicalFindings = { contradictions: [], unexplored_areas: [] };

        // 1. Contradiction Logic
        const factGroups = new Map<string, Fact[]>();
        facts.forEach(fact => {
            const key = `${fact.predicate.replace(/s$/, '')}|${fact.object.toLowerCase()}`;
            if (!factGroups.has(key)) factGroups.set(key, []);
            factGroups.get(key)!.push(fact);
        });

        const contradictionPairs = new Set(['supports|contradicts', 'proves|disproves']);
        for (const [key, group] of factGroups.entries()) {
            const predicate = key.split('|')[0];
            for (const pair of contradictionPairs) {
                if (pair.includes(predicate)) {
                    const oppositePredicate = pair.replace(predicate, '').replace('|', '');
                    const oppositeKey = `${oppositePredicate}|${key.split('|')[1]}`;
                    const oppositeGroup = factGroups.get(oppositeKey);

                    if (oppositeGroup) {
                        for (const fact1 of group) {
                            for (const fact2 of oppositeGroup) {
                                if (fact1.source_paper !== fact2.source_paper) {
                                    findings.contradictions.push({ fact1, fact2 });
                                }
                            }
                        }
                        // Avoid double counting
                        factGroups.delete(oppositeKey);
                    }
                }
            }
        }
        
        // 2. Unexplored Area Logic
        const concepts = new Set<string>();
        const methodologies = new Set<string>();
        const conceptMethodologyPairs = new Set<string>();

        facts.forEach(fact => {
            if (fact.predicate === 'investigates_concept') concepts.add(fact.object);
            if (fact.predicate === 'uses_methodology') {
                methodologies.add(fact.object);
                // Assume subject is a concept being studied
                conceptMethodologyPairs.add(`${fact.subject}|${fact.object}`);
            }
        });
        
        for (const concept of concepts) {
            for (const methodology of methodologies) {
                if (!conceptMethodologyPairs.has(`${concept}|${methodology}`)) {
                    const allSubjects = facts.filter(f => f.object === concept).map(f => f.subject);
                    if (!allSubjects.some(subj => conceptMethodologyPairs.has(`${subj}|${methodology}`))) {
                         findings.unexplored_areas.push({
                            area: `Unexplored Connection`,
                            details: `The concept '${concept}' has not been investigated using the methodology '${methodology}' in this set of papers.`,
                        });
                    }
                }
            }
        }


        return JSON.stringify(findings);
    }
}

export class AnalyzeSearchResultsTool extends Tool {
    name = "analyze_search_results";
    description = "Performs bibliometric and cluster analysis on a list of search results. Returns an AnalysisResult object in JSON format.";
    schema = z.object({
        papers: z.array(z.object({
            id: z.string(),
            title: z.string(),
            authors: z.string(),
            year: z.number(),
            abstract: z.string(),
            citations: z.number().optional(),
        })).describe("An array of research papers to analyze."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const papers = input.papers as ResearchPaper[];
        
        const topAuthors: AuthorFrequencyData = Object.values(
            papers.flatMap(p => p.authors.split(',').map(a => a.trim())).reduce((acc, author) => {
                if (author) {
                    acc[author] = acc[author] || { author, count: 0, totalCitations: 0 };
                    acc[author].count++;
                    const paper = papers.find(p => p.authors.includes(author));
                    acc[author].totalCitations += paper?.citations || 0;
                }
                return acc;
            }, {} as { [author: string]: { author: string, count: number, totalCitations: number } })
        );

        const publicationYears: PublicationYearData = Object.values(
            papers.reduce((acc, p) => {
                if(p.year) {
                    acc[p.year] = acc[p.year] || { year: p.year, count: 0 };
                    acc[p.year].count++;
                }
                return acc;
            }, {} as { [year: number]: { year: number, count: number } })
        ).sort((a,b) => a.year - b.year);

        const tokenize = (text: string): string[] => {
            if (!text) return [];
            return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
        };
        const stopwords = new Set(['i', 'me', 'my', 'myself', 'we', 'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'a', 'an', 'the', 'and', 'but', 'if', 'or', 'because', 'as', 'until', 'while', 'of', 'at', 'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now', 'd', 'll', 'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn', 'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn', 'wasn', 'weren', 'won', 'wouldn', 'am', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing']);
        const euclideanDistance = (a: number[], b: number[]): number => {
            let sum = 0;
            for (let i = 0; i < a.length; i++) {
                sum += (a[i] - b[i]) ** 2;
            }
            return Math.sqrt(sum);
        };
        const simpleKMeans = (data: number[][], k: number, maxIterations = 50) => {
            if (data.length < k || data.length === 0) {
                return { clusters: data.map((_, i) => i), centroids: data };
            }
            let centroids = data.slice().sort(() => 0.5 - Math.random()).slice(0, k);
            let assignments: number[] = new Array(data.length);
            for (let iter = 0; iter < maxIterations; iter++) {
                for (let i = 0; i < data.length; i++) {
                    let minDistance = Infinity;
                    let closestCentroidIndex = -1;
                    for (let j = 0; j < centroids.length; j++) {
                        const distance = euclideanDistance(data[i], centroids[j]);
                        if (distance < minDistance) {
                            minDistance = distance;
                            closestCentroidIndex = j;
                        }
                    }
                    assignments[i] = closestCentroidIndex;
                }
                const newCentroids: number[][] = Array.from({ length: k }, () => new Array(data[0].length).fill(0));
                const clusterCounts: number[] = new Array(k).fill(0);
                for (let i = 0; i < data.length; i++) {
                    const clusterIndex = assignments[i];
                    if (clusterIndex !== -1) {
                        for (let d = 0; d < data[i].length; d++) {
                            newCentroids[clusterIndex][d] += data[i][d];
                        }
                        clusterCounts[clusterIndex]++;
                    }
                }
                for (let i = 0; i < k; i++) {
                    if (clusterCounts[i] > 0) {
                        for (let d = 0; d < newCentroids[i].length; d++) {
                            newCentroids[i][d] /= clusterCounts[i];
                        }
                    } else {
                        newCentroids[i] = data[Math.floor(Math.random() * data.length)];
                    }
                }
                const hasConverged = centroids.every((c, i) => c.every((val, d) => val === newCentroids[i][d]));
                centroids = newCentroids;
                if(hasConverged) break;
            }
            return { clusters: assignments, centroids };
        };

        const documents = papers.map(p => p.abstract || '');
        const tokenizedDocs = documents.map(doc => tokenize(doc).filter(word => !stopwords.has(word)));
        const vocab = new Set<string>();
        const docFreq = new Map<string, number>();
        tokenizedDocs.forEach(doc => {
            const seenWords = new Set<string>();
            doc.forEach(word => {
                vocab.add(word);
                if (!seenWords.has(word)) {
                    docFreq.set(word, (docFreq.get(word) || 0) + 1);
                    seenWords.add(word);
                }
            });
        });
        const vocabArray = Array.from(vocab);
        const vocabIndexMap = new Map(vocabArray.map((word, i) => [word, i]));
        const idf = new Map<string, number>();
        const numDocs = documents.length;
        vocabArray.forEach(word => {
            idf.set(word, Math.log(numDocs / (docFreq.get(word) || 1)));
        });
        const vectors: number[][] = tokenizedDocs.map(doc => {
            const vector = new Array(vocab.size).fill(0);
            if (doc.length === 0) return vector;
            const termCounts = new Map<string, number>();
            doc.forEach(word => {
                termCounts.set(word, (termCounts.get(word) || 0) + 1);
            });
            termCounts.forEach((count, word) => {
                const tf = count / doc.length;
                const wordIdf = idf.get(word) || 0;
                const wordIndex = vocabIndexMap.get(word);
                if (wordIndex !== undefined) {
                    vector[wordIndex] = tf * wordIdf;
                }
            });
            return vector;
        });
        const numClusters = Math.min(papers.length, 4);
        let clusters: Cluster[] = [];
        if (papers.length > 2 && numClusters > 1) {
            const kmeansResult = simpleKMeans(vectors, numClusters);
            const clusterGroups: { [key: number]: { papers: ResearchPaper[], paperIndices: number[] } } = {};
            kmeansResult.clusters.forEach((clusterIndex, paperIndex) => {
                if (clusterIndex === -1) return;
                if (!clusterGroups[clusterIndex]) clusterGroups[clusterIndex] = { papers: [], paperIndices: [] };
                clusterGroups[clusterIndex].papers.push(papers[paperIndex]);
                clusterGroups[clusterIndex].paperIndices.push(paperIndex);
            });
            clusters = Object.entries(clusterGroups).map(([clusterId, clusterData]) => {
                const termScores: {[term: string]: number} = {};
                clusterData.paperIndices.forEach(paperIndex => {
                    const vector = vectors[paperIndex];
                    vector.forEach((score, termIndex) => {
                        if (score > 0) {
                            const term = vocabArray[termIndex];
                            termScores[term] = (termScores[term] || 0) + score;
                        }
                    });
                });
                const keywords = Object.entries(termScores).sort((a, b) => b[1] - a[1]).slice(0, 5).map(entry => entry[0]);
                const clusterName = keywords.slice(0, 3).map(k => k.charAt(0).toUpperCase() + k.slice(1)).join(' / ');
                return {
                    clusterName: clusterName || `Cluster ${parseInt(clusterId) + 1}`,
                    description: `A thematic group of ${clusterData.papers.length} papers related to ${keywords.join(', ')}.`,
                    paperTitles: clusterData.papers.map(p => p.title),
                    keywords: keywords
                };
            });
        }

        const nodes: GraphNode[] = papers.map(p => ({ id: p.title, year: p.year }));
        const edges: GraphEdge[] = [];
        clusters.forEach(cluster => {
            const sortedPapers = cluster.paperTitles
                .map(title => papers.find(p => p.title === title)!)
                .filter(p => p)
                .sort((a, b) => a.year - b.year);
            for (let i = 0; i < sortedPapers.length - 1; i++) {
                edges.push({
                    source: sortedPapers[i].title,
                    target: sortedPapers[i+1].title
                });
            }
        });

        const result: AnalysisResult = {
            clusters,
            publicationYears,
            topAuthors,
            graph: { nodes, edges }
        };
        
        return JSON.stringify(result);
    }
}


// --- LangChain Tools (Existing Tools Updated) ---

export class ExtractKnowledgeGraphTool extends Tool {
    name = "extract_knowledge_graph";
    description = "Analyzes a research paper's abstract to extract a structured knowledge graph of entities (Concepts, Methodologies, Findings) and their relationships. Returns a JSON object of type KnowledgeGraph.";
    schema = z.object({
        abstract: z.string().describe("The abstract text from which to extract the knowledge graph."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const prompt = `You are an expert in scientific literature analysis. Your task is to extract a structured knowledge graph from the provided research abstract.

        Identify the core entities:
        - **Concepts**: Key ideas, theories, or subjects being investigated.
        - **Methodologies**: The techniques, tools, or procedures used in the research.
        - **Findings**: The results, conclusions, or key takeaways of the study.
        - **Context**: The domain or environment of the study.
        
        Identify the relationships between these entities, such as:
        - A 'Concept' **is investigated by** a 'Methodology'.
        - A 'Methodology' **produces** a 'Finding'.
        - A 'Concept' **is related to** another 'Concept'.
        - A 'Finding' **supports** or **contradicts** a 'Concept'.

        Abstract:
        "${input.abstract}"

        Return a single JSON object that strictly follows the provided schema. Generate unique IDs for each entity.`;

        const knowledgeGraphSchema = {
            type: Type.OBJECT,
            properties: {
                entities: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            id: { type: Type.STRING, description: "A unique identifier for the entity (e.g., 'concept_1')." },
                            type: { type: Type.STRING, enum: ['Concept', 'Methodology', 'Finding', 'Context'] },
                            label: { type: Type.STRING, description: "The name of the entity." },
                            description: { type: Type.STRING, description: "A brief one-sentence description of the entity." }
                        },
                        required: ["id", "type", "label", "description"]
                    }
                },
                relationships: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            source: { type: Type.STRING, description: "The ID of the source entity." },
                            target: { type: Type.STRING, description: "The ID of the target entity." },
                            label: { type: Type.STRING, description: "The type of relationship (e.g., 'uses', 'investigates')." },
                            description: { type: Type.STRING, description: "A brief one-sentence description of how the entities are related." }
                        },
                        required: ["source", "target", "label", "description"]
                    }
                }
            },
            required: ["entities", "relationships"]
        };

        const result = await AiService.generateJsonWithModel(prompt, input.model, knowledgeGraphSchema);
        return JSON.stringify(result);
    }
}

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
        return await AiService.generateHypotheticalAnswer(input.userQuery, input.model as ModelDefinition);
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
        const result = await AiService.evaluateScreeningFit(input.paper as ResearchPaper, input.inclusionCriteria, input.exclusionCriteria, input.model as ModelDefinition);
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
        return await AiService.generateSummaryForPapers(input.papers as ResearchPaper[], input.summaryLength as SummaryLength, input.summaryStyle as SummaryStyle, input.model as ModelDefinition);
    }
}

export class AnalyzeResearchGapsTool extends Tool {
    name = "analyze_research_gaps";
    description = "Orchestrates a Phase 3 neuro-symbolic analysis to find deep research gaps. Extracts logical facts, reasons over them to find contradictions and unexplored areas, then generates an explanatory report. Outputs a markdown report as a string.";
    schema = z.object({
        papers: z.array(z.object({
            title: z.string(),
            abstract: z.string(),
            knowledgeGraph: z.any().optional(),
        })).describe("An array of research papers for gap analysis."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        try {
            // 1. Neural -> Symbolic (Fact Extraction)
            const factExtractionPromises = input.papers.map(p => 
                new ExtractFactsTool()._call({ abstract: p.abstract, paper_title: p.title, model: input.model })
            );
            const factResults = await Promise.all(factExtractionPromises);
            const allFacts: Fact[] = factResults.flatMap(fr => JSON.parse(fr));

            // 2. Symbolic Reasoning (Inference)
            const reasonerTool = new ReasonOverGraphTool();
            const logicalFindingsJson = await reasonerTool._call({ facts: allFacts });
            const logicalFindings: LogicalFindings = JSON.parse(logicalFindingsJson);

            // 3. Symbolic -> Neural (Explanation)
            let logicalContext = "No specific logical contradictions or unexplored areas were found. Proceed with a general analysis of the abstracts.";
            if (logicalFindings.contradictions.length > 0 || logicalFindings.unexplored_areas.length > 0) {
                logicalContext = "Based on a neuro-symbolic analysis of the provided papers, the following logical findings were discovered. Your primary task is to explain the significance of these findings to a researcher.\n\n";
                if (logicalFindings.contradictions.length > 0) {
                    logicalContext += "== Direct Contradictions Found ==\n";
                    logicalFindings.contradictions.forEach(c => {
                        logicalContext += `- The claim that '${c.fact1.object}' is '${c.fact1.predicate}' by "${c.fact1.source_paper}" is contradicted by "${c.fact2.source_paper}", which states it is '${c.fact2.predicate}'.\n`;
                    });
                }
                if (logicalFindings.unexplored_areas.length > 0) {
                    logicalContext += "\n== Unexplored Research Areas ==\n";
                    logicalFindings.unexplored_areas.slice(0, 5).forEach(ua => { // Limit for prompt size
                        logicalContext += `- ${ua.details}\n`;
                    });
                }
            }
            
            const abstracts = input.papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

            const prompt = `You are a distinguished research analyst. You have been provided with a set of logical findings from a reasoning engine that analyzed a collection of papers. Your task is to write a formal research gap analysis report based on these findings.

            **Logical Findings from Reasoning Engine:**
            ${logicalContext}

            **Instructions:**
            1.  First, elaborate on the significance of the logical findings. Explain why the contradictions are important and what the unexplored research areas imply.
            2.  Then, supplement this with a broader synthesis of the abstracts to identify any other potential gaps, unanswered questions, or promising future directions that the logical engine might have missed.
            3.  Structure your final response as a formal report in Markdown format. Use headings (e.g., '## Logically-Derived Contradictions', '## Unexplored Connections', '## Broader Thematic Gaps') and bullet points.

            **Full Paper Abstracts for Additional Context:**
            ${abstracts}
            
            Return a single JSON object with a "report" key.`;

            const gapAnalysisSchema = {
                type: Type.OBJECT,
                properties: { report: { type: Type.STRING, description: "A markdown-formatted report outlining research gaps, future directions, and unanswered questions based on the logical findings and abstracts." }, },
                required: ["report"],
            };
            
            const result = await AiService.generateJsonWithModel(prompt, input.model as ModelDefinition, gapAnalysisSchema);
            return result?.report || "Could not complete the research gap analysis.";

        } catch (error) {
            console.error("Error in Phase 3 AnalyzeResearchGapsTool:", error);
            // Fallback to Phase 2 logic if Phase 3 fails
            console.warn("Phase 3 failed. Falling back to Phase 2 (abstract-only) gap analysis.");
            
            const abstracts = input.papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');
        
            const fallbackPrompt = `As an expert researcher, analyze the following collection of paper abstracts to identify research gaps.
            
            **Instructions:**
            1.  Synthesize the key findings and limitations from all abstracts.
            2.  Identify common themes and areas where the research converges or diverges.
            3.  Based on this synthesis, identify and articulate potential research gaps, unanswered questions, and promising future directions.
            4.  Structure your response as a formal report in Markdown format. Use headings (e.g., '## Identified Research Gaps') and bullet points.
        
            **Paper Abstracts:**
            ${abstracts}
            
            Return a single JSON object with a "report" key.`;
        
            const gapAnalysisSchema = {
                type: Type.OBJECT,
                properties: { report: { type: Type.STRING, description: "A markdown-formatted report outlining research gaps, future directions, and unanswered questions." }, },
                required: ["report"],
            };
        
            try {
                const result = await AiService.generateJsonWithModel(fallbackPrompt, input.model as ModelDefinition, gapAnalysisSchema);
                return result?.report || "Could not complete the research gap analysis.";
            } catch (fallbackError) {
                console.error("Fallback gap analysis also failed:", fallbackError);
                // Instead of throwing, return a formatted error report. This makes the tool more robust.
                return "## Analysis Failed\n\nAn unexpected error occurred during both the primary and fallback analysis attempts. Please try again later or with a different set of papers.";
            }
        }
    }
}

export class ScreenPapersTool extends Tool {
    name = "screen_papers";
    description = "Screens a list of research papers based on inclusion and exclusion criteria, returning a list of papers with a screening status ('include', 'exclude', or 'none') and a rationale for the decision.";
    schema = z.object({
        papers: z.array(z.object({
            id: z.string(),
            title: z.string(),
            abstract: z.string(),
        })).describe("An array of research papers to screen."),
        inclusionCriteria: z.string().describe("The criteria for including papers."),
        exclusionCriteria: z.string().describe("The criteria for excluding papers."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        const screeningPromises = input.papers.map(async (paper) => {
            const result = await AiService.evaluateScreeningFit(paper as ResearchPaper, input.inclusionCriteria, input.exclusionCriteria, input.model as ModelDefinition);
            return {
                ...paper,
                screeningStatus: result.score > 50 ? 'include' : 'exclude',
                screeningRationale: result.rationale,
            };
        });
        const screenedPapers = await Promise.all(screeningPromises);
        return JSON.stringify(screenedPapers);
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
        const analysisResult = await AiService.analyzeSinglePaper(input.paper as ResearchPaper, input.model as ModelDefinition);
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
        const concepts = await AiService.extractKeyConcepts(input.abstract, input.model as ModelDefinition);
        return JSON.stringify(concepts);
    }
}

export class SynthesizePapersTool extends Tool {
    name = "synthesize_papers";
    description = "Synthesizes key information from a collection of research papers into a structured comparative overview. Uses knowledge graphs if available to guide the synthesis. Returns a JSON array of SynthesisResult objects.";
    schema = z.object({
        papers: z.array(z.object({
            title: z.string(),
            abstract: z.string(),
            knowledgeGraph: z.any().optional(),
        })).describe("An array of research papers to synthesize."),
        model: z.object({ id: z.string(), name: z.string(), provider: z.string() }).optional().default(DEFAULT_MODEL).describe("The AI model to use for generation."),
    });

    async _call(input: z.infer<typeof this.schema>): Promise<string> {
        // Phase 2 (Refined): Knowledge-Augmented Generation with Relationships
        const allKGs = input.papers.map(p => p.knowledgeGraph).filter((kg): kg is KnowledgeGraph => !!kg);
        const allEntities = allKGs.flatMap(kg => kg.entities);
        const allRelationships = allKGs.flatMap(kg => kg.relationships);

        const entityMap = new Map(allEntities.map(e => [e.id, e]));

        const concepts = [...new Set(allEntities.filter(e => e.type === 'Concept').map(e => e.label))];
        const findings = [...new Set(allEntities.filter(e => e.type === 'Finding').map(e => e.label))];

        const observedConnections = allRelationships.filter(rel => {
            const source = entityMap.get(rel.source) as Entity | undefined;
            const target = entityMap.get(rel.target) as Entity | undefined;
            return source && target && (source.type === 'Methodology' && target.type === 'Finding');
        }).slice(0, 5).map(rel => {
            const source = entityMap.get(rel.source)! as Entity;
            const target = entityMap.get(rel.target)! as Entity;
            return `'${source.label}' produced '${target.label}'`;
        });

        let knowledgeContext = '';
        if (concepts.length > 0 || findings.length > 0) {
            knowledgeContext = `
To guide your synthesis, here is a consolidated list of key themes found across all papers:
- **Key Concepts:** ${concepts.join(', ') || 'N/A'}
- **Key Findings mentioned:** ${findings.join(', ') || 'N/A'}`;
            if (observedConnections.length > 0) {
                knowledgeContext += `
- **Examples of how Findings were produced:**\n  - ${observedConnections.join('\n  - ')}`;
            }
        }

        const abstracts = input.papers.map(p => `Title: ${p.title}\nAbstract: ${p.abstract}`).join('\n\n---\n\n');

        const prompt = `You are a research assistant. Synthesize the key information from the following paper abstracts into a structured table format.
    
        ${knowledgeContext}

        **Task:**
        For each paper, extract its title, its single most important finding (especially in relation to the key themes), a brief (1-sentence) description of its methodology, and the context/sample studied.
    
        **Paper Abstracts:**
        ${abstracts}
        
        Return the result as a JSON array of objects, where each object represents a paper.`;

        const synthesisSchema = {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    title: { type: Type.STRING, description: "The original title of the paper." },
                    mainFinding: { type: Type.STRING, description: "The single most important finding or conclusion of the paper." },
                    methodology: { type: Type.STRING, description: "A brief (1-sentence) description of the methodology." },
                    context: { type: Type.STRING, description: "The context, population, or sample studied (e.g., 'University students', 'Clinical trial participants')." },
                },
                required: ["title", "mainFinding", "methodology", "context"]
            }
        };

        try {
            const result = await AiService.generateJsonWithModel(prompt, input.model as ModelDefinition, synthesisSchema);
            return JSON.stringify(result || []);
        } catch (error) {
            console.error("Error synthesizing papers:", error);
            throw new Error("The AI failed to synthesize the papers. Please try again.");
        }
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
        const cslMetadata = await AiService.extractCitationMetadata(input.paper as ResearchPaper, input.model as ModelDefinition);
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
        return await AiService.classifyStudyDesign(input.paper as ResearchPaper, input.model as ModelDefinition);
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
        const result = await AiService.rerankByScreeningExample(
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
        return await AiService.generateRAGAnswer(input.query, input.context, input.model as ModelDefinition);
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
        const suggestions = await AiService.generatePaperBasedSuggestions(input.paper as ResearchPaper, input.model as ModelDefinition);
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
