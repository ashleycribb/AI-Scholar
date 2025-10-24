
import type { ResearchPaper, ValidationResult, CrossrefWork } from '../types';
import * as crossrefService from './crossrefService';
import * as unpaywallService from './unpaywallService';

// A simple title similarity check.
const checkTitleSimilarity = (title1: string, title2: string): boolean => {
    const s1 = title1.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    const s2 = title2.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
    return s1.includes(s2) || s2.includes(s1);
};

// A simple author match check focusing on the first author's last name.
const checkAuthorMatch = (paperAuthors: string, crossrefAuthors: CrossrefWork['author']): boolean => {
    if (!crossrefAuthors || crossrefAuthors.length === 0) return false;
    const firstPaperAuthorLastName = paperAuthors.split(',')[0].trim().split(' ').pop()?.toLowerCase();
    if (!firstPaperAuthorLastName) return false;
    return crossrefAuthors.some(author => {
        const familyName = author.family?.toLowerCase();
        return familyName === firstPaperAuthorLastName;
    });
};

/**
 * Validates a research paper against external sources to generate a confidence score.
 * @param paper The ResearchPaper object to validate.
 * @returns An object containing the validation results and any updated paper metadata.
 */
export const validatePaper = async (paper: ResearchPaper): Promise<{ validation: ValidationResult, updatedPaperData: Partial<ResearchPaper> }> => {
    let score = 0;
    const checks: ValidationResult['checks'] = {
        crossref_match: false,
        title_match: false,
        author_match: false,
        open_access: false,
        source_enriched: paper.enrichmentSource === 'arXiv',
    };
    const log: string[] = [];
    const updatedPaperData: Partial<ResearchPaper> = {};

    // Base score for source enrichment from a reliable source like arXiv.
    if (checks.source_enriched) {
        score += 10;
        log.push('+10: Enriched from a high-quality source (arXiv).');
    }

    // Use Crossref as the primary source of truth for metadata.
    const crossrefData = await crossrefService.fetchPaperFromCrossref(paper);

    if (crossrefData && crossrefData.DOI) {
        checks.crossref_match = true;
        score += 40;
        log.push(`+40: Found a confident match in Crossref (DOI: ${crossrefData.DOI}).`);
        updatedPaperData.doi = crossrefData.DOI;

        // Check title similarity against the Crossref record.
        const crossrefTitle = crossrefData.title?.[0] || '';
        if (checkTitleSimilarity(paper.title, crossrefTitle)) {
            checks.title_match = true;
            score += 20;
            log.push('+20: Title matches the Crossref record.');
        } else {
            log.push(`Title mismatch: Our title "${paper.title}" vs Crossref "${crossrefTitle}".`);
        }

        // Check author match against the Crossref record.
        if (checkAuthorMatch(paper.authors, crossrefData.author)) {
            checks.author_match = true;
            score += 15;
            log.push('+15: Primary author matches the Crossref record.');
        } else {
            log.push('Author did not match Crossref record.');
        }

        // Check for a legal open-access version using the confirmed DOI via Unpaywall.
        const openAccessUrl = await unpaywallService.findOpenAccessPdf(crossrefData.DOI);
        if (openAccessUrl) {
            checks.open_access = true;
            score += 15;
            log.push('+15: Found an open-access PDF via Unpaywall.');
            updatedPaperData.pdfURL = openAccessUrl;
        } else {
            log.push('No open-access PDF found via Unpaywall.');
        }
    } else {
        log.push('Could not find a confident match in Crossref.');
    }

    const validation: ValidationResult = {
        score: Math.min(score, 100), // Cap score at 100
        status: 'validated',
        checks,
        log,
    };

    return { validation, updatedPaperData };
};