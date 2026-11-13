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

const {
  writePaperToScholarPack,
  readScholarPack,
  resetDualSession,
  exportS3ASession,
  parseParticipantSnapshot,
  extractArxivId,
  arxivHtmlUrlForId,
  setResearchLoggingConsent,
  saveStoredConsentState,
} = await import('./s3aWasmService');

import type { ResearchPaper } from '../types';

describe('full paper metadata record in exported .s3a', () => {
  const humanUuid = '018f3a54-629a-7a1a-9f5b-bbbb11111111';
  const aiUuid = '018f3a54-629a-7a1a-9f5b-bbbb22222222';
  const sessionUuid = '018f3a54-629a-7a1a-9f5b-bbbb33333333';

  beforeEach(() => {
    resetDualSession({
      actor_uuid: humanUuid,
      agent_uuid: aiUuid,
      sessionId: sessionUuid,
    });
    setResearchLoggingConsent(false);
    saveStoredConsentState('none');
  });

  test('extractArxivId records the html edition URL and does not need a fetch', () => {
    expect(extractArxivId('https://arxiv.org/pdf/2401.12345.pdf')).toBe('2401.12345');
    expect(extractArxivId('https://arxiv.org/abs/2401.12345v2')).toBe('2401.12345');
    expect(extractArxivId('10.48550/arXiv.2401.12345')).toBe('2401.12345');
    expect(arxivHtmlUrlForId('2401.12345')).toBe('https://arxiv.org/html/2401.12345');
  });

  test("a staged paper's exported .s3a round-trips with title/authors/abstract/DOI/arXiv HTML link/reference IDs present", async () => {
    const paper: ResearchPaper = {
      id: 'W555000111',
      openalex_id: 'W555000111',
      title: 'Full Metadata Record Paper',
      authors: 'A. Author, B. Writer',
      year: 2024,
      abstract: 'An abstract that must survive the round-trip.',
      doi: '10.48550/arXiv.2401.12345',
      journal: 'Proceedings of Something',
      pdfURL: 'https://arxiv.org/pdf/2401.12345.pdf',
      references: [
        { openalex_id: 'W1999281720', doi: '10.1103/PhysRevA.57.127', title: 'Fault-tolerant quantum computation' },
        '10.1038/nature01234',
      ],
    };

    const writeResult = await writePaperToScholarPack(paper);
    expect(writeResult.added).toBe(true);
    expect(writeResult.tracingEmitted).toBe(false);

    const exported = await exportS3ASession({ projectOrSessionName: 'full-metadata' });
    expect(exported.bytes.length).toBeGreaterThan(0);

    // Engine container must still load with the JSON trailer attached.
    const reloaded = await parseParticipantSnapshot(exported.bytes);
    expect(reloaded).toBeDefined();

    const parsed = readScholarPack(exported.bytes);
    expect(parsed.paperMetadata.length).toBe(1);
    const rec = parsed.paperMetadata[0];
    expect(rec.title).toBe('Full Metadata Record Paper');
    expect(rec.authors).toBe('A. Author, B. Writer');
    expect(rec.abstract).toBe('An abstract that must survive the round-trip.');
    expect(rec.doi).toBe('10.48550/arXiv.2401.12345');
    expect(rec.openalex_id).toBe('W555000111');
    expect(rec.venue).toBe('Proceedings of Something');
    expect(rec.year).toBe(2024);
    expect(rec.arxiv_id).toBe('2401.12345');
    expect(rec.arxiv_html_url).toBe('https://arxiv.org/html/2401.12345');
    expect(rec.oa_pdf_url).toBe('https://arxiv.org/pdf/2401.12345.pdf');
    expect(rec.selected_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rec.references).toEqual([
      { openalex_id: 'W1999281720', doi: '10.1103/PhysRevA.57.127', title: 'Fault-tolerant quantum computation' },
      { doi: '10.1038/nature01234' },
    ]);
  });
});
