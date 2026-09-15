export interface PackManifest {
    id: string;
    name: string;
    version: string;
    status: 'draft' | 'review' | 'approved' | 'deprecated';
    summary: string;
    trust: {
        tier: 'experimental' | 'local-reviewed' | 'maintainer-approved';
        reviewer: string;
        risk_level: 'low' | 'medium' | 'high';
    };
    semantics: {
        ontology: string;
        verbs: string[];
        objects: string[];
    };
    runtime: {
        targets: string[];
        allowed_tools: string[];
        denied_tools: string[];
    };
    evidence: {
        xapi_profile: string;
        required_artifacts: string[];
    };
    files: {
        ontology: string;
        xapi_profile: string;
        tools: string;
        workflow: string;
        trust_card: string;
    };
}

export interface CapabilityPack {
    manifest: PackManifest;
    domain: string;
    ontology_content: string;
    xapi_content: string;
    tools_content: string;
    workflow_content: string;
    trust_card_content: string;
    published_at?: string;
    author?: string;
    created_timestamp?: number;
}

export interface TrustCard {
    pack_id: string;
    declared_by: string;
    assertions: {
        statement: string;
        evidence_reference?: string;
        verified_date: string;
    }[];
    risk_assessment: {
        criticality: 'low' | 'medium' | 'high';
        mitigation: string;
    }[];
}

export interface EvidenceProfile {
    profile_id: string;
    required_events?: {
        verb: string;
        object_type: string;
        minimum_quantity?: number;
    }[];
    conforms_to?: string;
    verbs: {
        id: string;
        prefLabel: string;
        definition: string;
    }[];
    objects: string[];
}

export interface MarketplaceCatalog {
    schema: string;
    generated_at: string;
    source: string;
    packs: CapabilityPack[];
}
