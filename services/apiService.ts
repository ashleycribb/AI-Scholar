
import type { 
    AdvancedSearchOptions, 
    ResearchPaper, 
    SummaryLength, 
    SummaryStyle, 
    Metadata, 
    ModelDefinition, 
    ConnectedPaper, 
    LiteratureReviewDraft, 
    InnovationResult, 
    SynthesisResult,
    DataCiteWork,
    OpenCitationsLink,
    OpenAireProject,
    EuropePmcArticle,
    DblpPublication,
    UserSettings
} from '../types';
import * as openalexService from './openalexService';
import * as geminiService from './geminiService';
import * as analysisService from './analysisService';
import * as embeddingService from './embeddingService';
import * as metadataService from './metadataService';
import * as semanticScholarService from './semanticScholarService';
import * as deepResearchService from './deepResearchService';
import * as arxivService from './arxivService';
import * as googleScholarService from './googleScholarService';
import * as researchService from './researchService';
import * as unpaywallService from './unpaywallService';
import * as huggingfacePapersService from './huggingfacePapersService';
import * as dataciteService from './dataciteService';
import * as openCitationsService from './openCitationsService';
import * as openaireService from './openaireService';
import * as europePmcService from './europePmcService';
import * as dblpService from './dblpService';
import * as crossrefService from './crossrefService';
import * as zenodoService from './zenodoService';
import * as pubmedService from './pubmedService';
import * as biorxivService from './biorxivService';
import * as dissertationService from './dissertationService';
import * as doajService from './doajService';
import * as ericService from './ericService';
import * as coreService from './coreService';

/**
 * Service Facade
 */

// Heuristic to check if a query is a natural language question likely needing expansion
const isNaturalLanguageQuestion = (query: string): boolean => {
    const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which', 'can', 'does', 'do', 'is', 'are'];
    const lower = query.toLowerCase();
    return (query.split(' ').length > 4) || questionWords.some(w => lower.startsWith(w));
};

export interface SearchProgressCallbacks {
    onInitialPapers?: (papers: ResearchPaper[], hasMore: boolean) => void;
    onFederatedBatch?: (papers: ResearchPaper[], newCount: number) => void;
    onStatusChange?: (message: string) => void;
    onSourceNotice?: (notice: string | null) => void;
}

// Deduplicate and merge research paper lists preserving richest metadata
export const deduplicatePapers = (papers: ResearchPaper[]): ResearchPaper[] => {
    const uniquePapers = new Map<string, ResearchPaper>();
    
    for (const paper of papers) {
        const key = paper.doi ? `doi:${paper.doi.toLowerCase()}` : paper.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (!key || key.length < 5) continue;

        if (uniquePapers.has(key)) {
            const existing = uniquePapers.get(key)!;
            const merged: ResearchPaper = { 
                ...existing,
                ...paper,
                id: existing.id 
            };

            merged.citations = Math.max(existing.citations || 0, paper.citations || 0);
            merged.pdfURL = existing.pdfURL || paper.pdfURL;
            
            const existingAbstractLen = existing.abstract ? existing.abstract.length : 0;
            const paperAbstractLen = paper.abstract ? paper.abstract.length : 0;
            
            merged.abstract = (existingAbstractLen > paperAbstractLen) 
                ? existing.abstract 
                : paper.abstract;
                
            merged.highlights = [...(existing.highlights || []), ...(paper.highlights || [])]; 
            
            uniquePapers.set(key, merged);
        } else {
            uniquePapers.set(key, paper);
        }
    }
    return Array.from(uniquePapers.values());
};

export const searchPapers = async (
    query: string, 
    options: AdvancedSearchOptions, 
    page: number = 1, 
    userSettings?: UserSettings,
    callbacks?: SearchProgressCallbacks
): Promise<{ papers: ResearchPaper[], hasMore: boolean }> => {
    // 0. Direct DOI Lookup
    if (options.doi) {
        callbacks?.onStatusChange?.(`Resolving DOI: ${options.doi}...`);
        const paper = await openalexService.searchOpenAlexByDoi(options.doi);
        const res = { papers: paper ? [paper] : [], hasMore: false };
        if (paper && callbacks?.onInitialPapers) {
            callbacks.onInitialPapers([paper], false);
        }
        return res;
    }

    // 1. FAST PRIMARY RETRIEVAL: Query OpenAlex directly (<500ms)
    // This immediately brings out the initial paper list so the user is never left waiting on a blank screen
    callbacks?.onStatusChange?.('Querying OpenAlex index for initial literature...');
    
    const fastOpenAlexPromise = openalexService.searchOpenAlex(query, options, page)
        .then(res => {
            const initialClean = deduplicatePapers(res.papers);
            if (initialClean.length > 0 && callbacks?.onInitialPapers) {
                callbacks.onInitialPapers(initialClean, res.hasMore);
                callbacks?.onStatusChange?.(`Initial ${initialClean.length} articles retrieved from OpenAlex. Ingesting federated repositories...`);
            }
            return { papers: initialClean, hasMore: res.hasMore };
        })
        .catch(err => {
            console.warn("[FastRetrieval] Direct OpenAlex fetch error:", err);
            return { papers: [] as ResearchPaper[], hasMore: false };
        });

    // 2. PARALLEL FEDERATED DISCOVERY WAVE:
    // Concurrently search ArXiv, Semantic Scholar, Crossref, PubMed, Europe PMC, DataCite, Zenodo, etc.
    const federatedPromises: Promise<ResearchPaper[]>[] = [];

    // Google Scholar (SerpApi)
    if (userSettings?.isSerpApiEnabled && userSettings.serpApiKey) {
        federatedPromises.push(
            googleScholarService.searchGoogleScholar(query, options, page, userSettings.serpApiKey)
                .catch(() => [])
        );
    }

    if (page === 1) {
        // High-precision citation graph
        federatedPromises.push(
            semanticScholarService.searchSemanticScholar(query, options)
                .then(res => res.papers)
                .catch(() => [])
        );

        // STEM Pre-Prints (via backend proxy; shows quiet notice if unavailable)
        federatedPromises.push(
            arxivService.searchArxiv(query)
                .then(res => {
                    if (res.unavailable) {
                        callbacks?.onSourceNotice?.('arXiv unavailable');
                    } else {
                        callbacks?.onSourceNotice?.(null);
                    }
                    return res.papers;
                })
                .catch(() => {
                    callbacks?.onSourceNotice?.('arXiv unavailable');
                    return [];
                })
        );

        // Hugging Face AI Papers
        federatedPromises.push(
            huggingfacePapersService.searchHuggingFacePapers(query, options, page)
                .then(res => res.papers)
                .catch(() => [])
        );

        // DataCite PID Graph (Datasets & Software)
        federatedPromises.push(
            dataciteService.searchDataCiteAsResearchPapers(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // OpenAIRE EU Research Graph
        federatedPromises.push(
            openaireService.searchOpenAirePublications(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // Europe PMC / PubMed Central (Biomedical)
        federatedPromises.push(
            europePmcService.searchEuropePMC(query, 6, 1)
                .then(res => res.papers)
                .catch(() => [])
        );

        // DBLP Computer Science Bibliography
        federatedPromises.push(
            dblpService.searchDBLP(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // Crossref Global DOI Authority
        federatedPromises.push(
            crossrefService.searchCrossref(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // Doctoral Dissertations & PhD Prior Art
        federatedPromises.push(
            dissertationService.searchDissertations(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // PubMed / NCBI Clinical MEDLINE
        federatedPromises.push(
            pubmedService.searchPubMed(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // bioRxiv & medRxiv Life Sciences Preprints
        federatedPromises.push(
            biorxivService.searchBioRxiv(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // CERN Zenodo Datasets & Code
        federatedPromises.push(
            zenodoService.searchZenodo(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // Directory of Open Access Journals (DOAJ)
        federatedPromises.push(
            doajService.searchDOAJ(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // ERIC Education Sciences
        federatedPromises.push(
            ericService.searchERIC(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );

        // CORE Institutional Repositories
        federatedPromises.push(
            coreService.searchCORE(query, 6)
                .then(res => res.papers)
                .catch(() => [])
        );
    }

    // 3. Await federated sources
    const federatedSettled = await Promise.allSettled(federatedPromises);
    const federatedPapers: ResearchPaper[] = [];
    for (const result of federatedSettled) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            federatedPapers.push(...result.value);
        }
    }

    // 4. Combine with OpenAlex results
    const openAlexResult = await fastOpenAlexPromise;
    const initialPapers = openAlexResult.papers;

    const allCombined = [...initialPapers, ...federatedPapers];
    const uniquePapers = deduplicatePapers(allCombined)
        .sort((a, b) => (b.citations || 0) - (a.citations || 0));

    // If initial papers were empty (e.g. OpenAlex was slow or returned 0), send all papers now
    if (initialPapers.length === 0 && uniquePapers.length > 0 && callbacks?.onInitialPapers) {
        callbacks.onInitialPapers(uniquePapers, openAlexResult.hasMore);
    } else {
        const newCount = uniquePapers.length - initialPapers.length;
        if (newCount > 0 && callbacks?.onFederatedBatch) {
            callbacks.onFederatedBatch(uniquePapers, newCount);
        }
    }

    // 5. Unpaywall Enrichment (Best effort for OA links in background)
    let enrichedPapers = uniquePapers;
    if (page === 1 && uniquePapers.length > 0) {
        try {
            enrichedPapers = await unpaywallService.enrichWithUnpaywall(uniquePapers);
        } catch (e) {
            console.error("Unpaywall enrichment failed", e);
        }
    }

    const hasMore = openAlexResult.hasMore || enrichedPapers.length >= 15;
    return { papers: enrichedPapers, hasMore };
};

export const generateSummary = async (papers: ResearchPaper[], length: SummaryLength, style: SummaryStyle) => {
  return geminiService.generateSummaryForPapers(papers, length, style);
};

export const analyzePapers = async (papers: ResearchPaper[], domain?: string) => {
  return analysisService.analyzePapers(papers, domain);
};

export const generateLaymanSummary = async (paper: ResearchPaper) => {
  return geminiService.generateLaymanSummary(paper);
};

export const calculatePaperScores = async (papers: ResearchPaper[], query: string) => {
  return embeddingService.calculatePaperScores(papers, query);
};

export const precomputeQueryEmbedding = async (query: string) => {
    return embeddingService.precomputeQueryEmbedding(query);
};

export const computeScores = async (papers: ResearchPaper[], queryEmbedding: number[], queryFallback?: string) => {
    return embeddingService.computeScores(papers, queryEmbedding, queryFallback);
};

export const fetchMetadataByDOI = async (doi: string): Promise<Metadata> => {
    return metadataService.fetchMetadataByDOI(doi);
};

export interface CitationGraphLookupResult {
    connections: ConnectedPaper[];
    citedByCount: number;
    referencedWorksCount: number;
    citingLinks: OpenCitationsLink[];
    referencedLinks: OpenCitationsLink[];
    openalexConcepts: string[];
    primarySource: 'OpenAlex' | 'Semantic Scholar' | 'OpenCitations';
    sourceErrors: string[];
}

/**
 * Primary citation and reference lookup using OpenAlex referenced_works and cited_by_count / filter=cites:<id>,
 * with Semantic Scholar and OpenCitations as fallbacks. Surfaces clear errors when a source fails or rate-limits.
 */
export const fetchPaperCitationGraphWithFallbacks = async (
    paper: ResearchPaper
): Promise<CitationGraphLookupResult> => {
    const sourceErrors: string[] = [];
    const connections: ConnectedPaper[] = [];
    const citingLinks: OpenCitationsLink[] = [];
    const referencedLinks: OpenCitationsLink[] = [];
    let citedByCount = paper.citations || 0;
    let referencedWorksCount = 0;
    let openalexConcepts: string[] = [];
    let primarySource: 'OpenAlex' | 'Semantic Scholar' | 'OpenCitations' = 'OpenAlex';

    const cleanDoi = paper.doi ? paper.doi.replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim() : '';

    // 1. Primary Source: OpenAlex referenced_works & cited_by_count / filter=cites:<id>
    const oaGraph = await openalexService.fetchOpenAlexCitationGraph(paper);
    if (oaGraph.error) {
        sourceErrors.push(`OpenAlex: ${oaGraph.error}`);
    }
    if (oaGraph.concepts && oaGraph.concepts.length > 0) {
        openalexConcepts = oaGraph.concepts;
    }

    if (oaGraph.citedByCount > 0 || oaGraph.referencedWorksCount > 0 || oaGraph.citingWorks.length > 0 || oaGraph.referencedWorks.length > 0) {
        citedByCount = Math.max(citedByCount, oaGraph.citedByCount);
        referencedWorksCount = oaGraph.referencedWorksCount || oaGraph.referencedWorks.length;

        oaGraph.citingWorks.slice(0, 12).forEach(cw => {
            connections.push({
                title: cw.title,
                authors: cw.authors,
                year: cw.year,
                connection: 'Cited by this work (OpenAlex)',
                summary: `Citing work indexed in OpenAlex (${cw.citations} citations).`,
                sourceURL: cw.sourceURL
            });
            citingLinks.push({
                citingDoi: cw.doi || cw.id,
                citedDoi: cleanDoi || paper.openalex_id || paper.id,
                creationDate: cw.year ? String(cw.year) : '',
                timespan: '',
                journalScind: false,
                authorScind: false
            });
        });

        oaGraph.referencedWorks.slice(0, 12).forEach(rw => {
            connections.push({
                title: rw.title,
                authors: rw.authors,
                year: rw.year,
                connection: 'This paper cites (OpenAlex)',
                summary: `Referenced work resolved via OpenAlex referenced_works (${rw.citations} citations).`,
                sourceURL: rw.sourceURL
            });
            referencedLinks.push({
                citingDoi: cleanDoi || paper.openalex_id || paper.id,
                citedDoi: rw.doi || rw.id,
                creationDate: rw.year ? String(rw.year) : '',
                timespan: '',
                journalScind: false,
                authorScind: false
            });
        });
    }

    // 2. Fallback 1: Semantic Scholar (if OpenAlex had no connections or failed)
    if (connections.length === 0 && cleanDoi) {
        try {
            const s2Graph = await semanticScholarService.getPaperGraphData(cleanDoi);
            if (s2Graph && s2Graph.connections && s2Graph.connections.length > 0) {
                primarySource = 'Semantic Scholar';
                connections.push(...s2Graph.connections);
                if (typeof s2Graph.influence?.citations === 'number') {
                    citedByCount = Math.max(citedByCount, s2Graph.influence.citations);
                }
            } else {
                sourceErrors.push('Semantic Scholar: Rate-limited or returned 0 graph edges for this DOI.');
            }
        } catch (err: any) {
            sourceErrors.push(`Semantic Scholar: ${err?.message || 'Graph request failed'}`);
        }
    }

    // 3. Fallback 2: OpenCitations COCI (if citingLinks / referencedLinks still empty)
    if ((citingLinks.length === 0 || referencedLinks.length === 0) && cleanDoi) {
        const [ocCitSettled, ocRefSettled] = await Promise.allSettled([
            openCitationsService.fetchCitationsByDoi(cleanDoi),
            openCitationsService.fetchReferencesByDoi(cleanDoi)
        ]);
        if (ocCitSettled.status === 'fulfilled' && ocCitSettled.value.length > 0) {
            if (citingLinks.length === 0) {
                citingLinks.push(...ocCitSettled.value);
                if (connections.length === 0) primarySource = 'OpenCitations';
            }
        } else if (ocCitSettled.status === 'rejected') {
            sourceErrors.push(`OpenCitations (citations): ${ocCitSettled.reason?.message || 'Request failed'}`);
        }
        if (ocRefSettled.status === 'fulfilled' && ocRefSettled.value.length > 0) {
            if (referencedLinks.length === 0) {
                referencedLinks.push(...ocRefSettled.value);
                referencedWorksCount = Math.max(referencedWorksCount, ocRefSettled.value.length);
            }
        } else if (ocRefSettled.status === 'rejected') {
            sourceErrors.push(`OpenCitations (references): ${ocRefSettled.reason?.message || 'Request failed'}`);
        }
    }

    return {
        connections,
        citedByCount,
        referencedWorksCount,
        citingLinks,
        referencedLinks,
        openalexConcepts,
        primarySource,
        sourceErrors
    };
};

export const findConnectedPapers = async (paper: ResearchPaper, _model: ModelDefinition): Promise<ConnectedPaper[]> => {
    const graph = await fetchPaperCitationGraphWithFallbacks(paper);
    return graph.connections;
};

export const handlePdfUpload = async (base64: string): Promise<ResearchPaper> => {
    return {
        id: `uploaded_${Date.now()}`,
        title: "Uploaded PDF Document",
        authors: "Unknown Author",
        year: new Date().getFullYear(),
        abstract: "Content extracted from uploaded PDF.",
        sourceURL: "",
        citations: 0
    };
};

export const draftLiteratureReview = async (papers: ResearchPaper[], topic: string): Promise<LiteratureReviewDraft> => {
    const report = await deepResearchService.synthesizeReport(topic, papers, { id: 'gemini-3-pro-preview', name: 'Gemini 3 Pro' });
    return {
        title: report.title,
        sections: report.sections
    };
};

export const generateInnovationInsights = async (papers: ResearchPaper[], model: ModelDefinition): Promise<InnovationResult> => {
    return geminiService.generateInnovationInsights(papers, model);
};

export const synthesizeWorkspace = async (papers: ResearchPaper[], model: ModelDefinition): Promise<SynthesisResult> => {
    return geminiService.synthesizeWorkspace(papers, model);
};

export const analyzeGaps = async (papers: ResearchPaper[], model: ModelDefinition): Promise<string> => {
    return geminiService.analyzeGaps(papers, model);
};

export const createWorkspaceChatSession = (papers: ResearchPaper[], modelId: string, history: {role: string, parts: {text: string}[]}[] = []) => {
    return geminiService.createWorkspaceChatSession(papers, modelId, history);
};

export const generateProjectReport = async (metrics: {
    datasetSize: number;
    testAccuracy: number;
    studySessions: number;
    totalEvents: number;
}) => {
    return researchService.generateProjectReport(metrics);
};

// ============================================================================
// 6. OPEN SCHOLARLY INFRASTRUCTURE & REGISTRY INTEGRATIONS
// ============================================================================

/**
 * DataCite GraphQL PID Graph Integration
 * Enables exploring linked datasets, software, preprints, samples, and creator ORCIDs
 */
export const queryDataCiteGraphQL = async (
    query: string, 
    limit: number = 10, 
    resourceType?: string
): Promise<{ works: DataCiteWork[]; totalCount: number }> => {
    return dataciteService.queryDataCiteGraphQL(query, limit, resourceType);
};

export const executeDataCiteGraphQL = async (
    query?: string, 
    variables?: Record<string, any>
): Promise<{ data: any; errors?: any }> => {
    return dataciteService.executeDataCiteGraphQL(query, variables);
};

export const searchDataCiteAsResearchPapers = async (
    query: string, 
    limit: number = 10
): Promise<{ papers: ResearchPaper[]; hasMore: boolean }> => {
    return dataciteService.searchDataCiteAsResearchPapers(query, limit);
};

export const DEFAULT_DATACITE_GRAPHQL_QUERY = dataciteService.DEFAULT_DATACITE_GRAPHQL_QUERY;

/**
 * OpenCitations SPARQL & COCI Integration
 * Enables querying CC0 open citation triplestores and citing/referenced DOI links
 */
export const executeOpenCitationsSparql = async (
    sparqlQuery: string
): Promise<{ bindings: any[]; headers: string[]; error?: string }> => {
    return openCitationsService.executeOpenCitationsSparql(sparqlQuery);
};

export const buildSparqlForDoiCitations = (doi: string, limit: number = 25): string => {
    return openCitationsService.buildSparqlForDoiCitations(doi, limit);
};

export const fetchCitationsByDoi = async (doi: string): Promise<OpenCitationsLink[]> => {
    return openCitationsService.fetchCitationsByDoi(doi);
};

export const fetchReferencesByDoi = async (doi: string): Promise<OpenCitationsLink[]> => {
    return openCitationsService.fetchReferencesByDoi(doi);
};

export const DEFAULT_OPENCITATIONS_SPARQL_QUERY = openCitationsService.DEFAULT_OPENCITATIONS_SPARQL_QUERY;

/**
 * OpenAIRE Grant & Project Lookup Integration
 * Enables querying European Commission (Horizon Europe, ERC), NIH, and global funder awards
 */
export const searchOpenAireProjects = async (
    query: string, 
    limit: number = 10
): Promise<{ projects: OpenAireProject[]; totalCount: number }> => {
    return openaireService.searchOpenAireProjects(query, limit);
};

export const searchOpenAirePublications = async (
    query: string, 
    limit: number = 10
): Promise<{ papers: ResearchPaper[]; totalCount: number }> => {
    return openaireService.searchOpenAirePublications(query, limit);
};

/**
 * Unified Multi-Registry Paper PID Graph & Funder Lookup
 * Gathers Crossref/DataCite metadata, OpenCitations citation graph, and OpenAIRE grant provenance for any paper DOI
 */
export const lookupPaperPIDGraph = async (doi: string): Promise<{
    dataCiteWorks: DataCiteWork[];
    citingLinks: OpenCitationsLink[];
    referencingLinks: OpenCitationsLink[];
    grantProjects: OpenAireProject[];
}> => {
    if (!doi) {
        return { dataCiteWorks: [], citingLinks: [], referencingLinks: [], grantProjects: [] };
    }

    const cleanDoi = doi.toLowerCase().replace(/^(https?:\/\/doi\.org\/|doi:)/i, '').trim();

    const [dataCiteRes, citingRes, refRes, grantsRes] = await Promise.allSettled([
        dataciteService.queryDataCiteGraphQL(cleanDoi, 5),
        openCitationsService.fetchCitationsByDoi(cleanDoi),
        openCitationsService.fetchReferencesByDoi(cleanDoi),
        openaireService.searchOpenAireProjects(cleanDoi, 5)
    ]);

    return {
        dataCiteWorks: dataCiteRes.status === 'fulfilled' ? dataCiteRes.value.works : [],
        citingLinks: citingRes.status === 'fulfilled' ? citingRes.value : [],
        referencingLinks: refRes.status === 'fulfilled' ? refRes.value : [],
        grantProjects: grantsRes.status === 'fulfilled' ? grantsRes.value.projects : []
    };
};

/**
 * Comprehensive Multi-Registry Paper Enrichment
 * Augments a paper with real-time registry citation counts, dataset ties, and Open Access grant badges
 */
export const enrichPaperWithOpenRegistries = async (paper: ResearchPaper): Promise<{
    paper: ResearchPaper;
    openCitationsCount: number;
    citingLinks: OpenCitationsLink[];
    referencedLinks: OpenCitationsLink[];
    dataCiteWork?: DataCiteWork | null;
    grantProjects: OpenAireProject[];
}> => {
    if (!paper.doi) {
        return {
            paper,
            openCitationsCount: 0,
            citingLinks: [],
            referencedLinks: [],
            dataCiteWork: null,
            grantProjects: []
        };
    }

    const pidGraph = await lookupPaperPIDGraph(paper.doi);
    const citingLinks = pidGraph.citingLinks;
    const referencedLinks = pidGraph.referencingLinks;
    const grantProjects = pidGraph.grantProjects;
    const dataCiteWork = pidGraph.dataCiteWorks.length > 0 ? pidGraph.dataCiteWorks[0] : null;

    const enrichedPaper: ResearchPaper = {
        ...paper,
        citations: Math.max(paper.citations || 0, citingLinks.length),
        isOpenAccess: paper.isOpenAccess || grantProjects.some(g => g.openAccessMandatePublications),
        highlights: [
            ...(paper.highlights || []),
            ...(grantProjects.length > 0 ? [{
                category: 'Grant Lineage',
                text: `Supported by ${grantProjects[0].funder} (${grantProjects[0].code}) under ${grantProjects[0].fundingStream || 'Open Science Framework'}`
            }] : []),
            ...(dataCiteWork ? [{
                category: 'PID Graph Artifact',
                text: `DataCite indexed ${dataCiteWork.resourceTypeGeneral || 'Resource'} (DOI: ${dataCiteWork.doi})`
            }] : [])
        ]
    };

    return {
        paper: enrichedPaper,
        openCitationsCount: citingLinks.length,
        citingLinks,
        referencedLinks,
        dataCiteWork,
        grantProjects
    };
};

// --- New Scholarly Registries & Databases Exports ---
export const searchCrossref = crossrefService.searchCrossref;
export const searchZenodo = zenodoService.searchZenodo;
export const searchPubMed = pubmedService.searchPubMed;
export const searchBioRxiv = biorxivService.searchBioRxiv;
export const searchDissertations = dissertationService.searchDissertations;
export const searchDOAJ = doajService.searchDOAJ;
export const searchERIC = ericService.searchERIC;
export const searchCORE = coreService.searchCORE;
