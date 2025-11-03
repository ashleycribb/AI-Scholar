
import { Verdict } from "../types";

/**
 * Calls an entailment/cross-encoder model to check if `passage` supports `claim`.
 * Replace MODEL_URL with your deployed model endpoint (Vertex AI or HF).
 *
 * The model should return:
 *  - label: 'SUPPORT' | 'REFUTE' | 'NEI'
 *  - confidence: 0-1
 */
export async function checkEntailment(claim: string, passage: string): Promise<{ verdict: Verdict; confidence: number }> {
  const response = await fetch(process.env.ENTAILMENT_URL!, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${process.env.MODEL_API_KEY}`,
        'Content-Type': 'application/json',
    },
    body: JSON.stringify({
        inputs: { claim, passage }
    })
  });

  if (!response.ok) {
    throw new Error(`Entailment service request failed with status ${response.status}`);
  }

  const r = await response.json();
  // adapt depending on your model response format
  return {
    verdict: r.label as Verdict,
    confidence: parseFloat(r.confidence?.toString() || '0')
  };
}
