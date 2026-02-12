import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from './math';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const vec = [1, 2, 3];
    expect(cosineSimilarity(vec, vec)).toBeCloseTo(1);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0];
    const b = [0, 1];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('should return -1 for opposite vectors', () => {
    const a = [1, 2];
    const b = [-1, -2];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('should return 1 for vectors with same direction but different magnitudes', () => {
    const a = [1, 2];
    const b = [2, 4];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('should return 0 if one vector is zero vector', () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBe(0);
    expect(cosineSimilarity(b, a)).toBe(0);
  });

  it('should handle vectors of different lengths (implicit 0 padding)', () => {
    const a = [1, 0];
    const b = [1];
    // implicit 0s in dot product, but full norm calculation for each vector
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
    expect(cosineSimilarity(b, a)).toBeCloseTo(1);
  });

  it('should handle vectors of different lengths with non-zero tail', () => {
    const a = [1];
    const b = [1, 100];
    // dot product effectively ignores the tail of the longer vector (if iterating shorter)
    // or multiplies by 0 (if iterating longer), so dot=1.
    // norms are calculated on full vectors: normA=1, normB=sqrt(10001).
    const expected = 1 / Math.sqrt(10001);

    const result = cosineSimilarity(a, b);
    expect(result).toBeCloseTo(expected);

    const resultSwapped = cosineSimilarity(b, a);
    expect(resultSwapped).toBeCloseTo(expected);
  });

  it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
      expect(cosineSimilarity([1], [])).toBe(0);
  });
});
