
import { describe, it, expect, mock, spyOn } from "bun:test";
import { Project, ResearchPaper, ModelDefinition } from "../types";

// Mock dependencies
const mockSendMessage = mock();

// Mock GoogleGenAI
mock.module("@google/genai", () => {
  return {
    GoogleGenAI: class {
      constructor(options: any) {}
      get chats() {
        return {
          create: () => ({
            sendMessage: mockSendMessage
          })
        };
      }
    },
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      NUMBER: "NUMBER",
      BOOLEAN: "BOOLEAN",
      ARRAY: "ARRAY"
    }
  };
});

// Mock apiService
mock.module("./services/apiService", () => {
    return {
        findConnectedPapers: mock(async () => [])
    };
});

describe("runAgentTask", () => {
    it("should execute tools in parallel", async () => {
        const { runAgentTask } = await import("./ragService");

        const project: Project = { id: "p1", name: "Test Project", papers: [], date: "2023", color: "blue" };
        const papers: ResearchPaper[] = [
            { id: "paper1", title: "Paper 1", authors: "Author A", year: 2023, abstract: "Abstract 1", citations: 10, sourceURL: "url1" },
            { id: "paper2", title: "Paper 2", authors: "Author B", year: 2022, abstract: "Abstract 2", citations: 5, sourceURL: "url2" }
        ];
        const modelDef: ModelDefinition = { id: "gemini-2.0-flash", name: "Gemini Flash", provider: "gemini", contextWindow: 10000 };

        mockSendMessage
            .mockResolvedValueOnce({
                functionCalls: [
                    { name: "get_paper_details", args: { paper_id: "paper1" }, id: "call1" },
                    { name: "get_paper_details", args: { paper_id: "paper2" }, id: "call2" }
                ]
            })
            .mockResolvedValueOnce({
                text: "Final answer"
            });

        const generator = runAgentTask("query", project, papers, modelDef);

        const updates: any[] = [];
        for await (const update of generator) {
            updates.push(update);
        }

        // With parallel execution, we expect:
        // 1. Initial sendMessage -> returns 2 function calls
        // 2. Parallel execution of tools (no sendMessage here)
        // 3. One sendMessage with BOTH results -> returns final answer
        // Total 2 sendMessage calls.
        expect(mockSendMessage).toHaveBeenCalledTimes(2);

        // Verify the second call contains both responses
        const secondCallArgs = mockSendMessage.mock.calls[1][0];

        // Check structure of functionResponses.
        // It should be an array of responses.
        const responses = secondCallArgs.message.functionResponses;
        expect(Array.isArray(responses)).toBe(true);
        expect(responses).toHaveLength(2);

        // Order might vary depending on Promise.all and map, but usually preserves order of input
        expect(responses[0].id).toBe("call1");
        expect(responses[0].name).toBe("get_paper_details");
        expect(responses[1].id).toBe("call2");
        expect(responses[1].name).toBe("get_paper_details");
    });
});
