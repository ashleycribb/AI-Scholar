/**
 * utils/textScrubber.ts
 * 
 * PII text scrubber for Scholar Explorer telemetry before sending to the S3A LRS.
 * 
 * Rules:
 * - DO NOT redact digit runs that are part of:
 *   - An OpenAlex ID: W/A/S/I + digits (e.g. W2741809807, A5023888391, S137773608, I136199984)
 *   - A DOI: 10.xxxx/...
 *   - An ISBN: 10 or 13-digit ISBNs (hyphenated, spaced, or starting with 978/979)
 *   - An arXiv ID: modern YYMM.NNNNN(vN)? or legacy subject/NNNNNNN
 * - ONLY redact:
 *   - Standalone 9+ digit numbers (\b\d{9,}\b)
 *   - Emails
 *   - Phone numbers
 */

export function scrubText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  const preservedItems: string[] = [];
  const preserve = (match: string): string => {
    preservedItems.push(match);
    return `___PRESERVED_ACADEMIC_ID_${preservedItems.length - 1}___`;
  };

  let processed = text;

  // 1. Preserve DOIs: 10.xxxx/... (including https://doi.org/..., dx.doi.org/..., or doi:...)
  processed = processed.replace(/(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)?\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+/gi, preserve);

  // 2. Preserve arXiv IDs (URLs, explicit arXiv:..., modern YYMM.NNNNN, and legacy subject/NNNNNNN)
  processed = processed.replace(/https?:\/\/arxiv\.org\/(?:abs|pdf)\/[a-zA-Z0-9.\/-]+/gi, preserve);
  processed = processed.replace(/\barXiv:\s*[a-zA-Z0-9.\/-]+/gi, preserve);
  processed = processed.replace(/\b\d{4}\.\d{4,5}(?:v\d+)?\b/gi, preserve);
  processed = processed.replace(/\b[a-zA-Z-]+(?:\.[A-Za-z]{2})?\/\d{7}(?:v\d+)?\b/gi, preserve);

  // 3. Preserve ISBNs (hyphenated, spaced, unhyphenated 978/979, or with ISBN prefix)
  processed = processed.replace(/\b(?:ISBN(?:-13|-10)?:?\s*)?(?:97[89][-\s])(?:\d[-\s]?){9}[\dXx]\b/gi, preserve);
  processed = processed.replace(/\b(?:ISBN(?:-13|-10)?:?\s*)?(?:978|979)\d{10}\b/gi, preserve);
  processed = processed.replace(/\b(?:ISBN(?:-10|-13)?:?\s*)(?:\d[-\s]?){9}[\dXx]\b/gi, preserve);
  processed = processed.replace(/\b\d{1,5}[-\s]\d{1,7}[-\s]\d{1,7}[-\s][\dXx]\b/gi, preserve);

  // 4. Preserve OpenAlex IDs: W/A/S/I + digits (and full openalex URLs)
  processed = processed.replace(/https?:\/\/(?:www\.)?openalex\.org\/[WASIwasi]\d+/gi, preserve);
  processed = processed.replace(/\b[WASIwasi]\d+\b/g, preserve);

  // --- REDACTION ---
  // A. Redact Emails
  processed = processed.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '[redacted]');

  // B. Redact Phone Numbers (with standard separators: dashes, dots, spaces, or parens)
  processed = processed.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]\d{4}\b/g, '[redacted]');
  processed = processed.replace(/\b\d{3}[-.]\d{3}[-.]\d{4}\b/g, '[redacted]');

  // C. Redact Standalone 9+ digit numbers only (1-8 digit numbers like years, volumes are kept)
  processed = processed.replace(/\b\d{9,}\b/g, '[redacted]');

  // --- RESTORATION ---
  processed = processed.replace(/___PRESERVED_ACADEMIC_ID_(\d+)___/g, (_, idx) => {
    return preservedItems[Number(idx)] || '';
  });

  return processed;
}
