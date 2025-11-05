// agent-backend/src/utils/constants.ts (Copy of frontend utils/constants.ts)

export const WEIGHTS = {
  credibility: 0.25,
  evidence: 0.30,
  reproducibility: 0.20,
  citations: 0.15,
  temporal: 0.10
};

export const MIN_SUPPORT_EVIDENCE_CONFIDENCE = 0.75; // require entailment >= this
export const MIN_EVIDENCE_SPANS_FOR_VERIFIED = 1;