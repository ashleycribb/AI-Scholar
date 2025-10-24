import type { ResearchPaper as WebAppResearchPaper } from '../../types';

// The extension's verification status for a paper.
export interface Verification {
    state: 'unverified' | 'verified' | 'error';
    source?: 'Unpaywall';
    linkState: 'unchecked' | 'valid' | 'invalid';
    reason?: string;
    pdfURL?: string;
}

// The extension's representation of a paper. It needs a stable ID.
export interface LocalPaper extends WebAppResearchPaper {
    id: string; // A unique identifier, e.g., DOI or a hash of the title.
    savedAt: number; // Timestamp when it was saved.
    // Fix: Added optional 'verification' property to store enrichment status, resolving type errors in background.ts.
    verification?: Verification;
}
