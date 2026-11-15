import { describe, expect, test } from "bun:test";
import {
  COACHING_ACTIONS,
  COACHING_SYSTEM_INSTRUCTION,
  buildCoachingUserMessage,
  coachingGuidanceToMarkdown,
  promptLooksLikeReviewWriting,
  type CoachingGuidance,
} from "./reviewCoachService";
import type { ResearchPaper } from "../types";

const samplePaper = (overrides: Partial<ResearchPaper> = {}): ResearchPaper => ({
  id: "p1",
  title: "Trust calibration in human-AI teams",
  authors: "Lee, J.",
  year: 2020,
  abstract: "A study of how explanations affect trust calibration.",
  ...overrides,
});

describe("review coach action set", () => {
  test("offers coaching actions and no review-writing actions", () => {
    const ids = COACHING_ACTIONS.map((action) => action.id).sort();
    expect(ids).toEqual(["concept_explainer", "draft_check", "guiding_questions", "next_steps"].sort());

    const blob = COACHING_ACTIONS.map((action) => `${action.label}\n${action.description}`).join("\n");
    expect(promptLooksLikeReviewWriting(blob)).toBe(false);
    expect(blob).toMatch(/Keshav/i);
    expect(blob).toMatch(/claim/i);
    expect(blob).toMatch(/evidence/i);
    expect(blob).toMatch(/gap/i);
    expect(blob).not.toMatch(/Draft a formal literature review/i);
    expect(blob).not.toMatch(/Systematic Literature Review Chapter/i);
  });

  test("system instructions refuse review prose and redirect to coaching", () => {
    expect(promptLooksLikeReviewWriting(COACHING_SYSTEM_INSTRUCTION)).toBe(false);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/must refuse to write literature-review prose/i);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/synthesis chapters/i);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/redirect to coaching/i);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/Keshav's three-pass/i);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/never rewrites/i);
    expect(COACHING_SYSTEM_INSTRUCTION).toMatch(/Humans make every judgment/i);
  });
});

describe("buildCoachingUserMessage", () => {
  test("includes the topic, selected papers, and action, without asking for a chapter", () => {
    const message = buildCoachingUserMessage({
      action: "guiding_questions",
      topic: "human-AI trust calibration",
      papers: [samplePaper()],
    });

    expect(message).toContain("human-AI trust calibration");
    expect(message).toContain("Trust calibration in human-AI teams");
    expect(message).toContain("A study of how explanations affect trust calibration.");
    expect(message).toContain("Coaching action: guiding_questions");
    expect(message).toMatch(/Do not write review prose or a chapter/);
    expect(promptLooksLikeReviewWriting(message)).toBe(false);
  });

  test("draft checks include the researcher's text and forbid rewrites", () => {
    const draft = "Prior work suggests explanations always improve trust.";
    const message = buildCoachingUserMessage({
      action: "draft_check",
      topic: "trust",
      papers: [samplePaper()],
      draftText: draft,
    });

    expect(message).toContain(draft);
    expect(message).toMatch(/check with questions only; do not rewrite/i);
  });

  test("draft checks without pasted text ask the researcher to provide a passage", () => {
    const message = buildCoachingUserMessage({
      action: "draft_check",
      topic: "trust",
      papers: [],
    });

    expect(message).toMatch(/has not pasted a draft/i);
    expect(message).toMatch(/No papers are selected yet/i);
  });
});

describe("coachingGuidanceToMarkdown", () => {
  test("exports questions and next steps, not a review chapter heading", () => {
    const guidance: CoachingGuidance = {
      title: "Questions on trust calibration",
      framing: "You remain the author of the review.",
      questions: ["What claim is Lee making about explanations?"],
      conceptNotes: [{ term: "Claim", explanation: "A contestable statement that needs evidence." }],
      nextSteps: ["Re-read Lee with a first-pass checklist."],
    };
    const markdown = coachingGuidanceToMarkdown(guidance);

    expect(markdown).toContain("# Questions on trust calibration");
    expect(markdown).toContain("You remain the author of the review.");
    expect(markdown).toContain("What claim is Lee making about explanations?");
    expect(markdown).toContain("### Claim");
    expect(markdown).toContain("Re-read Lee with a first-pass checklist.");
    expect(markdown).toMatch(/The researcher writes and judges the literature review/);
    expect(markdown).not.toMatch(/Executive Summary/i);
    expect(promptLooksLikeReviewWriting(markdown)).toBe(false);
  });
});

describe("source prompts no longer ask the model to write a review", () => {
  const files = [
    "components/ResearchAssistant.tsx",
    "services/deepResearchService.ts",
    "services/agentService.ts",
    "services/ragService.ts",
  ];

  test.each(files)("%s does not instruct the model to draft a literature review", async (relativePath) => {
    const source = await Bun.file(relativePath).text();
    expect(promptLooksLikeReviewWriting(source)).toBe(false);
    expect(source).not.toContain("Draft a formal literature review synthesis chapter");
    expect(source).not.toContain("Systematic Literature Review Chapter");
    expect(source).not.toContain("Synthesis Dossier");
  });
});
