import { cosineSimilarity } from '../utils/math';
import assert from 'node:assert/strict';

console.log('Running tests for cosineSimilarity...');

function assertAlmostEqual(actual: number, expected: number, message?: string) {
    if (Math.abs(actual - expected) > 1e-10) {
        assert.fail(`${message || 'Values not equal'}: expected ${expected}, got ${actual}`);
    }
}

// Test 1: Identical vectors
{
  const a = [1, 2, 3];
  const b = [1, 2, 3];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, 1, 'Identical vectors should have similarity 1');
  console.log('✅ Identical vectors passed');
}

// Test 2: Orthogonal vectors
{
  const a = [1, 0];
  const b = [0, 1];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, 0, 'Orthogonal vectors should have similarity 0');
  console.log('✅ Orthogonal vectors passed');
}

// Test 3: Opposite vectors
{
  const a = [1, 2];
  const b = [-1, -2];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, -1, 'Opposite vectors should have similarity -1');
  console.log('✅ Opposite vectors passed');
}

// Test 4: Scaled vectors
{
  const a = [1, 2];
  const b = [2, 4];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, 1, 'Scaled vectors should have similarity 1');
  console.log('✅ Scaled vectors passed');
}

// Test 5: Known values (3-4-5 triangle logic, but standard vectors)
{
  // a = [3, 0], b = [3, 4]
  // dot = 9
  // normA = 3
  // normB = 5
  // sim = 9 / 15 = 0.6
  const a = [3, 0];
  const b = [3, 4];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, 0.6, 'Known values check');
  console.log('✅ Known values passed');
}

// Test 6: Zero vectors
{
  const a = [0, 0];
  const b = [1, 2];
  const result = cosineSimilarity(a, b);
  assertAlmostEqual(result, 0, 'Zero vector should result in 0 similarity');
  console.log('✅ Zero vector (a) passed');

  const c = [1, 2];
  const d = [0, 0];
  const result2 = cosineSimilarity(c, d);
  assertAlmostEqual(result2, 0, 'Zero vector should result in 0 similarity');
  console.log('✅ Zero vector (b) passed');
}

// Test 7: Empty vectors
{
  const result = cosineSimilarity([], []);
  assertAlmostEqual(result, 0, 'Empty vectors should result in 0 similarity');
  console.log('✅ Empty vectors passed');
}

// Test 8: Different lengths (a shorter than b)
{
  // a = [1], b = [1, 5]
  // dot = 1*1 = 1 (a.reduce stops at index 0)
  // normA = 1
  // normB = sqrt(1 + 25) = sqrt(26)
  // sim = 1 / sqrt(26) ~= 0.196116135
  const a = [1];
  const b = [1, 5];
  const result = cosineSimilarity(a, b);
  const expected = 1 / Math.sqrt(26);
  assertAlmostEqual(result, expected, 'Different lengths (a < b)');
  console.log('✅ Different lengths (a < b) passed');
}

// Test 9: Different lengths (a longer than b)
{
  // a = [1, 5], b = [1]
  // dot = 1*1 + 5*(undefined->0) = 1
  // normA = sqrt(26)
  // normB = 1
  // sim = 1 / sqrt(26)
  const a = [1, 5];
  const b = [1];
  const result = cosineSimilarity(a, b);
  const expected = 1 / Math.sqrt(26);
  assertAlmostEqual(result, expected, 'Different lengths (a > b)');
  console.log('✅ Different lengths (a > b) passed');
}

console.log('All tests passed!');
