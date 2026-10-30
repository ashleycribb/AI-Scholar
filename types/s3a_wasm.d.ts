/**
 * Ambient type definitions for pinned remote S3A WebAssembly build v0.1.45
 */

declare module "https://cdn.jsdelivr.net/gh/ashleycribb/s3a-wasm-dist@v0.1.45/v0.1.45/s3a_wasm_snapshot.js" {
  export enum ScholarTool {
    TOOL_READ_FILE = 1,
    TOOL_OPENALEX_QUERY = 2,
    TOOL_EXTRACT_CLAIMS = 4,
    TOOL_SYNTHESIZE_EVIDENCE = 8,
    TOOL_CROSSREF_QUERY = 16,
    TOOL_EXPORT_SNAPSHOT = 32,
    TOOL_TA_SUPERVISOR_CALL = 64,
    TOOL_MUTATE_GRAPH = 128,
    TOOL_PUBLISH = 65536,
    TOOL_CREDENTIAL_EXPORT = 131072,
  }

  export class WasmAgentSnapshot {
    free(): void;
    [Symbol.dispose](): void;
    add_claim(agent_slug: string, text: string, confidence: number, kind?: number | null, embedding?: Float32Array | null): number;
    add_paper(openalex_id: string, doi: string, year: number, cited_by_count: number, flags?: number | null): number;
    apply_delta(delta_bytes: Uint8Array): number;
    assert_agent_allows(agent_slug: string, verb_id?: number | null, tool_bit?: number | null): void;
    export_bytes(): Uint8Array;
    export_delta(): Uint8Array;
    static from_bytes(bytes: Uint8Array): WasmAgentSnapshot;
    iri_for_verb_id(id: number): string | undefined;
    static new_session(session_uuid_hex: string): WasmAgentSnapshot;
    pending_delta_count(): number;
    preflight(confidence: number, concept_id?: number | null, has_approved_analogy?: boolean | null): string;
    record_ai(agent_slug: string, step_type: number, confidence: number, human_index?: number | null): number;
    record_human(verb_id: number, actor_hash: any, object_hash: number, ai_trace_index?: number | null): number;
    requires_human_gate(agent_slug: string): boolean;
    search_claims_hybrid(query: string, query_embedding?: Float32Array | null, top_k?: number | null, include_hidden?: boolean | null): any;
    search_claims_text(query: string, top_k?: number | null, include_hidden?: boolean | null): any;
    search_claims_vector(query_embedding: Float32Array, top_k?: number | null, min_score?: number | null, include_hidden?: boolean | null): any;
    verb_id_for_iri(iri: string): number | undefined;
    set_consent(granted: boolean, purpose: number, study_id: string): boolean;
    recording_active(): boolean;
    consent_state(): 'none' | 'granted' | 'withdrawn';

    // Official Committee Decision API
    committee_signing_payload(verdict: number, reviewer_id: string, submission_id: string, comment: string, timestamp_sec: number): Uint8Array;
    record_committee_decision(verdict: number, reviewer_id: string, submission_id: string, comment: string, timestamp_sec: number, publicKey: Uint8Array, signature: Uint8Array): any;
    list_committee_decisions(): any;
    verify_committee_decision(index: number, publicKey: Uint8Array): boolean;
  }

  export function from_bytes(bytes: Uint8Array): WasmAgentSnapshot;
  export function new_session(session_uuid_hex: string): WasmAgentSnapshot;
  export function iri_for_verb_id(id: number): string | undefined;
  export function verb_id_for_iri(iri: string): number | undefined;

  export default function init(input?: any): Promise<any>;
}
