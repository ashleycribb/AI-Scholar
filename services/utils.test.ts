import { expect, test, describe } from "bun:test";
import { deinvertAbstract } from "./utils";

describe("deinvertAbstract", () => {
  test("reconstructs a simple abstract correctly", () => {
    const input = {
      "Hello": [0],
      "world": [1]
    };
    expect(deinvertAbstract(input)).toBe("Hello world");
  });

  test("handles multiple occurrences of words", () => {
    const input = {
      "a": [0, 2],
      "b": [1]
    };
    expect(deinvertAbstract(input)).toBe("a b a");
  });

  test("handles disordered keys correctly", () => {
    const input = {
      "world": [1],
      "Hello": [0]
    };
    expect(deinvertAbstract(input)).toBe("Hello world");
  });

  test("handles empty input object", () => {
    expect(deinvertAbstract({})).toBe("");
  });

  test("handles null input", () => {
    // @ts-ignore
    expect(deinvertAbstract(null)).toBe("");
  });

  test("handles undefined input", () => {
    // @ts-ignore
    expect(deinvertAbstract(undefined)).toBe("");
  });

  test("handles gaps in indices with empty strings (double spaces)", () => {
    const input = {
      "Hello": [0],
      "world": [2]
    };
    // Index 1 is empty, filled with '', joined with space -> 'Hello  world'
    expect(deinvertAbstract(input)).toBe("Hello  world");
  });

  test("handles single word abstract", () => {
    const input = {
      "Test": [0]
    };
    expect(deinvertAbstract(input)).toBe("Test");
  });

  test("handles large indices gracefully (trimming leading spaces)", () => {
    const input = {
      "End": [10]
    };
    // Array: ['', ..., 'End'] -> join -> "          End" -> trim -> "End"
    expect(deinvertAbstract(input)).toBe("End");
  });

  test("handles complex mixed case", () => {
      const input = {
          "The": [0],
          "quick": [1],
          "brown": [2],
          "fox": [3],
          "jumps": [4],
          "over": [5],
          "the": [6],
          "lazy": [7],
          "dog": [8]
      };
      expect(deinvertAbstract(input)).toBe("The quick brown fox jumps over the lazy dog");
  });
});
