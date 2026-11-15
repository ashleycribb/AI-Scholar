import { describe, expect, test } from 'bun:test';
import { checkEntailment } from './entailmentService';

describe('checkEntailment', () => {
  test('returns unavailable with no confidence, even when keywords would have matched the old mock', async () => {
    const result = await checkEntailment(
      'machine learning improves accuracy',
      'machine learning improves accuracy in this study of outcomes'
    );
    expect(result.verdict).toBe('UNAVAILABLE');
    expect(result.confidence).toBeNull();
    expect(result.source).toBe('unavailable');
  });
});
