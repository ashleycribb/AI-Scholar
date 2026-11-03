/* tslint:disable */
/* eslint-disable */

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

/**
 * Browser-side WebAssembly wrapper around `WasmAgentSnapshot`.
 */
export class WasmAgentSnapshot {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Adds a research claim or note with optional vector embedding.
     */
    add_claim(agent_slug: string, text: string, confidence: number, kind?: number | null, embedding?: Float32Array | null): number;
    /**
     * Adds an academic paper metadata record into the snapshot.
     */
    add_paper(openalex_id: string, doi: string, year: number, cited_by_count: number, flags?: number | null): number;
    /**
     * Applies an incoming sync delta buffer into the local session.
     */
    apply_delta(delta_bytes: Uint8Array): number;
    /**
     * Asserts that the specified agent slug is authorized for the given verb_id and tool_bit.
     * Returns an error on denial.
     */
    assert_agent_allows(agent_slug: string, verb_id?: number | null, tool_bit?: number | null): void;
    /**
     * True if decision `index` was made by `reviewer_id` on `submission_id` with exactly `comment`.
     */
    committee_decision_matches(index: number, reviewer_id: string, submission_id: string, comment: string): boolean;
    /**
     * Bytes the reviewer must sign with Ed25519 for the *next* decision.
     * verdict: 1=Approve, 2=Revise, 3=Reject. `timestamp_sec` must be passed unchanged
     * to `record_committee_decision`.
     */
    committee_signing_payload(verdict: number, reviewer_id: string, submission_id: string, comment: string, timestamp_sec: number): Uint8Array;
    /**
     * Returns "none" (never asked), "granted", or "withdrawn" (declined or withdrawn).
     */
    consent_state(): string;
    /**
     * Exports the snapshot as an immutable .snapshot.s3a Uint8Array buffer.
     */
    export_bytes(): Uint8Array;
    /**
     * Exports pending delta records since the last sync as a compact byte buffer.
     */
    export_delta(): Uint8Array;
    /**
     * Exports only statements and delta records recorded after `cursor`.
     * Returns a `WasmSyncBatch` containing the binary delta packet, new cursor, and record count.
     */
    export_since(cursor: bigint): WasmSyncBatch;
    /**
     * Loads a snapshot from a Uint8Array byte slice.
     */
    static from_bytes(bytes: Uint8Array): WasmAgentSnapshot;
    /**
     * Resolves a 32-bit integer verb_id to its authoritative xAPI IRI string.
     */
    iri_for_verb_id(id: number): string | undefined;
    /**
     * Read-only JSON list of committee decisions (hashes, verdict, timestamp, chain status).
     */
    list_committee_decisions(): string;
    /**
     * Creates a new session from a 128-bit hex UUID and seeds the registry with default agents.
     */
    static new_session(session_uuid_hex: string): WasmAgentSnapshot;
    /**
     * Returns the number of uncommitted delta records pending synchronization.
     */
    pending_delta_count(): number;
    /**
     * Pre-flight hallucination and epistemic confidence evaluation.
     * Returns "ok" on success or the risk message if risk detected.
     */
    preflight(confidence: number, concept_id?: number | null, has_approved_analogy?: boolean | null): string;
    /**
     * Records an AI agent reasoning / tool-call step.
     */
    record_ai(agent_slug: string, step_type: number, confidence: number, human_index?: number | null): number;
    /**
     * Verifies and appends a reviewer-signed decision. Returns its index.
     * Errors (never silent) on bad verdict, empty reviewer/submission, oversize comment,
     * malformed key/signature, or a signature that does not verify.
     */
    record_committee_decision(verdict: number, reviewer_id: string, submission_id: string, comment: string, timestamp_sec: number, reviewer_public_key: Uint8Array, signature: Uint8Array): number;
    /**
     * Records a human activity statement / decision.
     */
    record_human(verb_id: number, actor_hash: any, object_hash: number, ai_trace_index?: number | null): number;
    /**
     * Engine truth for the UI recording indicator: true only if tracing is active.
     */
    recording_active(): boolean;
    /**
     * Checks whether an agent requires human supervisory gate clearance.
     */
    requires_human_gate(agent_slug: string): boolean;
    /**
     * Performs hybrid search combining keyword match and vector cosine similarity.
     */
    search_claims_hybrid(query: string, query_embedding?: Float32Array | null, top_k?: number | null, include_hidden?: boolean | null): any;
    /**
     * Searches indexed claims and notes by keyword using token Bloom filter and lexical scoring.
     */
    search_claims_text(query: string, top_k?: number | null, include_hidden?: boolean | null): any;
    /**
     * Searches indexed claims by vector embedding using SIMD-accelerated cosine similarity.
     */
    search_claims_vector(query_embedding: Float32Array, top_k?: number | null, min_score?: number | null, include_hidden?: boolean | null): any;
    /**
     * Records consent (granted=true) or decline/withdrawal (granted=false) as a Tile-71
     * `ConsentRecord`. Tracing is enabled only for a Research grant with a non-empty study_id.
     * `purpose`: 1=Research, 2=Analytics, 3=ModelTraining, 4=Sharing.
     */
    set_consent(granted: boolean, purpose: number, study_id: string): boolean;
    /**
     * Resolves an xAPI IRI or label to its 32-bit integer verb_id.
     */
    verb_id_for_iri(iri: string): number | undefined;
    /**
     * Verifies decision `index` against the reviewer public key held by the app.
     */
    verify_committee_decision(index: number, reviewer_public_key: Uint8Array): void;
}

/**
 * Batched sync delta payload for Scholar Explorer.
 */
export class WasmSyncBatch {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    readonly bytes: Uint8Array;
    readonly new_cursor: bigint;
    readonly record_count: number;
}

/**
 * Standalone function exporting the snapshot as an immutable .snapshot.s3a Uint8Array buffer.
 */
export function export_bytes(snapshot: WasmAgentSnapshot): Uint8Array;

/**
 * Standalone function exporting statements recorded after `cursor`.
 */
export function export_since(snapshot: WasmAgentSnapshot, cursor: bigint): WasmSyncBatch;

/**
 * Standalone factory function to parse a snapshot from a Uint8Array.
 */
export function from_bytes(bytes: Uint8Array): WasmAgentSnapshot;

export function init_panic_hook(): void;

/**
 * Standalone function resolving a 32-bit integer verb_id to its canonical IRI.
 */
export function iri_for_verb_id(id: number): string | undefined;

/**
 * Standalone factory function to create a new session.
 */
export function new_session(session_uuid_hex: string): WasmAgentSnapshot;

export function tool_openalex_query(): number;

export function tool_publish(): number;

/**
 * Standalone function resolving an xAPI IRI or label to its 32-bit integer verb_id.
 */
export function verb_id_for_iri(iri: string): number | undefined;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_wasmagentsnapshot_free: (a: number, b: number) => void;
    readonly __wbg_wasmsyncbatch_free: (a: number, b: number) => void;
    readonly export_bytes: (a: number) => [number, number, number, number];
    readonly export_since: (a: number, b: bigint) => [number, number, number];
    readonly from_bytes: (a: number, b: number) => [number, number, number];
    readonly init_panic_hook: () => void;
    readonly iri_for_verb_id: (a: number) => [number, number];
    readonly new_session: (a: number, b: number) => [number, number, number];
    readonly tool_openalex_query: () => number;
    readonly tool_publish: () => number;
    readonly verb_id_for_iri: (a: number, b: number) => number;
    readonly wasmagentsnapshot_add_claim: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number];
    readonly wasmagentsnapshot_add_paper: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => [number, number, number];
    readonly wasmagentsnapshot_apply_delta: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmagentsnapshot_assert_agent_allows: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmagentsnapshot_committee_decision_matches: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number) => number;
    readonly wasmagentsnapshot_committee_signing_payload: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => [number, number, number, number];
    readonly wasmagentsnapshot_consent_state: (a: number) => [number, number];
    readonly wasmagentsnapshot_export_bytes: (a: number) => [number, number, number, number];
    readonly wasmagentsnapshot_export_delta: (a: number) => [number, number, number, number];
    readonly wasmagentsnapshot_export_since: (a: number, b: bigint) => [number, number, number];
    readonly wasmagentsnapshot_from_bytes: (a: number, b: number) => [number, number, number];
    readonly wasmagentsnapshot_iri_for_verb_id: (a: number, b: number) => [number, number];
    readonly wasmagentsnapshot_list_committee_decisions: (a: number) => [number, number];
    readonly wasmagentsnapshot_new_session: (a: number, b: number) => [number, number, number];
    readonly wasmagentsnapshot_pending_delta_count: (a: number) => number;
    readonly wasmagentsnapshot_preflight: (a: number, b: number, c: number, d: number, e: number) => [number, number];
    readonly wasmagentsnapshot_record_ai: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmagentsnapshot_record_committee_decision: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => [number, number, number];
    readonly wasmagentsnapshot_record_human: (a: number, b: number, c: any, d: number, e: number) => [number, number, number];
    readonly wasmagentsnapshot_recording_active: (a: number) => number;
    readonly wasmagentsnapshot_requires_human_gate: (a: number, b: number, c: number) => [number, number, number];
    readonly wasmagentsnapshot_search_claims_hybrid: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => [number, number, number];
    readonly wasmagentsnapshot_search_claims_text: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmagentsnapshot_search_claims_vector: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly wasmagentsnapshot_set_consent: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
    readonly wasmagentsnapshot_verb_id_for_iri: (a: number, b: number, c: number) => number;
    readonly wasmagentsnapshot_verify_committee_decision: (a: number, b: number, c: number, d: number) => [number, number];
    readonly wasmsyncbatch_bytes: (a: number) => [number, number];
    readonly wasmsyncbatch_new_cursor: (a: number) => bigint;
    readonly wasmsyncbatch_record_count: (a: number) => number;
    readonly ring_core_0_17_14__bn_mul_mont: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wbindgen_exn_store: (a: number) => void;
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
