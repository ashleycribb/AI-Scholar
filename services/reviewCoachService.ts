import { Type, GenerateContentResponse } from "@google/genai";
import { ai } from "./geminiClient";
import type { ModelDefinition, ResearchPaper } from "../types";

/**
 * Literature-review coach: teaches researchers how to run a review and
 * helps them think about their selected papers. It never writes the review.
 */

export type CoachingActionId =
  | "guiding_questions"
  | "concept_explainer"
  | "draft_check"
  | "next_steps";

export interface CoachingAction {
  id: CoachingActionId;
  label: string;
  description: string;
}

export const COACHING_ACTIONS: CoachingAction[] = [
  {
    id: "guiding_questions",
    label: "Guiding questions about your papers",
    description: "Ask questions that help you compare claims, methods, and evidence in the papers you selected. The coach will not write the comparison for you.",
  },
  {
    id: "concept_explainer",
    label: "Explain review concepts",
    description: "Explain what a claim is, what counts as evidence, how to notice gaps, and Keshav's three-pass reading method.",
  },
  {
    id: "draft_check",
    label: "Check my draft with questions",
    description: "Read a passage you wrote and ask questions about claims, evidence, attribution, and gaps. The coach will not rewrite your prose.",
  },
  {
    id: "next_steps",
    label: "Suggest next steps",
    description: "Propose concrete next actions you can take in your own review process, leaving every judgment to you.",
  },
];

export const COACHING_SYSTEM_INSTRUCTION = `You are a literature-review coach, not a ghostwriter.

Your job is to teach the researcher how to run their own literature review and to help them think about the papers they have selected. Humans make every judgment: which claims to include, how to weigh evidence, what counts as a gap, and what the review concludes.

You MUST refuse to write literature-review prose, synthesis chapters, executive summaries of the literature, or any passage that could be pasted into a review as the researcher's own writing. If the user asks you to draft, write, rewrite, or produce a literature review or chapter, briefly refuse and redirect to coaching: ask guiding questions, explain a concept, check their draft with questions (never rewrites), or suggest next steps they can take.

When explaining concepts, cover as relevant:
- What a claim is (a contestable statement the author must support).
- What counts as evidence (data, methods, results, and how they do or do not support a claim).
- How to notice gaps (unasked questions, weak or missing evidence, conflicting findings the researcher must judge).
- Keshav's three-pass reading method: first pass (title, abstract, introduction, conclusions, and headings to map the paper); second pass (read for argument, figures, and evidence); third pass (attempt to virtually re-implement or reconstruct the work).

When checking a draft, ask questions about structure, claims, evidence, attribution, and gaps. Do not rewrite their sentences or supply replacement paragraphs.

Keep the response as questions, short concept explanations, and next-step nudges. Do not invent paper findings.`;

export const FORBIDDEN_REVIEW_WRITING_PATTERNS: RegExp[] = [
  /draft a formal literature review/i,
  /write a rigorous literature review/i,
  /act as a principal investigator\.\s*write/i,
  /synthesize it and provide a final, comprehensive answer/i,
];

export interface ConceptNote {
  term: string;
  explanation: string;
}

export interface CoachingGuidance {
  title: string;
  framing: string;
  questions: string[];
  conceptNotes: ConceptNote[];
  nextSteps: string[];
}

export interface CoachingRequest {
  action: CoachingActionId;
  topic: string;
  papers: ResearchPaper[];
  draftText?: string;
}

const coachingSchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING },
    framing: { type: Type.STRING, description: "A short reminder that the researcher authors the review; include a brief refusal if they asked you to write it." },
    questions: { type: Type.ARRAY, items: { type: Type.STRING } },
    conceptNotes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          term: { type: Type.STRING },
          explanation: { type: Type.STRING },
        },
        required: ["term", "explanation"],
      },
    },
    nextSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ["title", "framing", "questions", "conceptNotes", "nextSteps"],
};

export function actionById(id: CoachingActionId): CoachingAction {
  const action = COACHING_ACTIONS.find((item) => item.id === id);
  if (!action) {
    throw new Error(`Unknown coaching action: ${id}`);
  }
  return action;
}

export function promptLooksLikeReviewWriting(text: string): boolean {
  return FORBIDDEN_REVIEW_WRITING_PATTERNS.some((pattern) => pattern.test(text));
}

export function buildCoachingUserMessage(request: CoachingRequest): string {
  const action = actionById(request.action);
  const topic = request.topic.trim() || "the researcher's current inquiry";
  const paperLines = request.papers.length === 0
    ? "(No papers are selected yet. Ask the researcher to choose papers and, if useful, explain how to screen them.)"
    : request.papers.map((paper, index) => {
        const authors = Array.isArray(paper.authors) ? paper.authors.join(", ") : (paper.authors || "Unknown authors");
        const year = paper.year || "n.d.";
        const abstract = (paper.abstract || "").trim();
        const clipped = abstract.length > 400 ? `${abstract.slice(0, 400)}…` : abstract;
        return `${index + 1}. ${paper.title || "Untitled"} (${authors}, ${year})${clipped ? `\n   Abstract: ${clipped}` : ""}`;
      }).join("\n");

  const draft = (request.draftText || "").trim();
  const draftBlock = request.action === "draft_check"
    ? (draft
      ? `

Researcher's draft (check with questions only; do not rewrite):
"""
${draft}
"""`
      : "\n\nThe researcher has not pasted a draft yet. Ask them to paste a passage, and do not invent one.")
    : (draft ? `

Optional draft context the researcher shared (do not rewrite it):
"""
${draft}
"""` : "");

  return `Coaching action: ${action.id}
Action intent: ${action.description}

Researcher's topic or inquiry:
${topic}

Selected papers:
${paperLines}
${draftBlock}

Respond with JSON matching the schema. Remember: questions, concept explanations, and next steps only. Do not write review prose or a chapter.`;
}

export function coachingGuidanceToMarkdown(guidance: CoachingGuidance): string {
  let md = `# ${guidance.title}

${guidance.framing}
`;
  if (guidance.questions.length > 0) {
    md += `
## Guiding questions
`;
    guidance.questions.forEach((question) => {
      md += `- ${question}
`;
    });
  }
  if (guidance.conceptNotes.length > 0) {
    md += `
## Concepts
`;
    guidance.conceptNotes.forEach((note) => {
      md += `### ${note.term}

${note.explanation}
`;
    });
  }
  if (guidance.nextSteps.length > 0) {
    md += `
## Suggested next steps
`;
    guidance.nextSteps.forEach((step) => {
      md += `- ${step}
`;
    });
  }
  md += `
These notes are coaching only. The researcher writes and judges the literature review.
`;
  return md;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function runWithRetry<T>(fn: () => Promise<T>, retries = 5, delay = 3000): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errBody = error?.error || error;
    const errorCode = errBody?.code || error?.status;
    const errorMessage = errBody?.message || error?.message || JSON.stringify(error);
    const errorStatus = errBody?.status;
    if (retries > 0 && (
      errorCode === 429 ||
      errorStatus === "RESOURCE_EXHAUSTED" ||
      errorMessage?.includes("429") ||
      errorMessage?.includes("RESOURCE_EXHAUSTED") ||
      errorMessage?.includes("quota")
    )) {
      const jitter = Math.random() * 1000;
      await wait(delay + jitter);
      return runWithRetry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

function safeJsonParse(jsonString: string) {
  try {
    const cleanedString = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();
    return JSON.parse(cleanedString);
  } catch (e) {
    console.error("Failed to parse JSON:", e);
    return null;
  }
}

export async function coachLiteratureReview(
  request: CoachingRequest,
  model: ModelDefinition
): Promise<CoachingGuidance> {
  if (request.action === "draft_check" && !(request.draftText || "").trim()) {
    return {
      title: "Paste a draft to check",
      framing: "I can question a passage you wrote, but I will not write or rewrite your literature review. Paste a draft paragraph or outline and ask again.",
      questions: [
        "Which claim in this passage do you most need a reader to accept?",
        "What evidence from your selected papers would you point to for that claim?",
        "Where might a skeptical reader say the evidence is thin or conflicting?",
      ],
      conceptNotes: [
        {
          term: "Draft check",
          explanation: "A coach should ask about structure, claims, evidence, attribution, and gaps. Replacement sentences would be writing the review for you, so they are out of bounds.",
        },
      ],
      nextSteps: [
        "Paste a short passage or outline of your own writing into the draft box and run this check again.",
      ],
    };
  }

  const response = await runWithRetry<GenerateContentResponse>(() => ai.models.generateContent({
    model: model.id || "gemini-3-flash-preview",
    contents: buildCoachingUserMessage(request),
    config: {
      systemInstruction: COACHING_SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: coachingSchema,
    },
  }));

  const result = safeJsonParse(response.text || "");
  if (!result) {
    throw new Error("The coach could not parse its response. Please try again.");
  }

  return {
    title: String(result.title || "Coaching notes"),
    framing: String(result.framing || "These notes are coaching only. You write the review."),
    questions: Array.isArray(result.questions) ? result.questions.map((item: unknown) => String(item)) : [],
    conceptNotes: Array.isArray(result.conceptNotes)
      ? result.conceptNotes.map((note: any) => ({
          term: String(note?.term || "Concept"),
          explanation: String(note?.explanation || ""),
        }))
      : [],
    nextSteps: Array.isArray(result.nextSteps) ? result.nextSteps.map((item: unknown) => String(item)) : [],
  };
}
