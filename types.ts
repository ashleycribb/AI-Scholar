export interface ResearchPaper {
  title: string;
  authors: string;
  year: string;
  summary: string;
  sourceURL?: string;
  pdfURL?: string;
}

export interface ConnectedPaper extends ResearchPaper {
  connection: string;
}

// FIX: Updated GroundingChunk interface to match the @google/genai SDK.
// The `web` property is optional in the SDK's type definition, which was causing a type mismatch.
export interface GroundingChunk {
  web?: {
    uri?: string;
    title?: string;
  }
}

export interface Source {
  uri: string;
  title: string;
}

export type SummaryLength = 'short' | 'medium' | 'detailed';

export type SummaryStyle = 'paragraph' | 'bullets' | 'qa';

export type SearchSource = string;

export interface SearchSourceInfo {
  id: string;
  name: string;
  description?: string;
}

export interface Cluster {
  theme: string;
  papers: string[];
}

export interface AnalysisResult {
  clusters: Cluster[];
}

export type PublicationYearData = {
  [year: string]: number;
};

export interface AdvancedSearchOptions {
  startYear: string;
  endYear: string;
  authors: string;
  excludeKeywords: string;
}

export interface ChatMessage {
    role: 'user' | 'model';
    parts: { text: string }[];
}

export interface PaperAnalysis {
  researchQuestion: string;
  methodology: string;
  keyFindings: string[];
  limitations: string[];
}