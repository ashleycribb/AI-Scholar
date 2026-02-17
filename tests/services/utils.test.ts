import { describe, it, expect } from 'vitest';
import { deinvertAbstract } from '../../services/utils';

describe('deinvertAbstract', () => {
  it('should return empty string for null input', () => {
    // @ts-ignore
    expect(deinvertAbstract(null)).toBe('');
  });

  it('should return empty string for undefined input', () => {
    // @ts-ignore
    expect(deinvertAbstract(undefined)).toBe('');
  });

  it('should return empty string for empty object', () => {
    expect(deinvertAbstract({})).toBe('');
  });

  it('should reconstruct basic abstract correctly', () => {
    const inverted = {
      "hello": [0],
      "world": [1]
    };
    expect(deinvertAbstract(inverted)).toBe('hello world');
  });

  it('should handle words with multiple occurrences', () => {
    const inverted = {
      "a": [0, 2],
      "b": [1]
    };
    expect(deinvertAbstract(inverted)).toBe('a b a');
  });

  it('should handle out of order indices', () => {
    const inverted = {
      "world": [1],
      "hello": [0]
    };
    expect(deinvertAbstract(inverted)).toBe('hello world');
  });

  it('should handle sparse indices (gaps)', () => {
    const inverted = {
      "hello": [0],
      "world": [2]
    };
    // Based on the implementation, gaps are empty strings.
    // array: ['hello', '', 'world']
    // join(' '): 'hello  world'
    expect(deinvertAbstract(inverted)).toBe('hello  world');
  });

  it('should handle large indices', () => {
      const inverted = {
          "start": [0],
          "end": [100]
      };
      // Expect 100 spaces between start and end.
      const result = deinvertAbstract(inverted);
      expect(result.startsWith('start')).toBe(true);
      expect(result.endsWith('end')).toBe(true);
      const spaces = ' '.repeat(100);
      expect(result).toBe(`start${spaces}end`);
  });
});
