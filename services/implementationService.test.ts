
import { describe, test, expect, mock } from "bun:test";
import type { ResearchPaper, ModelDefinition } from "../types";

// Mock the GoogleGenAI class BEFORE importing the service that uses it
mock.module("@google/genai", () => {
  return {
    GoogleGenAI: class {
      constructor(options: any) {}
      models = {
        generateContent: async () => {
          return {
            text: JSON.stringify({
              overview: "Test Overview",
              fileStructure: [{ path: "test.py", description: "test" }],
              dependencies: ["numpy"],
              steps: [{ stepNumber: 1, title: "Step 1", instruction: "Do it" }]
            })
          };
        }
      };
    },
    Type: { OBJECT: "OBJECT", STRING: "STRING", NUMBER: "NUMBER", ARRAY: "ARRAY", BOOLEAN: "BOOLEAN" }
  };
});

// Import service after mocking
const { generateImplementationPlan } = await import("./implementationService");

describe("implementationService", () => {
  test("generateImplementationPlan returns parsed JSON", async () => {
    const paper: ResearchPaper = {
        id: "1",
        title: "Test Paper",
        authors: "Author",
        year: 2023,
        abstract: "Abstract",
        citations: 0
    };
    const modelDef: ModelDefinition = { id: "gemini-pro", name: "Gemini", provider: "gemini" };

    const plan = await generateImplementationPlan(paper, modelDef);

    expect(plan).toBeDefined();
    expect(plan.overview).toBe("Test Overview");
    expect(plan.fileStructure).toHaveLength(1);
    expect(plan.dependencies).toContain("numpy");
  });
});
