
export type SummaryLength = 'short' | 'medium' | 'detailed';
export type SummaryStyle = 'paragraph' | 'bullets' | 'qa';
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver';
export type ModelProvider = 'gemini' | 'openai' | 'anthropic';

export interface ModelDefinition {
  id: string;
  name: string;
  provider: ModelProvider;
  isMock?: boolean;
}

export type SearchSource = string;

export interface SearchSourceInfo {
  id: SearchSource;
  name: string;
  description: string;
}

export interface AdvancedSearchOptions {
  startYear: string;
  endYear:string;
  authors: string;
  excludeKeywords: string;
  inclusionCriteria: string;
  exclusionCriteria: string;
  studyDesign: string;
  // New fields inspired by Manticore
  journal?: string;
  minCitations?: string;
  titleKeywords?: string;
  abstractKeywords?: string;
  isOpenAccess?: boolean;
}

export interface ValidationResult {
  score: number; // 0-100
  status: 'unvalidated' | 'validating' | 'validated' | 'error';
  checks: {
    crossref_match: boolean;
    title_match: boolean;
    author_match: boolean;
    open_access: boolean;
    source_enriched: boolean;
    has_citations: boolean;
  };
  log: string[]; // A log of what passed/failed for debugging/display
}

// --- Neuro-Symbolic / Knowledge Graph Types ---
export type EntityType = 'Concept' | 'Methodology' | 'Finding' | 'Context';

export interface Entity {
  id: string; // e.g., "concept_1"
  type: EntityType;
  label: string; // e.g., "Large Language Models"
  description: string;
}

export interface Relationship {
  source: string; // "concept_1"
  target: string; // "methodology_1"
  label: string; // "utilizes"
  description: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relationships: Relationship[];
}
// ---------------------------------------------


export interface ResearchPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  sourceURL?: string;
  pdfURL?: string;
  // Fix: Add properties to track open access PDF fetching status
  openAccessPdfUrl?: string;
  openAccessState?: 'idle' | 'loading' | 'loaded' | 'error';
  citations?: number;
  validation?: ValidationResult;
  semanticScore?: number;
  screeningFitScore?: number;
  screeningRationale?: string;
  screeningStatus?: 'include' | 'exclude' | 'none';
  detectedStudyDesign?: string;
  impactScore?: number;
  combinedScore?: number;
  keyConcepts?: string[];
  keyConceptsState?: 'idle' | 'loading' | 'loaded' | 'error';
  knowledgeGraph?: KnowledgeGraph;
  knowledgeGraphState?: 'idle' | 'loading' | 'loaded' | 'error';
  doi?: string;
  doiState?: 'idle' | 'loading' | 'loaded' | 'error';
  enrichmentSource?: 'arXiv';
  savedAnalysis?: PaperAnalysis;
  verificationResult?: VerificationResult;
  journal?: string;
}

export type PublicationYearData = { year: number; count: number }[];
export type AuthorFrequencyData = { author: string; count: number; totalCitations: number }[];

export interface Cluster {
  clusterName: string;
  description: string;
  paperTitles: string[];
  keywords: string[];
}

export interface GraphNode {
    id: string; // paper title
    year: number;
}

export interface GraphEdge {
    source: string; // paper title
    target: string;
}

export interface AnalysisResult {
  clusters: Cluster[];
  publicationYears: PublicationYearData;
  topAuthors: AuthorFrequencyData;
  graph?: {
      nodes: GraphNode[];
      edges: GraphEdge[];
  };
}

export interface GroundingSource {
    title: string;
    uri: string;
}

export interface ChatMessage {
  role: 'user' | 'model' | 'tool';
  parts: { 
    text?: string;
    toolCall?: {
      name: string;
      args: any;
      thinking: string;
    };
    toolResponse?: {
      name: string;
      result: any;
    };
  }[];
  sources?: GroundingSource[];
}

export interface ConnectedPaper {
  title: string;
  authors: string;
  year: number;
  connection: string;
  summary: string;
  sourceURL?: string;
}

export interface PaperAnalysis {
  researchQuestion: string;
  methodology: string;
  keyFindings: string[];
  limitations: string[];
}

export type SynthesisResult = {
  title: string;
  mainFinding: string;
  methodology: string;
  context: string;
}[];

export type SortKey = 'relevance' | 'year' | 'citations' | 'validationScore' | 'screeningFitScore';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export interface EnhancedQuery {
  refined_query: string;
  key_concepts: string[];
}

export interface SuggestionsResult {
    seedPaper: ResearchPaper;
    suggestions: string[];
}

export type RagStatus = 'unindexed' | 'indexing' | 'indexed' | 'error';

// A project is a user-defined collection of papers.
export interface Project {
  id: string;
  name: string;
  paperIds: string[];
  createdAt: number;
  color: string;
  paperStatuses: { [paperId: string]: RagStatus };
}

// --- Crossref API Types ---
interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string; 
}

interface CrossrefLink {
    URL: string;
    'content-type': string;
    'content-version': string;
    'intended-application': string;
}

export interface CrossrefWork {
  title: string[];
  author: CrossrefAuthor[];
  URL: string;
  DOI: string;
  link?: CrossrefLink[];
}

// --- Advanced Verification System Types ---
// These types represent a more granular and evidence-based approach to paper validation.

export type Verdict = 'SUPPORT' | 'REFUTE' | 'NEI';

export interface Metadata {
  doi?: string;
  title?: string;
  authors?: string[];
  journal?: string;
  year?: number;
  citations?: number;
  isRetracted?: boolean;
  isOpenAccess?: boolean;
  hasData?: boolean;
  hasCode?: boolean;
  credibilityScore?: number; // 0-1
  reproducibilityScore?: number; // 0-1
  temporalScore?: number; // 0-1
}

export interface EvidenceSpan {
  source: string; // DOI or URL
  passage: string; // the exact supporting sentence(s)
  location?: { page?: number; paragraph?: number };
  score?: number; // entailment confidence 0-1
}

export interface CitationStats {
  total: number;
  supportCount: number;
  contradictCount: number;
  supportRatio: number; // 0-1
}

export interface VerificationBreakdown {
  credibility: number;
  evidence: number;
  reproducibility: number;
  citations: number;
  temporal: number;
}

export interface VerificationResult {
  doi?: string;
  title?: string;
  vacs: number; // 0 - 100
  verdict: 'Verified' | 'Inconclusive' | 'Questionable';
  breakdown: VerificationBreakdown;
  evidence: EvidenceSpan[]; // must be non-empty for any "Verified" verdict
  rationale: string[]; // human readable bullets
}

// --- Dissertation Study Specific Types ---
export type AppMode = 'search' | 'dashboard' | 'evaluation';

export interface GoldStandardPaper {
  paper_id: string; // DOI
  title: string;
  authors: string;
  year: number;
  abstract: string;
  source?: string; // journal name
  crossref_verified: boolean;
  peer_reviewed: boolean;
  open_access: boolean;
  author_verified: boolean;
  factual_accuracy_score: number; // 0-100
  notes: string;
  label: 'verified' | 'inconclusive' | 'refuted';
}


export interface TestHarnessResult {
  paperId: string;
  vacsResult: VerificationResult;
  groundTruth: GoldStandardPaper;
  isCorrect: boolean;
  precisionAt1: number;
}

export interface UserStudyData {
  participantId: string;
  task: { paper: ResearchPaper; claim: string };
  group: 'A' | 'B'; // A: Control, B: Treatment (with VACS)
  vacsResult?: VerificationResult;
  userVerdict: 'Correct' | 'Incorrect';
  isAdequate: 'Yes' | 'No';
  usefulness: number; // 1-5
  timeToVerify: number; // in milliseconds
}