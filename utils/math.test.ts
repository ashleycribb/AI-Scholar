import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from './math';

describe('cosineSimilarity', () => {
  it('should return 1 for identical vectors', () => {
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
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

  it('should handle vectors with different magnitudes', () => {
    const a = [1, 2];
    const b = [2, 4]; // Same direction, different magnitude
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('should return 0 if one vector is zero', () => {
    const a = [1, 2, 3];
    const b = [0, 0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
    expect(cosineSimilarity(b, a)).toBe(0);
  });

  it('should return 0 if both vectors are zero', () => {
    const a = [0, 0];
    const b = [0, 0];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should handle empty vectors', () => {
    const a: number[] = [];
    const b: number[] = [];
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('should handle vectors of different lengths (padding with 0)', () => {
    const a = [1, 1];
    const b = [1];
    // Treated as [1, 1] and [1, 0]
    // Dot product: 1*1 + 1*0 = 1
    // NormA: sqrt(2)
    // NormB: 1
    // Result: 1 / sqrt(2) ~= 0.7071
    expect(cosineSimilarity(a, b)).toBeCloseTo(1 / Math.sqrt(2));
    expect(cosineSimilarity(b, a)).toBeCloseTo(1 / Math.sqrt(2));
  });

  it('should handle vectors with negative values correctly', () => {
    const a = [1, -1];
    const b = [-1, 1];
    // Dot: -1 + -1 = -2
    // NormA: sqrt(2)
    // NormB: sqrt(2)
    // Result: -2 / 2 = -1
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });
});
