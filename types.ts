
export type SummaryLength = 'short' | 'medium' | 'detailed';
export type SummaryStyle = 'paragraph' | 'bullets' | 'qa';
export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'harvard' | 'ieee' | 'vancouver' | 'bibtex';
export type AppMode = 'search' | 'dashboard' | 'evaluation';
export type UserRole = 'participant' | 'pi_researcher' | 'committee_member' | 'guest';

export interface UserSession {
  userId: string;         // De-identified UUID for students; ID for researchers
  displayName: string;    // e.g., "Participant #88A" or "Dr. Young Baek (Committee)"
  role: UserRole;
  sessionId: string;      // Shared interactionSessionId for xAPI telemetry
  inviteCode?: string;    // Associated study invite token
  createdAt: string;

  // Backwards-compatible aliases
  id?: string;
  name?: string;
}

export type User = UserSession;

export interface UserSettings {
  institutionalProxy?: string;
  institutionName?: string;
  ssoProvider?: string;
  ssoTenant?: string;
  isSsoEnabled?: boolean;
  oaiEndpoint?: string;
  isOaiEnabled?: boolean;
  mcpServerUrl?: string;
  isMcpEnabled?: boolean;
  isHarvardLibraryEnabled?: boolean;
  // Scholar Bridge Integration (Legacy)
  scholarBridgeApiKey?: string;
  scholarBridgeUserId?: string;
  isScholarBridgeEnabled?: boolean;
  // GNO Integration
  isGnoEnabled?: boolean;
  gnoBaseUrl?: string;
  // Google Scholar (SerpApi) Integration
  serpApiKey?: string;
  isSerpApiEnabled?: boolean;
  // Snapshot Save Settings
  autoSaveSnapshot?: boolean;
}

export interface AdvancedSearchOptions {
  startYear?: string;
  endYear?: string;
  authors?: string;
  excludeKeywords?: string;
  inclusionCriteria?: string;
  exclusionCriteria?: string;
  studyDesign?: string;
  journal?: string;
  minCitations?: string;
  titleKeywords?: string;
  abstractKeywords?: string;
  isOpenAccess?: boolean;
  doi?: string;
  institutionName?: string;
  institutionId?: string;
  authorId?: string;
  domain?: string;
}

export interface AuthorProfile {
  id?: string;
  name: string;
  orcid?: string;
}

export interface SemanticSpan {
    text: string;
    score: number;
}

export interface SciteTally {
    doi: string;
    supporting: number;
    mentioning: number;
    contrasting: number;
    total: number;
}

export interface ResearchPaper {
  id: string;
  title: string;
  authors: string;
  year: number;
  abstract: string;
  sourceURL?: string;
  pdfURL?: string;
  citations?: number;
  semanticScore?: number; // 0-100 score based on vector similarity
  semanticHighlights?: SemanticSpan[]; // Top matching passages
  
  // Extended metadata
  doi?: string;
  journal?: string;
  authorList?: AuthorProfile[];
  influentialCitationCount?: number;
  isOpenAccess?: boolean;
  isRetracted?: boolean;
  isInDoaj?: boolean;
  enrichmentSource?: string;
  
  // Scholar Bridge Sync Status
  scholarKey?: string; // The item key in the library if synced
  scholarStatus?: 'synced' | 'pending' | 'error';

  // Analysis & Validation
  validation?: ValidationResult;
  savedAnalysis?: PaperAnalysis;
  keyConcepts?: string[];
  keyConceptsState?: 'idle' | 'loading' | 'loaded' | 'error';
  highlights?: { category: string; text: string }[];
  knowledgeGraph?: KnowledgeGraph;
  knowledgeGraphState?: 'idle' | 'loading' | 'loaded' | 'error';
  verificationResult?: VerificationResult;
  doiState?: 'idle' | 'loading' | 'loaded' | 'error';
  
  // Integration specific
  coreId?: string;
  repositoryURL?: string;
  openAccessPdfUrl?: string;
  sciteTally?: SciteTally;
  sciteTallyState?: 'idle' | 'loading' | 'loaded' | 'error';
  laymanSummary?: string;
  isLaymanLoading?: boolean;
}

export type PublicationYearData = { year: number; count: number }[];
export type AuthorFrequencyData = { author: string; count: number; totalCitations: number }[];

export interface Cluster {
  clusterName: string;
  description: string;
  paperTitles: string[];
  keywords?: string[];
}

export interface GraphNode {
  id: string;
  year: number;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface AnalysisResult {
  clusters: Cluster[];
  publicationYears: PublicationYearData;
  topAuthors: AuthorFrequencyData;
  domain?: string;
  graph?: {
      nodes: GraphNode[];
      edges: GraphEdge[];
  };
}

export interface ChatMessage {
  role: 'user' | 'model' | 'tool';
  text?: string;
  parts?: Array<{ text?: string; toolCall?: any; toolResponse?: any }>;
  sources?: GroundingSource[];
}

export interface GroundingSource {
  uri: string;
  title: string;
}

export type SortKey = 'relevance' | 'year' | 'citations';
export type SortDirection = 'asc' | 'desc';

export interface SortConfig {
  key: SortKey;
  direction: SortDirection;
}

export interface ModelDefinition {
  id: string;
  name: string;
}

export interface ConnectedPaper {
  title: string;
  authors: string;
  year: number;
  connection: string;
  summary: string;
  sourceURL?: string;
}

export interface SearchSourceInfo {
  id: string;
  name: string;
  description: string;
  isCustomApproved?: boolean;
  officialUrl?: string;
  endpointUrl?: string;
  recordCount?: string;
  badge?: string;
}

export interface DiscoveredSource {
  id: string;
  name: string;
  description: string;
  category: 'dissertations' | 'biomedical' | 'cs_tech' | 'social_edu' | 'multidisciplinary' | 'open_data' | 'institutional_repo';
  categoryLabel: string;
  endpointUrl: string;
  protocol: 'REST' | 'OAI-PMH' | 'SPARQL' | 'GraphQL' | 'OpenSearch';
  license: string;
  recordCount: string;
  officialUrl: string;
  status: 'discovered' | 'proposed' | 'approved_active' | 'rejected';
  proposedAt?: string;
  approvedAt?: string;
  pingStatus?: 'online' | 'unverified' | 'offline';
  pingLatencyMs?: number;
  sampleQueryUrl?: string;
  emailRecipient?: string;
  notes?: string;
  approvalToken?: string;
}

export interface SourceProposalResult {
  success: boolean;
  source: DiscoveredSource;
  emailRecipient: string;
  emailSubject: string;
  emailHtml: string;
  emailText: string;
  mailtoUrl: string;
  approvalUrl: string;
  message: string;
}

export interface LibraryMcpProspectusConfig {
  institutionName: string;
  libraryName: string;
  deanName: string;
  deanEmail: string;
  discoveryPlatform: 'alma_primo' | 'ebsco_eds' | 'oclc_worldcat' | 'openathens' | 'ezproxy_custom';
  ezproxyPrefix: string;
  targetDatabases: string[];
  mcpTransport: 'sse' | 'stdio';
  authType: 'sso_saml' | 'ip_restricted' | 'api_key_readonly';
  investigatorName?: string;
  investigatorEmail?: string;
  doctoralInstitution?: string;
  employmentInstitution?: string;
  proposalPreset?: 'blank_template' | 'uncw_staff' | 'boise_state' | 'custom';
  includeIntakeForm?: boolean;
}

export interface PaperAnalysis {
  researchQuestion: string;
  methodology: string;
  keyFindings: string[];
  limitations: string[];
}

export interface SynthesisResult extends Array<{
  title: string;
  mainFinding: string;
  methodology: string;
  context: string;
}> {}

export interface SuggestionsResult {
  seedPaper: ResearchPaper;
  suggestions: string[];
}

export interface ValidationResult {
  score: number;
  status: string;
  checks: {
      crossref_match: boolean;
      title_match: boolean;
      author_match: boolean;
      open_access: boolean;
      doaj_indexed: boolean;
      source_enriched: boolean;
      has_citations: boolean;
  };
  log?: string[];
  vacs?: number;
  verdict?: Verdict;
  breakdown?: {
      credibility: number;
      evidence: number;
      reproducibility: number;
      citations: number;
      temporal: number;
  };
  evidence?: EvidenceSpan[];
  rationale?: string[];
}

export type Verdict = 'Verified' | 'Inconclusive' | 'Questionable' | 'Refuted' | 'Correct' | 'Incorrect';

export interface VerificationResult {
    doi?: string;
    title: string;
    vacs: number;
    verdict: Verdict;
    breakdown: {
        credibility: number;
        evidence: number;
        reproducibility: number;
        citations: number;
        temporal: number;
    };
    evidence: EvidenceSpan[];
    rationale: string[];
}

export interface EvidenceSpan {
  source: string;
  passage: string;
  score?: number;
}

export interface CitationStats {
  total: number;
  supportCount: number;
  contradictCount: number;
  supportRatio: number;
}

export interface Metadata {
  doi?: string;
  title: string;
  authors: string[];
  journal?: string;
  year: number;
  citations?: number;
  isRetracted?: boolean;
  isOpenAccess?: boolean;
  hasData?: boolean;
  hasCode?: boolean;
  temporalScore?: number;
  credibilityScore?: number;
  reproducibilityScore?: number;
  abstract?: string;
  pdfURL?: string;
}

export interface GoldStandardPaper {
  paper_id: string;
  title: string;
  abstract: string;
  authors: string;
  year: number;
  source?: string;
  crossref_verified: boolean;
  peer_reviewed: boolean;
  open_access: boolean;
  author_verified: boolean;
  factual_accuracy_score: number;
  notes: string;
  label: 'verified' | 'inconclusive' | 'refuted';
}

export interface UserStudyData {
  participantId: string;
  task: {
      paper: ResearchPaper;
      claim: string;
  };
  group: 'A' | 'B';
  vacsResult?: VerificationResult;
  userVerdict: 'Correct' | 'Incorrect' | null;
  isAdequate: 'Yes' | 'No' | null;
  usefulness: number;
  timeToVerify: number;
}

export interface TestHarnessResult {
  isCorrect: boolean;
}

export interface Project {
  id: string;
  name: string;
  color?: string;
}

export type EntityType = 'Concept' | 'Methodology' | 'Finding' | 'Context';

export interface Entity {
  id: string;
  type: EntityType;
  label: string;
  description: string;
}

export interface Relationship {
  source: string;
  target: string;
  label: string;
  description: string;
}

export interface KnowledgeGraph {
  entities: Entity[];
  relationships: Relationship[];
}

export interface JournalRecommendation {
  name: string;
  publisher?: string;
  fitScore: number;
  impactFactorEstimate?: number;
  matchRationale: string;
  scopeMatch: string;
}

export interface Organization {
  id: string;
  name: string;
  country: string;
  types?: string[];
}

export interface LiteratureReviewDraft {
  title: string;
  sections: { heading: string; content: string }[];
}

export interface ResearchIdea {
  title: string;
  description: string;
  novelty: string;
  potentialImpact: string;
  feasibility: string;
}

export interface ScientificHypothesis {
  hypothesis: string;
  rationale: string;
  proposedExperiment: string;
  expectedOutcome: string;
}

export interface InnovationResult {
  ideas: ResearchIdea[];
  hypotheses: ScientificHypothesis[];
  interdisciplinaryConnections: {
      domains: string[];
      connection: string;
      potential: string;
  }[];
}

export interface DeepResearchStep {
  id: string;
  query: string;
  status: 'pending' | 'searching' | 'completed' | 'error';
  papersFound: number;
  rationale?: string; // Why was this step created?
}

export interface VerifiedClaim {
    text: string;
    citationIds: string[];
    confidence: number;
}

export interface DeepResearchReport {
  title: string;
  summary: string;
  sections: { 
      heading: string; 
      content: string; 
      claims?: VerifiedClaim[]; 
  }[];
  references: ResearchPaper[];
}

export interface DeepResearchReflection {
    isSufficient: boolean;
    missingInformation: string;
    nextQuery: string;
    reasoning: string;
}

export interface LocalLibraryMetadata {
  paperCount: number;
  collectionCount: number;
}

export interface McpStatus {
  isConnected: boolean;
  serverUrl: string;
  version?: string;
  capabilities: string[];
}

export interface StudyTask {
  id: string;
  title: string;
  description: string;
  targetQuery?: string;
  status: 'pending' | 'completed';
  type?: 'external' | 'internal';
}

export interface SurveyResponse {
  easeOfUse: string;
  helpfulness: string;
  comments: string;
}

export interface RagStatus {
  indexedCount: number;
  isIndexing: boolean;
}

export interface CrossrefWork {
  title?: string[];
  author?: any[];
  URL?: string;
  DOI: string;
  abstract?: string;
  published?: any;
  created?: any;
  resource?: any;
  publisher?: string;
  is_referenced_by_count?: number;
  [key: string]: any;
}

export interface ProjectReport {
    title: string;
    summary: string;
    performanceMetrics: {
        label: string;
        value: string | number;
        description: string;
    }[];
    futureProofing: {
        category: string;
        recommendations: string[];
    }[];
    technicalAlternatives: {
        name: string;
        description: string;
        pros: string[];
        cons: string[];
    }[];
    sourcePapers: ResearchPaper[];
}

export interface MarketplacePack {
  id: string;
  name: string;
  version: string;
  status: 'draft' | 'review' | 'approved' | 'deprecated';
  summary: string;
  trust_tier: 'experimental' | 'local-reviewed' | 'maintainer-approved';
  risk_level: 'low' | 'medium' | 'high';
  runtime_targets: string[];
  ontology_url: string;
  xapi_profile_url: string;
  tools_url: string;
  workflow_url: string;
  trust_card_url: string;
  download_url: string;
  sha256: string;
}

export interface MarketplaceCatalog {
  schema: string;
  generated_at: string;
  source: string;
  packs: MarketplacePack[];
}

// --- Open Scholarly Registries & Infrastructure Types ---

export interface DataCiteWork {
  id: string;
  doi: string;
  title: string;
  description?: string;
  creators: { name: string; orcid?: string }[];
  publicationYear: number;
  resourceTypeGeneral?: string; // Dataset, Software, Preprint, Instrument, Audiovisual, Text
  resourceType?: string;
  citationsCount?: number;
  viewsCount?: number;
  downloadsCount?: number;
  fundingReferences?: {
    funderName: string;
    funderIdentifier?: string;
    awardNumber?: string;
    awardTitle?: string;
  }[];
  license?: string;
  url?: string;
}

export interface OpenCitationsLink {
  citingDoi: string;
  citedDoi: string;
  creationDate?: string;
  timespan?: string;
  journalScind?: boolean;
  authorScind?: boolean;
}

export interface OpenAireProject {
  id: string;
  code: string; // Grant agreement ID
  title: string;
  acronym?: string;
  funder: string; // e.g., European Commission, NIH, Wellcome Trust, NSF
  fundingStream?: string; // Horizon Europe, FP7, ERC
  startDate?: string;
  endDate?: string;
  openAccessMandatePublications?: boolean;
  openAccessMandateDatasets?: boolean;
  participants?: string[];
  websiteUrl?: string;
  publicationsCount?: number;
  datasetsCount?: number;
}

export interface EuropePmcArticle {
  id: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title: string;
  authorString?: string;
  journalTitle?: string;
  pubYear: number;
  abstractText?: string;
  isOpenAccess: boolean;
  inEpmc: boolean;
  hasPDF: boolean;
  citedByCount?: number;
  meshTerms?: string[];
  grants?: { grantId?: string; agency?: string }[];
  fullTextUrl?: string;
}

export interface DblpPublication {
  id: string;
  key: string;
  title: string;
  authors: string[];
  year: number;
  venue?: string;
  type?: string; // Conference, Article, Book, Informational
  doi?: string;
  ee?: string; // Electronic edition link
  url?: string;
}

export interface RegistryOverview {
  id: string;
  name: string;
  category: 'PID & Metadata Registries' | 'Scholarly Knowledge Graphs' | 'Linked Data & Citation Graphs' | 'Domain-Specific Open Registries' | 'Doctoral & Academic Registries' | 'Research Data & Artifact Registries';
  primaryRole: string;
  strengths: string;
  interfaces: string[];
  license: string;
  officialUrl: string;
  apiDocsUrl: string;
  status: 'active' | 'operational' | 'degraded';
}
