import { mock, describe, test, expect, beforeEach } from 'bun:test';
import fs from 'fs';
import path from 'path';

// Bind remote WASM URL to local WASM module for hermetic offline testing
const wasmModule = require('./wasm/s3a_wasm_snapshot.js');
const wasmBytes = fs.readFileSync(path.resolve('public/s3a_wasm_snapshot_bg.wasm'));
wasmModule.initSync({ module: wasmBytes });

mock.module('https://cdn.jsdelivr.net/gh/ashleycribb/s3a-wasm-dist@v0.1.56/v0.1.56/s3a_wasm_snapshot.js', () => {
  return {
    default: async () => {},
    WasmAgentSnapshot: wasmModule.WasmAgentSnapshot,
    new_session: wasmModule.new_session,
    from_bytes: wasmModule.from_bytes,
    iri_for_verb_id: wasmModule.iri_for_verb_id,
    verb_id_for_iri: wasmModule.verb_id_for_iri,
  };
});

// Dynamic import so mock.module registers before module evaluation
const {
  writePaperToScholarPack,
  readScholarPack,
  resetDualSession,
  setResearchLoggingConsent,
  saveStoredConsentState,
} = await import('./s3aWasmService');

const {
  convertPapersToS3APayload,
  exportS3ASnapshotFromPayload,
} = await import('./s3aBridgeService');

import type { ResearchPaper } from '../types';

function queuePaper(n: number): ResearchPaper {
  return {
    id: `W100000000${n}`,
    openalex_id: `W100000000${n}`,
    title: `Restored queue paper ${n}`,
    authors: `Author ${n}`,
    year: 2020 + n,
    abstract: `Abstract for restored paper ${n}`,
    doi: `10.1000/restored-${n}`,
  };
}

describe('exported .s3a includes papers restored into the selection queue', () => {
  const humanUuid = '018f3a54-629a-7a1a-9f5b-aaaa11111111';
  const aiUuid = '018f3a54-629a-7a1a-9f5b-aaaa22222222';
  const sessionUuid = '018f3a54-629a-7a1a-9f5b-aaaa33333333';

  beforeEach(() => {
    resetDualSession({
      actor_uuid: humanUuid,
      agent_uuid: aiUuid,
      sessionId: sessionUuid,
    });
  });

  test('restored queue of N papers -> exported .s3a contains N paper records', async () => {
    const N = 3;
    // Simulate a reload: the queue is restored from workspace state, but the
    // in-memory WASM session is empty (papers were never restaged).
    const restoredQueue = Array.from({ length: N }, (_, i) => queuePaper(i + 1));
    const payload = convertPapersToS3APayload(restoredQueue, 'restored-queue');

    // Consent is granted so a mistaken restage would emit inclusion statements.
    setResearchLoggingConsent(true);
    saveStoredConsentState('granted');

    const exported = await exportS3ASnapshotFromPayload(payload, 'restored-queue');
    expect(exported.bytes).toBeDefined();
    expect(exported.bytes.length).toBeGreaterThan(0);

    const parsed = readScholarPack(exported.bytes);
    expect(parsed.hasTile12).toBe(true);
    expect(parsed.papers.length).toBe(N);
  });

  test('restaging a restored queue does not record a new inclusion statement, even with consent', async () => {
    setResearchLoggingConsent(true);
    saveStoredConsentState('granted');

    const paper = queuePaper(9);
    const res = await writePaperToScholarPack(paper, { recordInclusionStatement: false });
    expect(res.added).toBe(true);
    expect(res.tracingEmitted).toBe(false);
  });
});
