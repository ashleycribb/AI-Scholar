
export type SummaryLength = 'short' | 'medium' | 'detailed';
export type SummaryStyle = 'paragraph' | 'bullets' | 'qa';
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver';

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
  searchMode: 'keyword' | 'semantic';
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
  };
  log: string[]; // A log of what passed/failed for debugging/display
}


export interface ResearchPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  sourceURL?: string;
  pdfURL?: string;
  citations?: number;
  validation?: ValidationResult;
  semanticScore?: number;
  keyConcepts?: string[];
  keyConceptsState?: 'idle' | 'loading' | 'loaded' | 'error';
  doi?: string;
  doiState?: 'idle' | 'loading' | 'loaded' | 'error';
  enrichmentSource?: 'arXiv';
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
  role: 'user' | 'model';
  parts: { text: string }[];
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

export type SortKey = 'semanticRelevance' | 'year' | 'citations' | 'validationScore';
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

// A project is a user-defined collection of papers.
export interface Project {
  id: string;
  name: string;
  paperIds: string[];
  createdAt: number;
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