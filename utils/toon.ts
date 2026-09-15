
/**
 * TOON (Text-Oriented Object Notation) Utility
 * 
 * Compact serialization for research metadata including influence and access signals.
 * Designed to reduce token usage by ~30% compared to JSON when feeding large contexts to LLMs.
 */

import type { ResearchPaper } from '../types';

export const paperToToon = (paper: ResearchPaper, index: number): string => {
    // Format: #[Index]|T:{Title}|A:{Authors}|Y:{Year}|C:{Citations}|I:{Influence}|S:{Snippet}
    const t = (paper.title || "").replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').trim();
    const a = (paper.authors || "").split(',')[0].trim() + " et al";
    const y = paper.year || "0000";
    const c = paper.citations || 0;
    const i = paper.influentialCitationCount || 0;
    // Truncate abstract to keep context high-density
    const s = (paper.abstract || "").replace(/[\n\r]/g, ' ').replace(/\s+/g, ' ').substring(0, 500).trim();
    
    // Tag the paper if it has high influence to guide the model's weight
    const influenceTag = i > 10 ? "[HIGH_AUTHORITY]" : "";
    const oaTag = paper.isOpenAccess ? "[OA]" : "";
    
    return `#${index}${influenceTag}${oaTag}|T:${t}|A:${a}|Y:${y}|C:${c}|I:${i}|S:${s}`;
};

export const papersToToonCollection = (papers: ResearchPaper[]): string => {
    return papers.map((p, i) => paperToToon(p, i + 1)).join('\n');
};
