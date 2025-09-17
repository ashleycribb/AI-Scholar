export interface ResearchPaper {
  title: string;
  authors: string;
  year: string;
  summary: string;
  sourceURL?: string;
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