
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
