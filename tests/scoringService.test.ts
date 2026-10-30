
import { computeVACS } from '../services/scoringService';
import { Metadata, CitationStats, EvidenceSpan, VerificationResult } from '../types';
import assert from 'node:assert';

const test = (name: string, fn: () => void) => {
  try {
    fn();
    console.log(`✅ ${name}`);
  } catch (error) {
    console.error(`❌ ${name}`);
    console.error(error);
    process.exit(1);
  }
};

const mockEvidenceSpan = (score: number): EvidenceSpan => ({
  source: 'test-source',
  passage: 'test passage',
  score
});

const mockMetadata = (isRetracted: boolean, credibilityScore: number, reproducibilityScore: number, temporalScore: number): Metadata => ({
  isRetracted,
  credibilityScore,
  reproducibilityScore,
  temporalScore,
  doi: '10.1234/5678',
  title: 'Test Paper',
  authors: ['Author One'],
  journal: 'Test Journal',
  year: 2023
});

const mockCitationStats = (supportRatio: number): CitationStats => ({
  total: 10,
  supportCount: 5,
  contradictCount: 5,
  supportRatio
});

console.log('🧪 Starting tests for computeVACS...');

test('Retracted Paper: Should be Questionable even with high VACS', () => {
  const meta = mockMetadata(true, 1, 1, 1);
  const citationStats = mockCitationStats(1);
  const evidenceSpans = [mockEvidenceSpan(1)];

  const result = computeVACS(meta, citationStats, evidenceSpans);
  assert.strictEqual(result.verdict, 'Questionable', 'Verdict should be Questionable for retracted papers');
});

test('Non-Retracted Paper: High VACS should be Verified', () => {
  const meta = mockMetadata(false, 1, 1, 1);
  const citationStats = mockCitationStats(1);
  const evidenceSpans = [mockEvidenceSpan(1)];

  const result = computeVACS(meta, citationStats, evidenceSpans);
  assert.strictEqual(result.verdict, 'Verified', 'Verdict should be Verified for high VACS');
});

test('Non-Retracted Paper: Low VACS should be Questionable', () => {
  const meta = mockMetadata(false, 0, 0, 0);
  const citationStats = mockCitationStats(0);
  const evidenceSpans: EvidenceSpan[] = [];

  const result = computeVACS(meta, citationStats, evidenceSpans);
  assert.strictEqual(result.verdict, 'Questionable', 'Verdict should be Questionable for low VACS');
});

test('Non-Retracted Paper: Mid VACS should be Inconclusive', () => {
  // C=1, R=1, I=1, T=1, E=0 (invalid because below threshold or empty)
  // VACS = 100 * (0.25*1 + 0 + 0.2*1 + 0.15*1 + 0.1*1) = 70
  const meta = mockMetadata(false, 1, 1, 1);
  const citationStats = mockCitationStats(1);
  const evidenceSpans: EvidenceSpan[] = [];

  const result = computeVACS(meta, citationStats, evidenceSpans);
  assert.strictEqual(result.verdict, 'Inconclusive', 'Verdict should be Inconclusive for mid VACS');
  assert.strictEqual(result.vacs, 70, 'VACS score should be 70');
});

console.log('All tests passed!');
