import type { ResearchPaper as WebAppResearchPaper } from '../../types';

// The extension's representation of a paper. It needs a stable ID.
export interface LocalPaper extends WebAppResearchPaper {
    id: string; // A unique identifier, e.g., DOI or a hash of the title.
    savedAt: number; // Timestamp when it was saved.
}
