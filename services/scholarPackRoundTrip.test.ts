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
  hashIri,
  getDualSessionState,
  resetDualSession,
  exportS3ASession,
  parseParticipantSnapshot,
  SCHOLAR_TILE_TYPES,
  RESEARCH_GRAPH_PREDICATES,
  ACADEMIC_PAPER_FLAGS,
  setResearchLoggingConsent,
  saveStoredConsentState,
} = await import('./s3aWasmService');

import type { ResearchPaper } from '../types';

describe('S3A Scholar Pack Round-Trip Wire (Tiles 12, 13, 15)', () => {
  const humanUuid = '018f3a54-629a-7a1a-9f5b-111111111111';
  const aiUuid = '018f3a54-629a-7a1a-9f5b-222222222222';
  const sessionUuid = '018f3a54-629a-7a1a-9f5b-333333333333';

  beforeEach(() => {
    resetDualSession({
      actor_uuid: humanUuid,
      agent_uuid: aiUuid,
      sessionId: sessionUuid,
    });
  });

  test('dual UUID per session is preserved and accessible', () => {
    const session = getDualSessionState();
    expect(session.actor_uuid).toBe(humanUuid);
    expect(session.agent_uuid).toBe(aiUuid);
    expect(session.session_id).toBe(sessionUuid);
  });

  test('writes paper with metadata, PDF ref, sections, figures, tables, references to Scholar pack and reads back', async () => {
    // 1. Arrange a rich ResearchPaper record
    const paper: ResearchPaper = {
      id: 'W4389201928',
      openalex_id: 'W4389201928',
      doi: 'https://doi.org/10.1038/s41586-024-0001',
      title: 'Quantum Error Correction via Surface Codes',
      authors: 'A. Researcher, B. Scientist',
      year: 2024,
      citations: 128,
      abstract: 'We demonstrate fault-tolerant quantum error correction exceeding threshold fidelity...',
      pdfURL: 'https://example.org/papers/surface-code.pdf',
      sections: [
        { id: 'sec_intro', heading: 'Introduction', content: 'Surface codes provide topological protection...' },
        { id: 'sec_methods', heading: 'Syndrome Extraction', content: 'Ancilla measurements detect phase errors...' },
      ],
      figures: [
        { id: 'fig_1', label: 'Figure 1', caption: 'Rotated surface code lattice geometry', url: 'https://example.org/fig1.png' },
      ],
      tables: [
        { id: 'tab_1', label: 'Table 1', caption: 'Logical error rates at distance d=3, 5' },
      ],
      references: [
        { openalex_id: 'W1999281720', doi: '10.1103/PhysRevA.57.127', title: 'Fault-tolerant quantum computation', year: 1998, id: 'W1999281720', authors: '', abstract: '' },
        '10.1038/nature01234',
      ],
    };

    // 2. Act: Write paper to the Scholar pack
    const writeResult = await writePaperToScholarPack(paper);
    expect(writeResult.added).toBe(true);
    expect(writeResult.duplicate).toBe(false);
    expect(writeResult.edgesCount).toBe(7); // 1 PDF + 2 sections + 1 figure + 1 table + 2 references = 7

    // 3. Export active session to real S3A binary bytes
    const exported = await exportS3ASession();
    expect(exported.bytes).toBeDefined();
    expect(exported.bytes.length).toBeGreaterThan(FILE_HEADER_SIZE);

    // 4. Act: Verify WASM from_bytes loads the exported container without throwing
    const reloadedSnapshot = await parseParticipantSnapshot(exported.bytes);
    expect(reloadedSnapshot).toBeDefined();

    // 4. Act: Read back the binary Scholar pack container
    const parsed = readScholarPack(exported.bytes);

    // 5. Assert: Tile 15 SRS_MANIFEST
    expect(parsed.hasTile15).toBe(true);
    expect(parsed.manifest).not.toBeNull();
    expect(parsed.manifest?.magic).toBe('S3ASTOR1');
    expect(parsed.manifest?.schema_version).toBe(1);
    expect(parsed.manifest?.tile_count).toBeGreaterThanOrEqual(4); // workspace (14), papers (12), edges (13), manifest (15)
    expect(parsed.manifest?.crc32c_checksum).toBeGreaterThan(0);

    // 6. Assert: Tile 12 ACADEMIC_PAPERS
    expect(parsed.hasTile12).toBe(true);
    expect(parsed.papers.length).toBe(1);
    const paperRec = parsed.papers[0];
    expect(paperRec.paper_id).toBe(hashIri('W4389201928'));
    expect(paperRec.doi_prefix_hash).toBe(hashIri('10.1038/s41586-024-0001'));
    expect(paperRec.year).toBe(2024);
    expect(paperRec.citation_count).toBe(128);
    expect(paperRec.open_access_flag).toBe(1);
    // Flags must contain HAS_OA_URL_REF and RESEARCHER_APPROVED
    const flagsNum = Number(paperRec.flags);
    expect(flagsNum & ACADEMIC_PAPER_FLAGS.HAS_OA_URL_REF).toBe(ACADEMIC_PAPER_FLAGS.HAS_OA_URL_REF);
    expect(flagsNum & ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED).toBe(ACADEMIC_PAPER_FLAGS.RESEARCHER_APPROVED);

    // 7. Assert: Tile 13 RESEARCH_GRAPH
    expect(parsed.hasTile13).toBe(true);
    expect(parsed.edges.length).toBe(7);

    const paperHash = hashIri('W4389201928');
    // PDF ref edge
    const pdfEdge = parsed.edges.find(e => e.object_hash === hashIri('https://example.org/papers/surface-code.pdf'));
    expect(pdfEdge).toBeDefined();
    expect(pdfEdge?.subject_hash).toBe(paperHash);
    expect(pdfEdge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CONTAINS);
    expect(pdfEdge?.weight).toBeCloseTo(1.0);

    // Sections edges
    const sec1Edge = parsed.edges.find(e => e.object_hash === hashIri('sec_intro'));
    expect(sec1Edge).toBeDefined();
    expect(sec1Edge?.subject_hash).toBe(paperHash);
    expect(sec1Edge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CONTAINS);

    const sec2Edge = parsed.edges.find(e => e.object_hash === hashIri('sec_methods'));
    expect(sec2Edge).toBeDefined();
    expect(sec2Edge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CONTAINS);

    // Figure edge
    const figEdge = parsed.edges.find(e => e.object_hash === hashIri('fig_1'));
    expect(figEdge).toBeDefined();
    expect(figEdge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CONTAINS);

    // Table edge
    const tabEdge = parsed.edges.find(e => e.object_hash === hashIri('tab_1'));
    expect(tabEdge).toBeDefined();
    expect(tabEdge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CONTAINS);

    // References edges (predicate_id = CITES = 3)
    const ref1Edge = parsed.edges.find(e => e.object_hash === hashIri('W1999281720'));
    expect(ref1Edge).toBeDefined();
    expect(ref1Edge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CITES);

    const ref2Edge = parsed.edges.find(e => e.object_hash === hashIri('10.1038/nature01234'));
    expect(ref2Edge).toBeDefined();
    expect(ref2Edge?.predicate_id).toBe(RESEARCH_GRAPH_PREDICATES.CITES);
  });

  test('tracing stays behind consent: without consent no tracing statement is emitted', async () => {
    // Revoke / deny consent
    setResearchLoggingConsent(false);
    saveStoredConsentState('none');

    const paper: ResearchPaper = {
      id: 'W999000111',
      openalex_id: 'W999000111',
      title: 'Consent-Guarded Paper Study',
      authors: 'Test Author',
      year: 2023,
      abstract: 'Testing consent boundaries...',
    };

    const res = await writePaperToScholarPack(paper);
    expect(res.added).toBe(true);
    expect(res.tracingEmitted).toBe(false);
  });

  test('tracing emitted when research consent is granted (Pass 1 selection)', async () => {
    // Grant consent
    setResearchLoggingConsent(true);
    saveStoredConsentState('granted');

    const paper: ResearchPaper = {
      id: 'W888777666',
      openalex_id: 'W888777666',
      title: 'Consented Researcher Selection Study',
      authors: 'Test Author',
      year: 2024,
      abstract: 'Testing selection with active consent...',
    };

    const res = await writePaperToScholarPack(paper);
    expect(res.added).toBe(true);
    expect(res.tracingEmitted).toBe(true);
  });
});

const FILE_HEADER_SIZE = 512;
