import { expect, test, describe } from "bun:test";
import { deinvertAbstract } from "./utils";

describe("deinvertAbstract", () => {
  test("should reconstruct a standard inverted index", () => {
    const inverted = {
      "The": [0],
      "abstract": [1],
      "is": [2],
      "here": [3]
    };
    expect(deinvertAbstract(inverted)).toBe("The abstract is here");
  });

  test("should handle words appearing multiple times", () => {
    const inverted = {
      "to": [0, 4],
      "be": [1, 5],
      "or": [2],
      "not": [3]
    };
    expect(deinvertAbstract(inverted)).toBe("to be or not to be");
  });

  test("should return an empty string for an empty object", () => {
    expect(deinvertAbstract({})).toBe("");
  });

  test("should return an empty string for null or undefined", () => {
    expect(deinvertAbstract(null as any)).toBe("");
    expect(deinvertAbstract(undefined as any)).toBe("");
  });

  test("should handle single word abstract", () => {
    const inverted = { "Single": [0] };
    expect(deinvertAbstract(inverted)).toBe("Single");
  });

  test("should handle gaps in positions by joining with spaces", () => {
    const inverted = {
      "Gap": [0],
      "found": [2]
    };
    // Position 1 will be empty string, resulting in double spaces when joined
    expect(deinvertAbstract(inverted)).toBe("Gap  found");
  });

  test("should handle multi-word entries at same positions (though unlikely from OpenAlex)", () => {
    const inverted = {
      "Word1": [0],
      "Word2": [0]
    };
    // The second one processed will overwrite the first one at index 0
    // "Word1" then "Word2" or vice versa depending on object key iteration order
    const result = deinvertAbstract(inverted);
    expect(["Word1", "Word2"]).toContain(result);
  });
});
