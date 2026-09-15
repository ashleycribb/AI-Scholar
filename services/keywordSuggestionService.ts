import type { ResearchPaper } from '../types';

export type KeywordCategory = 'concept' | 'method' | 'acronym' | 'topic';

export interface AcademicKeyword {
  term: string;
  category: KeywordCategory;
  count: number; // Number of abstracts containing this term
  frequency: number; // Total occurrences across all abstracts
  relevanceScore: number; // 0 to 1 score
  fromSelectedPaper: boolean; // Originated from user-selected paper abstracts
  paperTitles: string[]; // Paper titles where this term appears
  sampleSnippet?: string; // Short snippet from an abstract for context preview
}

export interface OpenAlexAutocompleteItem {
  id: string;
  displayName: string;
  hint?: string;
  entityType: string;
  citedByCount?: number;
  externalId?: string; // DOI or URL
}

// Common English stopwords
const GENERAL_STOPWORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', "aren't",
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't", 'doing',
  "don't", 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', "hadn't", 'has', "hasn't",
  'have', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here', "here's", 'hers', 'herself',
  'him', 'himself', 'his', 'how', "how's", 'i', "i'd", "i'll", "i'm", "i've", 'if', 'in', 'into', 'is',
  "isn't", 'it', "it's", 'its', 'itself', "let's", 'me', 'more', 'most', "mustn't", 'my', 'myself',
  'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
  'out', 'over', 'own', 'same', "shan't", 'she', "she'd", "she'll", "she's", 'should', "shouldn't", 'so',
  'some', 'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there',
  "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this', 'those', 'through', 'to',
  'too', 'under', 'until', 'up', 'very', 'was', "wasn't", 'we', "we'd", "we'll", "we're", "we've", 'were',
  "weren't", 'what', "what's", 'when', "when's", 'where', "where's", 'which', 'while', 'who', "who's", 'whom',
  'why', "why's", 'with', "won't", 'would', "wouldn't", 'you', "you'd", "you'll", "you're", "you've", 'your',
  'yours', 'yourself', 'yourselves'
]);

// Academic boilerplate and meta-terms to filter out so suggestions remain purely scholarly and topical
const ACADEMIC_BOILERPLATE = new Set([
  'abstract', 'paper', 'article', 'study', 'studies', 'research', 'author', 'authors',
  'approach', 'approaches', 'method', 'methods', 'methodology', 'methodologies', 'result',
  'results', 'analysis', 'analyses', 'analyze', 'analyzed', 'analyzing', 'finding', 'findings',
  'conclusion', 'conclusions', 'conclude', 'concluded', 'propose', 'proposes', 'proposed',
  'proposing', 'present', 'presents', 'presented', 'presenting', 'investigate', 'investigates',
  'investigated', 'investigation', 'aim', 'aims', 'aimed', 'discuss', 'discusses', 'discussed',
  'discussion', 'literature', 'background', 'show', 'shows', 'shown', 'showing', 'demonstrate',
  'demonstrates', 'demonstrated', 'using', 'used', 'use', 'uses', 'based', 'data', 'dataset',
  'datasets', 'information', 'system', 'systems', 'first', 'second', 'third', 'well', 'also',
  'however', 'therefore', 'thus', 'moreover', 'furthermore', 'significant', 'significantly',
  'various', 'different', 'provide', 'provides', 'provided', 'providing', 'including', 'new',
  'novel', 'overall', 'potential', 'challenge', 'challenges', 'future', 'work', 'works', 'field',
  'fields', 'area', 'areas', 'level', 'levels', 'high', 'low', 'case', 'cases', 'model', 'models',
  'key', 'main', 'major', 'important', 'importance', 'related', 'focus', 'focused', 'focuses',
  'examine', 'examines', 'examined', 'examining', 'explore', 'explores', 'explored', 'exploring',
  'report', 'reports', 'reported', 'evaluate', 'evaluates', 'evaluated', 'evaluation', 'test',
  'tests', 'tested', 'testing', 'perform', 'performed', 'performance', 'et', 'al', 'via', 'e.g',
  'i.e', 'etc', 'among', 'across', 'within', 'towards', 'toward', 'regarding', 'respective',
  'respectively', 'specifically', 'particular', 'particularly', 'critical', 'recent', 'recently'
]);

// Known academic research methodology patterns
const METHODOLOGY_PATTERNS = [
  'systematic review', 'systematic literature review', 'meta-analysis', 'meta analysis',
  'randomized controlled trial', 'randomised controlled trial', 'rct', 'empirical study',
  'empirical evaluation', 'qualitative study', 'qualitative research', 'quantitative study',
  'quantitative analysis', 'case study', 'case studies', 'mixed methods', 'scoping review',
  'bibliometric analysis', 'longitudinal study', 'cross-sectional study', 'cohort study',
  'grounded theory', 'thematic analysis', 'quasi-experimental', 'comparative analysis',
  'content analysis', 'experimental design', 'observational study', 'survey methodology',
  'benchmark evaluation', 'ablation study', 'phenomenological study', 'action research'
];

/**
 * Normalizes an extracted term into title or clean casing
 */
function cleanTerm(raw: string): string {
  return raw
    .trim()
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Determines whether a term is an academic acronym (e.g. FATE, LLM, NLP, MOOC, STEM)
 */
function isAcronym(token: string): boolean {
  return /^[A-Z]{2,6}$/.test(token) && !['AND', 'THE', 'FOR', 'NOT', 'BUT'].includes(token);
}

/**
 * Extracts a concise contextual snippet from the abstract mentioning the keyword
 */
function extractSnippet(abstract: string, term: string): string | undefined {
  if (!abstract || !term) return undefined;
  const lowerAbs = abstract.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const idx = lowerAbs.indexOf(lowerTerm);
  if (idx === -1) return undefined;

  const start = Math.max(0, idx - 45);
  const end = Math.min(abstract.length, idx + term.length + 55);
  let snippet = abstract.substring(start, end).trim();
  if (start > 0) snippet = '...' + snippet;
  if (end < abstract.length) snippet = snippet + '...';
  return snippet;
}

/**
 * Lightweight Keyword Suggestion Engine:
 * Analyzes paper abstracts (especially user-selected papers and active result papers),
 * identifies academic terms, key phrases, methodologies, and acronyms, and ranks them by relevance.
 */
export function extractAcademicKeywordsFromPapers(
  papers: ResearchPaper[],
  selectedPaperIds: Set<string> = new Set(),
  currentQuery: string = ''
): AcademicKeyword[] {
  if (!papers || papers.length === 0) return [];

  const lowerQuery = currentQuery.toLowerCase().trim();
  const queryTokens = new Set(
    lowerQuery.split(/\s+/).map(t => t.replace(/[^a-z0-9]/gi, '')).filter(Boolean)
  );

  // Term occurrence mappings: termKey -> metadata
  const termMap = new Map<string, {
    term: string;
    category: KeywordCategory;
    paperTitles: Set<string>;
    totalOccurrences: number;
    fromSelectedPaper: boolean;
    sampleSnippet?: string;
  }>();

  // Helper to record a detected term
  const recordTerm = (
    rawTerm: string,
    category: KeywordCategory,
    paper: ResearchPaper,
    isSelected: boolean,
    abstractText: string
  ) => {
    const cleaned = cleanTerm(rawTerm);
    if (!cleaned || cleaned.length < 3) return;

    const lower = cleaned.toLowerCase();

    // Skip if identical to current full query or purely a single query token
    if (lower === lowerQuery) return;
    if (queryTokens.has(lower) && !cleaned.includes(' ')) return;

    // Check against stopwords
    if (GENERAL_STOPWORDS.has(lower) || ACADEMIC_BOILERPLATE.has(lower)) return;

    const existing = termMap.get(lower);
    if (existing) {
      existing.paperTitles.add(paper.title);
      existing.totalOccurrences += 1;
      if (isSelected) existing.fromSelectedPaper = true;
      if (!existing.sampleSnippet && abstractText) {
        existing.sampleSnippet = extractSnippet(abstractText, cleaned);
      }
    } else {
      termMap.set(lower, {
        term: cleaned,
        category,
        paperTitles: new Set([paper.title]),
        totalOccurrences: 1,
        fromSelectedPaper: isSelected,
        sampleSnippet: abstractText ? extractSnippet(abstractText, cleaned) : undefined
      });
    }
  };

  // 1. Scan each paper
  papers.forEach(paper => {
    const isSelected = selectedPaperIds.has(paper.id);
    const abstract = paper.abstract || '';
    const title = paper.title || '';
    const fullText = `${title}. ${abstract}`;

    // A. Check for predefined academic methodologies in abstract and title
    const lowerText = fullText.toLowerCase();
    for (const method of METHODOLOGY_PATTERNS) {
      if (lowerText.includes(method)) {
        // Format methodology cleanly
        const formatted = method.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        recordTerm(formatted, 'method', paper, isSelected, abstract);
      }
    }

    // B. Check explicitly tagged paper.keyConcepts (e.g. from OpenAlex or AI enrichment)
    if (Array.isArray(paper.keyConcepts)) {
      paper.keyConcepts.forEach(concept => {
        if (typeof concept === 'string') {
          recordTerm(concept, 'concept', paper, isSelected, abstract);
        }
      });
    }

    // C. Extract Acronyms from abstract & title (e.g. FATE, LLM, GPT, NLP, HEI, MOOC)
    const words = fullText.split(/[\s,.;:()\[\]{}"'“”‘’/\\+*&|#~!?]+/);
    for (const word of words) {
      if (isAcronym(word)) {
        recordTerm(word, 'acronym', paper, isSelected, abstract);
      }
    }

    // D. Extract 2-word and 3-word n-grams (phrases) from abstract
    if (abstract && abstract !== 'No abstract available for this paper.') {
      // Split into sentences then tokens
      const sentences = abstract.split(/[.!?]+/).filter(s => s.trim().length > 10);
      for (const sentence of sentences) {
        const tokens = sentence
          .split(/[\s,;:()\[\]{}"'“”‘’/\\+*&|#~]+/)
          .map(t => t.trim())
          .filter(t => t.length > 0);

        for (let i = 0; i < tokens.length - 1; i++) {
          const w1 = tokens[i].toLowerCase();
          const w2 = tokens[i + 1].toLowerCase();

          // Bigrams: exclude if start or end is stopword/boilerplate
          if (
            !GENERAL_STOPWORDS.has(w1) &&
            !GENERAL_STOPWORDS.has(w2) &&
            !ACADEMIC_BOILERPLATE.has(w1) &&
            !ACADEMIC_BOILERPLATE.has(w2) &&
            w1.length >= 3 &&
            w2.length >= 3 &&
            !/^\d+$/.test(w1) &&
            !/^\d+$/.test(w2)
          ) {
            const bigram = `${tokens[i]} ${tokens[i + 1]}`;
            // Format casing
            const formatted = `${w1.charAt(0).toUpperCase() + w1.slice(1)} ${w2.charAt(0).toUpperCase() + w2.slice(1)}`;
            recordTerm(formatted, 'topic', paper, isSelected, abstract);
          }

          // Trigrams (e.g. "higher education students", "artificial intelligence ethics")
          if (i < tokens.length - 2) {
            const w3 = tokens[i + 2].toLowerCase();
            if (
              !GENERAL_STOPWORDS.has(w1) &&
              !GENERAL_STOPWORDS.has(w3) &&
              !ACADEMIC_BOILERPLATE.has(w1) &&
              !ACADEMIC_BOILERPLATE.has(w3) &&
              w1.length >= 3 &&
              w3.length >= 3 &&
              !/^\d+$/.test(w1) &&
              !/^\d+$/.test(w3)
            ) {
              const trigram = `${w1.charAt(0).toUpperCase() + w1.slice(1)} ${tokens[i + 1]} ${w3.charAt(0).toUpperCase() + w3.slice(1)}`;
              recordTerm(trigram, 'concept', paper, isSelected, abstract);
            }
          }
        }
      }
    }
  });

  // Calculate scores and format results
  const totalPapers = Math.max(1, papers.length);
  const results: AcademicKeyword[] = [];

  termMap.forEach((val) => {
    const paperCount = val.paperTitles.size;

    // Filter out terms that appear in only 1 paper UNLESS it is from a selected paper or is an acronym/method
    if (paperCount < 2 && !val.fromSelectedPaper && val.category !== 'method' && val.category !== 'acronym') {
      return;
    }

    // Relevance scoring:
    // - Document coverage ratio (paperCount / totalPapers)
    // - Boost if from user-selected paper (+0.35)
    // - Boost for methodologies (+0.25)
    // - Boost for multi-word phrases (+0.15)
    let score = (paperCount / totalPapers) * 0.5;
    if (val.fromSelectedPaper) score += 0.35;
    if (val.category === 'method') score += 0.25;
    if (val.term.includes(' ')) score += 0.15;
    if (val.category === 'acronym') score += 0.1;

    // Normalize score to 0..1
    const relevanceScore = Math.min(0.99, Math.round(score * 100) / 100);

    results.push({
      term: val.term,
      category: val.category,
      count: paperCount,
      frequency: val.totalOccurrences,
      relevanceScore,
      fromSelectedPaper: val.fromSelectedPaper,
      paperTitles: Array.from(val.paperTitles).slice(0, 3),
      sampleSnippet: val.sampleSnippet
    });
  });

  // Sort by selected boost, then relevance score, then paper count
  results.sort((a, b) => {
    if (a.fromSelectedPaper !== b.fromSelectedPaper) {
      return a.fromSelectedPaper ? -1 : 1;
    }
    if (b.relevanceScore !== a.relevanceScore) {
      return b.relevanceScore - a.relevanceScore;
    }
    return b.count - a.count;
  });

  return results.slice(0, 24); // Return top 24 suggested academic keywords
}

/**
 * Refines an academic search query with a suggested term.
 * Supports appending cleanly, boolean AND concatenation, or replacing.
 */
export function refineQuery(
  currentQuery: string,
  term: string,
  mode: 'append' | 'and' | 'replace' = 'and'
): string {
  const trimmed = currentQuery.trim();
  const clean = term.trim();

  if (!trimmed) return clean;
  if (mode === 'replace') return clean;

  // Check if term is already in query to prevent duplication
  const lowerQuery = trimmed.toLowerCase();
  const lowerTerm = clean.toLowerCase();
  if (lowerQuery.includes(lowerTerm)) {
    return trimmed;
  }

  // If term has spaces, wrap in quotes for precise academic scoping
  const formattedTerm = clean.includes(' ') && !clean.startsWith('"') ? `"${clean}"` : clean;

  if (mode === 'and') {
    return `${trimmed} AND ${formattedTerm}`;
  }

  return `${trimmed} ${formattedTerm}`;
}

// In-memory cache for OpenAlex autocomplete to keep typing ultra-fast
const autocompleteCache = new Map<string, { data: OpenAlexAutocompleteItem[]; timestamp: number }>();
const CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes

/**
 * Calls OpenAlex Autocomplete API via the local proxy
 */
export async function fetchOpenAlexAutocomplete(
  query: string,
  entityType: 'works' | 'topics' = 'works'
): Promise<OpenAlexAutocompleteItem[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return [];

  const cacheKey = `${entityType}:${trimmed.toLowerCase()}`;
  const cached = autocompleteCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  try {
    const res = await fetch(`/api/openalex/autocomplete?q=${encodeURIComponent(trimmed)}&entity_type=${entityType}`);
    if (!res.ok) return [];
    const json = await res.json();
    const results: OpenAlexAutocompleteItem[] = (json.results || []).map((r: any) => ({
      id: r.id || r.short_id,
      displayName: r.display_name || '',
      hint: r.hint || (r.authorships ? r.authorships.map((a: any) => a.author?.display_name).filter(Boolean).slice(0, 3).join(', ') : ''),
      entityType: r.entity_type || entityType,
      citedByCount: r.cited_by_count,
      externalId: r.external_id || r.filter_key
    }));

    autocompleteCache.set(cacheKey, { data: results, timestamp: Date.now() });
    return results;
  } catch (err) {
    console.warn('[OpenAlex Autocomplete] Request failed:', err);
    return [];
  }
}
