/* @ts-self-types="./s3a_wasm_snapshot.d.ts" */

/**
 * @enum {1 | 2 | 4 | 8 | 16 | 32 | 64 | 128 | 65536 | 131072}
 */
export const ScholarTool = Object.freeze({
    TOOL_READ_FILE: 1, "1": "TOOL_READ_FILE",
    TOOL_OPENALEX_QUERY: 2, "2": "TOOL_OPENALEX_QUERY",
    TOOL_EXTRACT_CLAIMS: 4, "4": "TOOL_EXTRACT_CLAIMS",
    TOOL_SYNTHESIZE_EVIDENCE: 8, "8": "TOOL_SYNTHESIZE_EVIDENCE",
    TOOL_CROSSREF_QUERY: 16, "16": "TOOL_CROSSREF_QUERY",
    TOOL_EXPORT_SNAPSHOT: 32, "32": "TOOL_EXPORT_SNAPSHOT",
    TOOL_TA_SUPERVISOR_CALL: 64, "64": "TOOL_TA_SUPERVISOR_CALL",
    TOOL_MUTATE_GRAPH: 128, "128": "TOOL_MUTATE_GRAPH",
    TOOL_PUBLISH: 65536, "65536": "TOOL_PUBLISH",
    TOOL_CREDENTIAL_EXPORT: 131072, "131072": "TOOL_CREDENTIAL_EXPORT",
});

/**
 * Browser-side WebAssembly wrapper around `WasmAgentSnapshot`.
 */
export class WasmAgentSnapshot {
    static __wrap(ptr) {
        const obj = Object.create(WasmAgentSnapshot.prototype);
        obj.__wbg_ptr = ptr;
        WasmAgentSnapshotFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmAgentSnapshotFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmagentsnapshot_free(ptr, 0);
    }
    /**
     * Adds a research claim or note with optional vector embedding.
     * @param {string} agent_slug
     * @param {string} text
     * @param {number} confidence
     * @param {number | null} [kind]
     * @param {Float32Array | null} [embedding]
     * @returns {number}
     */
    add_claim(agent_slug, text, confidence, kind, embedding) {
        const ptr0 = passStringToWasm0(agent_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        var ptr2 = isLikeNone(embedding) ? 0 : passArrayF32ToWasm0(embedding, wasm.__wbindgen_malloc);
        var len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_add_claim(this.__wbg_ptr, ptr0, len0, ptr1, len1, confidence, isLikeNone(kind) ? 0xFFFFFF : kind, ptr2, len2);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Adds an academic paper metadata record into the snapshot.
     * @param {string} openalex_id
     * @param {string} doi
     * @param {number} year
     * @param {number} cited_by_count
     * @param {number | null} [flags]
     * @returns {number}
     */
    add_paper(openalex_id, doi, year, cited_by_count, flags) {
        const ptr0 = passStringToWasm0(openalex_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(doi, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_add_paper(this.__wbg_ptr, ptr0, len0, ptr1, len1, year, cited_by_count, isLikeNone(flags) ? Number.MAX_SAFE_INTEGER : (flags) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Applies an incoming sync delta buffer into the local session.
     * @param {Uint8Array} delta_bytes
     * @returns {number}
     */
    apply_delta(delta_bytes) {
        const ptr0 = passArray8ToWasm0(delta_bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_apply_delta(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Asserts that the specified agent slug is authorized for the given verb_id and tool_bit.
     * Returns an error on denial.
     * @param {string} agent_slug
     * @param {number | null} [verb_id]
     * @param {number | null} [tool_bit]
     */
    assert_agent_allows(agent_slug, verb_id, tool_bit) {
        const ptr0 = passStringToWasm0(agent_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_assert_agent_allows(this.__wbg_ptr, ptr0, len0, isLikeNone(verb_id) ? Number.MAX_SAFE_INTEGER : (verb_id) >>> 0, isLikeNone(tool_bit) ? Number.MAX_SAFE_INTEGER : (tool_bit) >>> 0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * True if decision `index` was made by `reviewer_id` on `submission_id` with exactly `comment`.
     * @param {number} index
     * @param {string} reviewer_id
     * @param {string} submission_id
     * @param {string} comment
     * @returns {boolean}
     */
    committee_decision_matches(index, reviewer_id, submission_id, comment) {
        const ptr0 = passStringToWasm0(reviewer_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(submission_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(comment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_committee_decision_matches(this.__wbg_ptr, index, ptr0, len0, ptr1, len1, ptr2, len2);
        return ret !== 0;
    }
    /**
     * Bytes the reviewer must sign with Ed25519 for the *next* decision.
     * verdict: 1=Approve, 2=Revise, 3=Reject. `timestamp_sec` must be passed unchanged
     * to `record_committee_decision`.
     * @param {number} verdict
     * @param {string} reviewer_id
     * @param {string} submission_id
     * @param {string} comment
     * @param {number} timestamp_sec
     * @returns {Uint8Array}
     */
    committee_signing_payload(verdict, reviewer_id, submission_id, comment, timestamp_sec) {
        const ptr0 = passStringToWasm0(reviewer_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(submission_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(comment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_committee_signing_payload(this.__wbg_ptr, verdict, ptr0, len0, ptr1, len1, ptr2, len2, timestamp_sec);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v4 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v4;
    }
    /**
     * Returns "none" (never asked), "granted", or "withdrawn" (declined or withdrawn).
     * @returns {string}
     */
    consent_state() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmagentsnapshot_consent_state(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Exports the snapshot as an immutable .snapshot.s3a Uint8Array buffer.
     * @returns {Uint8Array}
     */
    export_bytes() {
        const ret = wasm.wasmagentsnapshot_export_bytes(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Exports pending delta records since the last sync as a compact byte buffer.
     * @returns {Uint8Array}
     */
    export_delta() {
        const ret = wasm.wasmagentsnapshot_export_delta(this.__wbg_ptr);
        if (ret[3]) {
            throw takeFromExternrefTable0(ret[2]);
        }
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * Exports only statements and delta records recorded after `cursor`.
     * Returns a `WasmSyncBatch` containing the binary delta packet, new cursor, and record count.
     * @param {bigint} cursor
     * @returns {WasmSyncBatch}
     */
    export_since(cursor) {
        const ret = wasm.wasmagentsnapshot_export_since(this.__wbg_ptr, cursor);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmSyncBatch.__wrap(ret[0]);
    }
    /**
     * Loads a snapshot from a Uint8Array byte slice.
     * @param {Uint8Array} bytes
     * @returns {WasmAgentSnapshot}
     */
    static from_bytes(bytes) {
        const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_from_bytes(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmAgentSnapshot.__wrap(ret[0]);
    }
    /**
     * Resolves a 32-bit integer verb_id to its authoritative xAPI IRI string.
     * @param {number} id
     * @returns {string | undefined}
     */
    iri_for_verb_id(id) {
        const ret = wasm.wasmagentsnapshot_iri_for_verb_id(this.__wbg_ptr, id);
        let v1;
        if (ret[0] !== 0) {
            v1 = getStringFromWasm0(ret[0], ret[1]);
            wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        }
        return v1;
    }
    /**
     * Read-only JSON list of committee decisions (hashes, verdict, timestamp, chain status).
     * @returns {string}
     */
    list_committee_decisions() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmagentsnapshot_list_committee_decisions(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Creates a new session from a 128-bit hex UUID and seeds the registry with default agents.
     * @param {string} session_uuid_hex
     * @returns {WasmAgentSnapshot}
     */
    static new_session(session_uuid_hex) {
        const ptr0 = passStringToWasm0(session_uuid_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_new_session(ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return WasmAgentSnapshot.__wrap(ret[0]);
    }
    /**
     * Returns the number of uncommitted delta records pending synchronization.
     * @returns {number}
     */
    pending_delta_count() {
        const ret = wasm.wasmagentsnapshot_pending_delta_count(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Pre-flight hallucination and epistemic confidence evaluation.
     * Returns "ok" on success or the risk message if risk detected.
     * @param {number} confidence
     * @param {number | null} [concept_id]
     * @param {boolean | null} [has_approved_analogy]
     * @returns {string}
     */
    preflight(confidence, concept_id, has_approved_analogy) {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.wasmagentsnapshot_preflight(this.__wbg_ptr, confidence, !isLikeNone(concept_id), isLikeNone(concept_id) ? 0 : concept_id, isLikeNone(has_approved_analogy) ? 0xFFFFFF : has_approved_analogy ? 1 : 0);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Records an AI agent reasoning / tool-call step.
     * @param {string} agent_slug
     * @param {number} step_type
     * @param {number} confidence
     * @param {number | null} [human_index]
     * @returns {number}
     */
    record_ai(agent_slug, step_type, confidence, human_index) {
        const ptr0 = passStringToWasm0(agent_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_record_ai(this.__wbg_ptr, ptr0, len0, step_type, confidence, isLikeNone(human_index) ? Number.MAX_SAFE_INTEGER : (human_index) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Verifies and appends a reviewer-signed decision. Returns its index.
     * Errors (never silent) on bad verdict, empty reviewer/submission, oversize comment,
     * malformed key/signature, or a signature that does not verify.
     * @param {number} verdict
     * @param {string} reviewer_id
     * @param {string} submission_id
     * @param {string} comment
     * @param {number} timestamp_sec
     * @param {Uint8Array} reviewer_public_key
     * @param {Uint8Array} signature
     * @returns {number}
     */
    record_committee_decision(verdict, reviewer_id, submission_id, comment, timestamp_sec, reviewer_public_key, signature) {
        const ptr0 = passStringToWasm0(reviewer_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ptr1 = passStringToWasm0(submission_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len1 = WASM_VECTOR_LEN;
        const ptr2 = passStringToWasm0(comment, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len2 = WASM_VECTOR_LEN;
        const ptr3 = passArray8ToWasm0(reviewer_public_key, wasm.__wbindgen_malloc);
        const len3 = WASM_VECTOR_LEN;
        const ptr4 = passArray8ToWasm0(signature, wasm.__wbindgen_malloc);
        const len4 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_record_committee_decision(this.__wbg_ptr, verdict, ptr0, len0, ptr1, len1, ptr2, len2, timestamp_sec, ptr3, len3, ptr4, len4);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Records a human activity statement / decision.
     * @param {number} verb_id
     * @param {any} actor_hash
     * @param {number} object_hash
     * @param {number | null} [ai_trace_index]
     * @returns {number}
     */
    record_human(verb_id, actor_hash, object_hash, ai_trace_index) {
        const ret = wasm.wasmagentsnapshot_record_human(this.__wbg_ptr, verb_id, actor_hash, object_hash, isLikeNone(ai_trace_index) ? Number.MAX_SAFE_INTEGER : (ai_trace_index) >>> 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Engine truth for the UI recording indicator: true only if tracing is active.
     * @returns {boolean}
     */
    recording_active() {
        const ret = wasm.wasmagentsnapshot_recording_active(this.__wbg_ptr);
        return ret !== 0;
    }
    /**
     * Checks whether an agent requires human supervisory gate clearance.
     * @param {string} agent_slug
     * @returns {boolean}
     */
    requires_human_gate(agent_slug) {
        const ptr0 = passStringToWasm0(agent_slug, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_requires_human_gate(this.__wbg_ptr, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Performs hybrid search combining keyword match and vector cosine similarity.
     * @param {string} query
     * @param {Float32Array | null} [query_embedding]
     * @param {number | null} [top_k]
     * @param {boolean | null} [include_hidden]
     * @returns {any}
     */
    search_claims_hybrid(query, query_embedding, top_k, include_hidden) {
        const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        var ptr1 = isLikeNone(query_embedding) ? 0 : passArrayF32ToWasm0(query_embedding, wasm.__wbindgen_malloc);
        var len1 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_search_claims_hybrid(this.__wbg_ptr, ptr0, len0, ptr1, len1, isLikeNone(top_k) ? Number.MAX_SAFE_INTEGER : (top_k) >>> 0, isLikeNone(include_hidden) ? 0xFFFFFF : include_hidden ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Searches indexed claims and notes by keyword using token Bloom filter and lexical scoring.
     * @param {string} query
     * @param {number | null} [top_k]
     * @param {boolean | null} [include_hidden]
     * @returns {any}
     */
    search_claims_text(query, top_k, include_hidden) {
        const ptr0 = passStringToWasm0(query, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_search_claims_text(this.__wbg_ptr, ptr0, len0, isLikeNone(top_k) ? Number.MAX_SAFE_INTEGER : (top_k) >>> 0, isLikeNone(include_hidden) ? 0xFFFFFF : include_hidden ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Searches indexed claims by vector embedding using SIMD-accelerated cosine similarity.
     * @param {Float32Array} query_embedding
     * @param {number | null} [top_k]
     * @param {number | null} [min_score]
     * @param {boolean | null} [include_hidden]
     * @returns {any}
     */
    search_claims_vector(query_embedding, top_k, min_score, include_hidden) {
        const ptr0 = passArrayF32ToWasm0(query_embedding, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_search_claims_vector(this.__wbg_ptr, ptr0, len0, isLikeNone(top_k) ? Number.MAX_SAFE_INTEGER : (top_k) >>> 0, isLikeNone(min_score) ? Number.MAX_SAFE_INTEGER : Math.fround(min_score), isLikeNone(include_hidden) ? 0xFFFFFF : include_hidden ? 1 : 0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return takeFromExternrefTable0(ret[0]);
    }
    /**
     * Records consent (granted=true) or decline/withdrawal (granted=false) as a Tile-71
     * `ConsentRecord`. Tracing is enabled only for a Research grant with a non-empty study_id.
     * `purpose`: 1=Research, 2=Analytics, 3=ModelTraining, 4=Sharing.
     * @param {boolean} granted
     * @param {number} purpose
     * @param {string} study_id
     * @returns {boolean}
     */
    set_consent(granted, purpose, study_id) {
        const ptr0 = passStringToWasm0(study_id, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_set_consent(this.__wbg_ptr, granted, purpose, ptr0, len0);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] !== 0;
    }
    /**
     * Resolves an xAPI IRI or label to its 32-bit integer verb_id.
     * @param {string} iri
     * @returns {number | undefined}
     */
    verb_id_for_iri(iri) {
        const ptr0 = passStringToWasm0(iri, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_verb_id_for_iri(this.__wbg_ptr, ptr0, len0);
        return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
    }
    /**
     * Verifies decision `index` against the reviewer public key held by the app.
     * @param {number} index
     * @param {Uint8Array} reviewer_public_key
     */
    verify_committee_decision(index, reviewer_public_key) {
        const ptr0 = passArray8ToWasm0(reviewer_public_key, wasm.__wbindgen_malloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.wasmagentsnapshot_verify_committee_decision(this.__wbg_ptr, index, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
}
if (Symbol.dispose) WasmAgentSnapshot.prototype[Symbol.dispose] = WasmAgentSnapshot.prototype.free;

/**
 * Batched sync delta payload for Scholar Explorer.
 */
export class WasmSyncBatch {
    static __wrap(ptr) {
        const obj = Object.create(WasmSyncBatch.prototype);
        obj.__wbg_ptr = ptr;
        WasmSyncBatchFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        WasmSyncBatchFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_wasmsyncbatch_free(ptr, 0);
    }
    /**
     * @returns {Uint8Array}
     */
    get bytes() {
        const ret = wasm.wasmsyncbatch_bytes(this.__wbg_ptr);
        var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
        return v1;
    }
    /**
     * @returns {bigint}
     */
    get new_cursor() {
        const ret = wasm.wasmsyncbatch_new_cursor(this.__wbg_ptr);
        return BigInt.asUintN(64, ret);
    }
    /**
     * @returns {number}
     */
    get record_count() {
        const ret = wasm.wasmsyncbatch_record_count(this.__wbg_ptr);
        return ret >>> 0;
    }
}
if (Symbol.dispose) WasmSyncBatch.prototype[Symbol.dispose] = WasmSyncBatch.prototype.free;

/**
 * Standalone function exporting the snapshot as an immutable .snapshot.s3a Uint8Array buffer.
 * @param {WasmAgentSnapshot} snapshot
 * @returns {Uint8Array}
 */
export function export_bytes(snapshot) {
    _assertClass(snapshot, WasmAgentSnapshot);
    const ret = wasm.export_bytes(snapshot.__wbg_ptr);
    if (ret[3]) {
        throw takeFromExternrefTable0(ret[2]);
    }
    var v1 = getArrayU8FromWasm0(ret[0], ret[1]).slice();
    wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    return v1;
}

/**
 * Standalone function exporting statements recorded after `cursor`.
 * @param {WasmAgentSnapshot} snapshot
 * @param {bigint} cursor
 * @returns {WasmSyncBatch}
 */
export function export_since(snapshot, cursor) {
    _assertClass(snapshot, WasmAgentSnapshot);
    const ret = wasm.export_since(snapshot.__wbg_ptr, cursor);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmSyncBatch.__wrap(ret[0]);
}

/**
 * Standalone factory function to parse a snapshot from a Uint8Array.
 * @param {Uint8Array} bytes
 * @returns {WasmAgentSnapshot}
 */
export function from_bytes(bytes) {
    const ptr0 = passArray8ToWasm0(bytes, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.from_bytes(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmAgentSnapshot.__wrap(ret[0]);
}

export function init_panic_hook() {
    wasm.init_panic_hook();
}

/**
 * Standalone function resolving a 32-bit integer verb_id to its canonical IRI.
 * @param {number} id
 * @returns {string | undefined}
 */
export function iri_for_verb_id(id) {
    const ret = wasm.iri_for_verb_id(id);
    let v1;
    if (ret[0] !== 0) {
        v1 = getStringFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
}

/**
 * Standalone factory function to create a new session.
 * @param {string} session_uuid_hex
 * @returns {WasmAgentSnapshot}
 */
export function new_session(session_uuid_hex) {
    const ptr0 = passStringToWasm0(session_uuid_hex, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.new_session(ptr0, len0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return WasmAgentSnapshot.__wrap(ret[0]);
}

/**
 * @returns {number}
 */
export function tool_openalex_query() {
    const ret = wasm.tool_openalex_query();
    return ret >>> 0;
}

/**
 * @returns {number}
 */
export function tool_publish() {
    const ret = wasm.tool_publish();
    return ret >>> 0;
}

/**
 * Standalone function resolving an xAPI IRI or label to its 32-bit integer verb_id.
 * @param {string} iri
 * @returns {number | undefined}
 */
export function verb_id_for_iri(iri) {
    const ptr0 = passStringToWasm0(iri, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.verb_id_for_iri(ptr0, len0);
    return ret === Number.MAX_SAFE_INTEGER ? undefined : ret;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_BigInt_55476612a84195bb: function() { return handleError(function (arg0) {
            const ret = BigInt(arg0);
            return ret;
        }, arguments); },
        __wbg___wbindgen_is_function_1f9d30630b8b1d3d: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_object_3c45d4f2dde4e749: function(arg0) {
            const val = arg0;
            const ret = typeof(val) === 'object' && val !== null;
            return ret;
        },
        __wbg___wbindgen_is_string_90b56bc79aad6f6c: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_8865fb403f8fe9d8: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_2e0e7dee9f701a71: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64(arg0 + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_0380ccaa2f57f0d9: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_41e9ee4f547fc59a: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_call_187d372bd5fdd4aa: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_crypto_38df2bab126b63dc: function(arg0) {
            const ret = arg0.crypto;
            return ret;
        },
        __wbg_error_757e9472f8410341: function(arg0, arg1) {
            let deferred0_0;
            let deferred0_1;
            try {
                deferred0_0 = arg0;
                deferred0_1 = arg1;
                console.error(getStringFromWasm0(arg0, arg1));
            } finally {
                wasm.__wbindgen_free(deferred0_0, deferred0_1, 1);
            }
        },
        __wbg_getRandomValues_c44a50d8cfdaebeb: function() { return handleError(function (arg0, arg1) {
            arg0.getRandomValues(arg1);
        }, arguments); },
        __wbg_length_7f3c00c40364105e: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_msCrypto_bd5a034af96bcba6: function(arg0) {
            const ret = arg0.msCrypto;
            return ret;
        },
        __wbg_new_227d7c05414eb861: function() {
            const ret = new Error();
            return ret;
        },
        __wbg_new_617a8cdb8bb1130e: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_ee2291f50781bf1d: function() {
            const ret = new Array();
            return ret;
        },
        __wbg_new_with_length_3da0ad195f6f63ba: function(arg0) {
            const ret = new Uint8Array(arg0 >>> 0);
            return ret;
        },
        __wbg_node_84ea875411254db1: function(arg0) {
            const ret = arg0.node;
            return ret;
        },
        __wbg_now_aa4ccb83129e9e55: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_process_44c7a14e11e9f69e: function(arg0) {
            const ret = arg0.process;
            return ret;
        },
        __wbg_prototypesetcall_bc27214492979395: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_push_2baf45db356cf468: function(arg0, arg1) {
            const ret = arg0.push(arg1);
            return ret;
        },
        __wbg_randomFillSync_6c25eac9869eb53c: function() { return handleError(function (arg0, arg1) {
            arg0.randomFillSync(arg1);
        }, arguments); },
        __wbg_require_b4edbdcf3e2a1ef0: function() { return handleError(function () {
            const ret = module.require;
            return ret;
        }, arguments); },
        __wbg_set_145a351398b48c65: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
            const ret = arg1.stack;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg_static_accessor_GLOBAL_266715b9d96ba635: function() {
            const ret = typeof global === 'undefined' ? null : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_THIS_10fb7dc1ae063179: function() {
            const ret = typeof globalThis === 'undefined' ? null : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_0b583911f537483a: function() {
            const ret = typeof self === 'undefined' ? null : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_d7f903d1508cbdc4: function() {
            const ret = typeof window === 'undefined' ? null : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_002b94d5e13d1411: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_toString_3e46331018353800: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.toString(arg1);
            return ret;
        }, arguments); },
        __wbg_versions_276b2795b1c6a219: function(arg0) {
            const ret = arg0.versions;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            const offset = table.grow(4);
            table.set(0, undefined);
            table.set(offset + 0, undefined);
            table.set(offset + 1, null);
            table.set(offset + 2, true);
            table.set(offset + 3, false);
        },
    };
    return {
        __proto__: null,
        "./s3a_wasm_snapshot_bg.js": import0,
    };
}

const WasmAgentSnapshotFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmagentsnapshot_free(ptr, 1));
const WasmSyncBatchFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_wasmsyncbatch_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('s3a_wasm_snapshot_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
