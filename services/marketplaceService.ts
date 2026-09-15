import { MarketplaceCatalog, CapabilityPack } from '../types/marketplace';

export const STARTER_PACKS: CapabilityPack[] = [
    {
        domain: 'academic metadata',
        manifest: {
            id: "academic-metadata-verification",
            name: "Academic Metadata Verification",
            version: "0.1.0",
            status: "approved",
            summary: "Verifies title, authors, DOI, year, abstract, source-service provenance, open-access links, and identifier consistency.",
            trust: {
                tier: "maintainer-approved",
                reviewer: "Scholar Explorer Local Lab Team",
                risk_level: "low"
            },
            semantics: {
                ontology: "ontology.ttl",
                verbs: ["verified", "mismatched", "reviewed"],
                objects: ["source_package", "paper", "metadata_field"]
            },
            runtime: {
                targets: ["scholar-explorer-local-lab", "local-python", "MCP"],
                allowed_tools: ["read_file", "grep", "web_fetch", "metadata_parser", "doi_resolver"],
                denied_tools: ["publish", "credential_export", "rm_rf"]
            },
            evidence: {
                xapi_profile: "xapi-profile.jsonld",
                required_artifacts: ["metadata-verification-report.json", "metadata-verification-report.md"]
            },
            files: {
                ontology: "ontology.ttl",
                xapi_profile: "xapi-profile.jsonld",
                tools: "tools.json",
                workflow: "workflow.yaml",
                trust_card: "trust-card.md"
            }
        },
        ontology_content: `@prefix oh: <http://openharness.org/ns/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .

oh:AcademicMetadataVerificationPack a oh:CapabilityPack ;
    rdfs:label "Academic Metadata Verification Pack" ;
    rdfs:comment "Formally defines states and properties for academic citation checking." .

oh:hasVerifiedDOI a owl:DatatypeProperty ;
    rdfs:domain oh:ScholarlyArtifact ;
    rdfs:range xsd:string .

oh:provenanceService a owl:ObjectProperty ;
    rdfs:domain oh:ScholarlyArtifact ;
    rdfs:range oh:DiscoveryService .`,
        xapi_content: `{
  "@context": "https://w3id.org/xapi/profiles/context",
  "id": "https://w3id.org/xapi/profiles/academic-metadata-verification-v0.1.0",
  "type": "Profile",
  "conformsTo": "https://w3id.org/xapi/profiles#1.0",
  "prefLabel": { "en": "Academic Metadata Verification" },
  "definition": { "en": "Statements recorded during metadata structural checks." },
  "concepts": [
    {
      "id": "http://openharness.org/verbs/verified",
      "type": "Verb",
      "prefLabel": { "en": "verified" },
      "definition": { "en": "Asserts that a given metadata attribute exactly matches authority sources." }
    },
    {
      "id": "http://openharness.org/verbs/mismatched",
      "type": "Verb",
      "prefLabel": { "en": "mismatched" },
      "definition": { "en": "Flags an inconsistency between the record and the online indexed DOI service." }
    }
  ]
}`,
        tools_content: `{
  "policy": "strict-whitelist",
  "capabilities": {
    "metadata_parser": {
      "path": "bin/parsers/crossref.py",
      "sandbox": "container",
      "rate_limit": "20/min"
    },
    "doi_resolver": {
      "endpoint": "https://api.crossref.org/works/",
      "requires_api_key": false
    }
  },
  "constraints": {
    "read_only_scopes": ["workspace/papers/"],
    "blocked_directories": ["~/.aws", "~/.ssh", "/etc"]
  }
}`,
        workflow_content: `name: Academic Metadata Alignment
version: 0.1.0
pipeline:
  - step: ingest_source_queue
    tool: read_file
    timeout: 30
    on_failure: fail_study
  
  - step: cross_reference_doi
    tool: doi_resolver
    timeout: 60
    on_failure: mark_unverified
    
  - step: human_resolver_gate
    type: human-in-the-loop
    condition: is_mismatched == true
    prompt: "An inconsistency is identified. Please reconcile authors or DOI manually."
    
  - step: compile_evidence_assertions
    tool: metadata_parser
    artifacts:
      - metadata-verification-report.json`,
        trust_card_content: `# Trust Card: Academic Metadata Verification
### Tier: Maintainer Approved | Risk Level: Low

#### Intended Use
Designed for checking bibliographic properties of standard PDF, XML, or database inputs before initiating deep research workflows. Formulates rigorous claims based solely on confirmed IDs.

#### Verified Elements
- Cross-examination of titles and authors against Crossref and Scopus authorities.
- Multi-source concordance index of abstracts.
- Open-access accessibility flag resolution.

#### Limitations & Non-Goals
- Does **not** check the semantic validity of the arguments in the paper text.
- Does **not** perform citation network layout calculation.
- Requires online connectivity to resolve DOIs.`
    },
    {
        domain: 'research question',
        manifest: {
            id: "research-question-formation",
            name: "Research Question Formation",
            version: "0.1.0",
            status: "review",
            summary: "Turns a verified source package into scoped, falsifiable research questions. Requires assumptions, lens/fence declarations, and uncertainty notes.",
            trust: {
                tier: "local-reviewed",
                reviewer: "University Academic Board",
                risk_level: "low"
            },
            semantics: {
                ontology: "ontology.ttl",
                verbs: ["formulated", "scoped", "hypothesized"],
                objects: ["problem_statement", "research_question", "assumption_list"]
            },
            runtime: {
                targets: ["scholar-explorer-local-lab", "local-python"],
                allowed_tools: ["read_file", "grep", "llm_query"],
                denied_tools: ["web_fetch", "publish"]
            },
            evidence: {
                xapi_profile: "xapi-profile.jsonld",
                required_artifacts: ["falsifiable-questions.json", "assumption-boundaries.md"]
            },
            files: {
                ontology: "ontology.ttl",
                xapi_profile: "xapi-profile.jsonld",
                tools: "tools.json",
                workflow: "workflow.yaml",
                trust_card: "trust-card.md"
            }
        },
        ontology_content: `@prefix oh: <http://openharness.org/ns/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2051/rdf-schema#> .

oh:ResearchQuestionFormationPack a oh:CapabilityPack ;
    rdfs:label "Research Question Formation" ;
    rdfs:comment "Structures logic for creating falsifiable research goals." .

oh:definesAssumption a owl:ObjectProperty ;
    rdfs:domain oh:ResearchQuestion ;
    rdfs:range oh:FalsifiableAssumption .`,
        xapi_content: `{
  "@context": "https://w3id.org/xapi/profiles/context",
  "id": "https://w3id.org/xapi/profiles/research-question-formation-v0.1.0",
  "type": "Profile",
  "prefLabel": { "en": "Research Question Formation" },
  "definition": { "en": "Records how an agent structures questions and hypotheses." },
  "concepts": [
    {
      "id": "http://openharness.org/verbs/formulated",
      "type": "Verb",
      "prefLabel": { "en": "formulated" },
      "definition": { "en": "Saves a formal research question statement with test criteria." }
    }
  ]
}`,
        tools_content: `{
  "policy": "sandboxed-only",
  "capabilities": {
    "llm_query": {
      "model": "gemini-2.5-flash",
      "temperature": 0.2,
      "max_tokens": 1024
    }
  },
  "constraints": {
    "allowed_models": ["gemini-2.5-flash", "gemini-2.5-pro"]
  }
}`,
        workflow_content: `name: Question Synthesis
version: 0.1.0
pipeline:
  - step: scan_abstracts
    tool: read_file
    path: inputs/
    
  - step: query_hypotheses
    tool: llm_query
    prompt: "Generate 3 research questions based on the literature gaps."
    
  - step: assumption_fence
    type: human-in-the-loop
    prompt: "Configure explicit assumptions, lenses, and fences for falsification."`,
        trust_card_content: `# Trust Card: Research Question Formation
### Tier: Local Reviewed | Risk Level: Low

#### Intended Use
Helps narrow researcher ideas into concrete hypotheses that have high empirical testing potential.

#### Verified Elements
- Evaluates clarity according to falsification metrics.
- Checks background assumptions list for completeness.

#### Limitations & Non-Goals
- Does not confirm whether the generated questions are novel.
- Does not test the hypotheses.`
    },
    {
        domain: 'hallucination review',
        manifest: {
            id: "hallucination-review",
            name: "Hallucination Review",
            version: "0.1.0",
            status: "review",
            summary: "Audits AI-generated claims against researcher-approved source packages. Separates supported claims, unsupported claims, unresolved risks, and human review decisions.",
            trust: {
                tier: "experimental",
                reviewer: "Scholar Explorer Local Lab Team",
                risk_level: "high"
            },
            semantics: {
                ontology: "ontology.ttl",
                verbs: ["audited", "supported", "refuted", "unverified"],
                objects: ["generated_claim", "source_evidence", "confidence_index"]
            },
            runtime: {
                targets: ["scholar-explorer-local-lab", "WASM future", "local-python"],
                allowed_tools: ["read_file", "search_engine", "vector_comparison", "llm_evaluator"],
                denied_tools: ["modify_state"]
            },
            evidence: {
                xapi_profile: "xapi-profile.jsonld",
                required_artifacts: ["hallucination-audit-ledger.json", "trust-rating.md"]
            },
            files: {
                ontology: "ontology.ttl",
                xapi_profile: "xapi-profile.jsonld",
                tools: "tools.json",
                workflow: "workflow.yaml",
                trust_card: "trust-card.md"
            }
        },
        ontology_content: `@prefix oh: <http://openharness.org/ns/core#> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix rdfs: <http://www.w3.org/2500/01/rdf-schema#> .

oh:HallucinationReviewPack a oh:CapabilityPack ;
    rdfs:label "Hallucination Review Pack" ;
    rdfs:comment "Models facts, citations, claims, and verified references." .

oh:claimsConsistentWith a owl:ObjectProperty ;
    rdfs:domain oh:SynthesizedClaim ;
    rdfs:range oh:AcademicSourcePaper .`,
        xapi_content: `{
  "@context": "https://w3id.org/xapi/profiles/context",
  "id": "https://w3id.org/xapi/profiles/hallucination-review-v1.0.0",
  "type": "Profile",
  "prefLabel": { "en": "Hallucination Review" },
  "definition": { "en": "Traces fact-checking of AI-generated content." },
  "concepts": [
    {
      "id": "http://openharness.org/verbs/audited",
      "type": "Verb",
      "prefLabel": { "en": "audited" },
      "definition": { "en": "Evaluates an extract statement for ground truth consistency." }
    }
  ]
}`,
        tools_content: `{
  "policy": "audit-only",
  "capabilities": {
    "vector_comparison": {
      "similarity_metric": "cosine",
      "threshold": 0.85
    },
    "llm_evaluator": {
      "model": "gemini-2.5-pro",
      "role": "adversarial fact-checker"
    }
  }
}`,
        workflow_content: `name: Hallucination Verification Flow
version: 0.1.0
pipeline:
  - step: extract_atomic_claims
    tool: llm_evaluator
    prompt: "List all individual factual claims made in the summary text."
    
  - step: compare_against_citations
    tool: vector_comparison
    inputs: [claims, bibliography]
    
  - step: manual_override_gate
    type: human-gate
    prompt: "Verify low confidence scores."`,
        trust_card_content: `# Trust Card: Hallucination Audit & Fact Matching
### Tier: Experimental | Risk Level: High

#### Intended Use
Runs adversarial audits of generated summaries. Highly critical for publishing papers.

#### Verified Elements
- Concordance between summaries and referenced sections.
- Highlights ungrounded claims or hallucinated author dates.

#### Limitations & Non-Goals
- Can result in high computational resource overhead.
- Relies heavily on LLM evaluation which itself can make errors (double check via the human gate!).`
    }
];

// Active registry store in memory
const nowTs = Date.now();
let activeRegistryPacks: CapabilityPack[] = STARTER_PACKS.map((p, idx) => ({
    ...p,
    author: p.author || "Scholar Explorer Central",
    published_at: p.published_at || new Date(nowTs - (3 - idx) * 3600000).toISOString(),
    created_timestamp: p.created_timestamp || (nowTs - (3 - idx) * 3600000)
}));

export const normalizeCapabilityPayload = (payload: any): any => {
    if (!payload || typeof payload !== 'object') return payload;

    const normalized = { ...payload };

    if (!normalized.manifest && (normalized.name || normalized.id)) {
        const packName = normalized.name || normalized.id || "unnamed-capability";
        const packId = normalized.id || packName.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
        normalized.manifest = {
            id: packId,
            name: packName,
            version: normalized.version || "0.1.0",
            summary: normalized.summary || normalized.description || `Capability pack for ${packName}`,
            status: normalized.status || "approved",
            trust: normalized.trust || { 
                tier: "experimental", 
                reviewer: normalized.author || "Local Lab Researcher", 
                risk_level: "low" 
            },
            semantics: normalized.semantics || { 
                ontology: "ontology.ttl", 
                verbs: ["execute", "analyze"], 
                objects: ["capability_artifact"] 
            },
            runtime: normalized.runtime || { 
                targets: ["scholar-explorer-local-lab", "MCP"], 
                allowed_tools: ["read_file", "grep"], 
                denied_tools: ["rm_rf"] 
            }
        };
    }

    if (!normalized.ontology_content) {
        normalized.ontology_content = normalized.ontology || normalized.ttl_content || normalized.ttl || 
            `@prefix : <http://scholarexplorer.org/capability/> .\n# Ontological capability definition for ${normalized.manifest?.name || 'capability'}`;
    }

    if (!normalized.xapi_content) {
        normalized.xapi_content = normalized.xapi || normalized.xapi_profile || normalized.profile || 
            JSON.stringify({ id: normalized.manifest?.id || "xapi-profile", name: normalized.manifest?.name, type: "Profile" }, null, 2);
    }

    return normalized;
};

/**
 * Validates a capability pack payload against scholar-explorer-marketplace-catalog@0.1.0 rules
 */
export const validateCapabilityPackPayload = (rawPayload: any): { valid: boolean; errors: string[]; normalizedPayload: any } => {
    const errors: string[] = [];

    if (!rawPayload || typeof rawPayload !== 'object') {
        return { valid: false, errors: ["Payload must be a JSON object"], normalizedPayload: rawPayload };
    }

    const payload = normalizeCapabilityPayload(rawPayload);
    const manifest = payload.manifest;

    if (!manifest || typeof manifest !== 'object') {
        errors.push("Missing or invalid 'manifest' object in Capability Pack");
    } else {
        if (!manifest.id || typeof manifest.id !== 'string') errors.push("manifest.id is required and must be a string");
        if (!manifest.name || typeof manifest.name !== 'string') errors.push("manifest.name is required and must be a string");
        if (!manifest.version || typeof manifest.version !== 'string') errors.push("manifest.version is required and must be a string");
        if (!manifest.trust || typeof manifest.trust !== 'object') {
            errors.push("manifest.trust object is required");
        } else {
            if (!manifest.trust.tier) errors.push("manifest.trust.tier is required");
            if (!manifest.trust.risk_level) errors.push("manifest.trust.risk_level is required");
        }
        if (!manifest.semantics || typeof manifest.semantics !== 'object') {
            errors.push("manifest.semantics object is required");
        }
        if (!manifest.runtime || typeof manifest.runtime !== 'object') {
            errors.push("manifest.runtime object is required");
        }
    }

    if (!payload.ontology_content) {
        errors.push("ontology_content (.ttl string) is required");
    }

    if (!payload.xapi_content) {
        errors.push("xapi_content (profile.json / JSON-LD) is required");
    }

    return {
        valid: errors.length === 0,
        errors,
        normalizedPayload: payload
    };
};

/**
 * Saves a newly received or created Capability Pack into the central registry store.
 */
export const registerCapabilityPackInRegistry = (rawPayload: any, author: string = "Local Lab Researcher"): CapabilityPack => {
    const validation = validateCapabilityPackPayload(rawPayload);
    if (!validation.valid) {
        throw new Error(`Capability Pack Validation Failed: ${validation.errors.join("; ")}`);
    }

    const payload = validation.normalizedPayload;
    const now = new Date();
    const manifest = payload.manifest;

    // Sanitize string content if passed as object
    const ontology_content = typeof payload.ontology_content === 'string' 
        ? payload.ontology_content 
        : JSON.stringify(payload.ontology_content, null, 2);

    const xapi_content = typeof payload.xapi_content === 'string'
        ? payload.xapi_content
        : JSON.stringify(payload.xapi_content, null, 2);

    const tools_content = typeof payload.tools_content === 'string'
        ? payload.tools_content
        : JSON.stringify(payload.tools_content || {}, null, 2);

    const workflow_content = typeof payload.workflow_content === 'string'
        ? payload.workflow_content
        : String(payload.workflow_content || "");

    const trust_card_content = typeof payload.trust_card_content === 'string'
        ? payload.trust_card_content
        : String(payload.trust_card_content || `# Trust Card: ${manifest.name}`);

    const newPack: CapabilityPack = {
        domain: payload.domain || manifest.semantics?.objects?.[0] || "general research",
        manifest: {
            ...manifest,
            status: manifest.status || "approved",
            summary: manifest.summary || `Capability pack for ${manifest.name}`,
            trust: {
                tier: manifest.trust?.tier || "experimental",
                reviewer: manifest.trust?.reviewer || author,
                risk_level: manifest.trust?.risk_level || "low"
            },
            semantics: {
                ontology: manifest.semantics?.ontology || "ontology.ttl",
                verbs: manifest.semantics?.verbs || ["executed", "analyzed"],
                objects: manifest.semantics?.objects || ["capability_artifact"]
            },
            runtime: {
                targets: manifest.runtime?.targets || ["scholar-explorer-local-lab", "MCP"],
                allowed_tools: manifest.runtime?.allowed_tools || ["read_file", "grep"],
                denied_tools: manifest.runtime?.denied_tools || ["rm_rf"]
            },
            evidence: {
                xapi_profile: manifest.evidence?.xapi_profile || "xapi-profile.jsonld",
                required_artifacts: manifest.evidence?.required_artifacts || ["report.json"]
            },
            files: {
                ontology: "ontology.ttl",
                xapi_profile: "xapi-profile.jsonld",
                tools: "tools.json",
                workflow: "workflow.yaml",
                trust_card: "trust-card.md"
            }
        },
        ontology_content,
        xapi_content,
        tools_content,
        workflow_content,
        trust_card_content,
        author: author || payload.author || "Local Lab Researcher",
        published_at: now.toISOString(),
        created_timestamp: now.getTime()
    };

    // Replace existing pack if ID matches or append
    const existingIdx = activeRegistryPacks.findIndex(p => p.manifest.id === newPack.manifest.id);
    if (existingIdx >= 0) {
        activeRegistryPacks[existingIdx] = newPack;
    } else {
        activeRegistryPacks.unshift(newPack);
    }

    console.log(`[Central Registry] Registered Capability Pack "${newPack.manifest.id}" by ${newPack.author}`);
    return newPack;
};

/**
 * Retrieves packs published since a specific timestamp or ISO string.
 */
export const getCapabilitiesSince = (since?: string | number): CapabilityPack[] => {
    if (!since) return [...activeRegistryPacks];

    let sinceTs = 0;
    if (typeof since === 'number') {
        sinceTs = since;
    } else if (typeof since === 'string') {
        const parsed = Date.parse(since);
        if (!isNaN(parsed)) {
            sinceTs = parsed;
        } else {
            sinceTs = Number(since) || 0;
        }
    }

    if (sinceTs <= 0) return [...activeRegistryPacks];

    return activeRegistryPacks.filter(p => (p.created_timestamp || 0) >= sinceTs);
};

export const getMarketplaceCatalog = async (): Promise<MarketplaceCatalog> => {
    // Return a structured catalog conforming to MarketplaceCatalog
    return {
        schema: "scholar-explorer-marketplace-catalog@0.1.0",
        generated_at: new Date().toISOString(),
        source: "scholar-explorer",
        packs: [...activeRegistryPacks]
    };
};

export const getPackById = async (id: string): Promise<CapabilityPack | null> => {
    const pack = activeRegistryPacks.find(p => p.manifest.id === id);
    return pack || null;
};

