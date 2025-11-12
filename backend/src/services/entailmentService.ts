import { Verdict } from "../types";
import config from '../config';

/**
 * Calls an entailment/cross-encoder model to check if `passage` supports `claim`.
 * The model URL and API key should be provided via environment variables.
 */
export async function checkEntailment(claim: string, passage: string): Promise<{ verdict: Verdict; confidence: number }> {
  // If the entailment service URL is not configured, use a mock implementation for development.
  if (!config.entailmentUrl) {
    console.warn("ENTAILMENT_URL not set. Using mock entailment service.");
    const passageLower = passage.toLowerCase();
    // Use a simple check: if the first few words of the claim appear in the passage, consider it supportive.
    const claimKeywords = claim.toLowerCase().split(' ').slice(0, 5).join(' '); 
    
    if (passageLower.includes(claimKeywords)) {
        return Promise.resolve({ verdict: 'SUPPORT', confidence: 0.85 + Math.random() * 0.1 });
    }
    return Promise.resolve({ verdict: 'NEI', confidence: 0.6 + Math.random() * 0.1 });
  }

  // Production implementation: call the actual model endpoint.
  const response = await fetch(config.entailmentUrl, {
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${config.modelApiKey}`,
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
  // Adapt depending on your model's specific response format
  return {
    verdict: r.label as Verdict,
    confidence: parseFloat(r.confidence?.toString() || '0')
  };
}