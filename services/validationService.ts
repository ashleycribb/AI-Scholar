
import type { ResearchPaper, ValidationResult, CrossrefWork } from '../types';
import * as crossrefService from './crossrefService';
import * as unpaywallService from './unpaywallService';
import * as doajService from './doajService';

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
        doaj_indexed: false,
        source_enriched: paper.enrichmentSource === 'arXiv',
        has_citations: (paper.citations || 0) > 10,
    };
    const log: string[] = [];
    const updatedPaperData: Partial<ResearchPaper> = {};

    // Base score for source enrichment from a reliable source like arXiv.
    if (checks.source_enriched) {
        score += 10;
        log.push('+10: Enriched from a high-quality source (arXiv).');
    }

    // Add points for having a notable number of citations
    if (checks.has_citations) {
        score += 10;
        log.push('+10: Paper has a notable number of citations, indicating academic validation.');
    }


    // Use Crossref as the primary source of truth for metadata.
    const crossrefData = await crossrefService.fetchPaperFromCrossref(paper);
    const effectiveDoi = paper.doi || crossrefData?.DOI;
    updatedPaperData.doi = effectiveDoi;

    if (crossrefData) {
        checks.crossref_match = true;
        score += 30;
        log.push(`+30: Found a confident match in Crossref (DOI: ${crossrefData.DOI}).`);

        const crossrefTitle = crossrefData.title?.[0] || '';
        if (checkTitleSimilarity(paper.title, crossrefTitle)) {
            checks.title_match = true;
            score += 20;
            log.push('+20: Title matches the Crossref record.');
        } else {
            log.push(`Title mismatch: Our title "${paper.title}" vs Crossref "${crossrefTitle}".`);
        }

        if (checkAuthorMatch(paper.authors, crossrefData.author)) {
            checks.author_match = true;
            score += 15;
            log.push('+15: Primary author matches the Crossref record.');
        } else {
            log.push('Author did not match Crossref record.');
        }
    } else {
        log.push('Could not find a confident match in Crossref.');
    }
    
    if (effectiveDoi) {
        const [openAccessUrl, doajData] = await Promise.all([
            unpaywallService.findOpenAccessPdf(effectiveDoi),
            doajService.searchByDoi(effectiveDoi)
        ]);
        
        let oaConfirmed = false;

        if (doajData) {
            checks.doaj_indexed = true;
            score += 20; // This is a strong signal of legitimacy and OA status
            log.push('+20: Paper is indexed in the Directory of Open Access Journals (DOAJ).');
            oaConfirmed = true;
        } else {
            log.push('Paper not found in DOAJ.');
        }
        
        if (openAccessUrl) {
            updatedPaperData.pdfURL = openAccessUrl;
            checks.open_access = true; // This check specifically means a direct PDF link was found
            log.push('Found a direct Open Access PDF link via Unpaywall.');
            oaConfirmed = true;
        }
        
        // If either service confirms OA status, award points.
        if (oaConfirmed) {
            score += 15;
            log.push('+15: Confirmed as Open Access (via DOAJ or Unpaywall).');
        } else {
             log.push('No Open Access version found via Unpaywall or DOAJ.');
        }
    } else {
        log.push('Skipping DOAJ and Unpaywall checks (no DOI).');
    }

    const validation: ValidationResult = {
        score: Math.min(score, 100), // Cap score at 100
        status: 'validated',
        checks,
        log,
    };

    return { validation, updatedPaperData };
};