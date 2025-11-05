// agent-backend/src/services/entailmentService.ts (Copy of backend/src/services/entailmentService.ts)
import { Verdict } from "../types";

export async function checkEntailment(claim: string, passage: string): Promise<{ verdict: Verdict; confidence: number }> {
  if (!process.env.ENTAILMENT_URL) {
    console.warn("ENTAILMENT_URL not set. Using mock entailment service.");
    const passageLower = passage.toLowerCase();
    const claimKeywords = claim.toLowerCase().split(' ').slice(0, 5).join(' '); 
    
    if (passageLower.includes(claimKeywords)) {
        return Promise.resolve({ verdict: 'SUPPORT', confidence: 0.85 + Math.random() * 0.1 });
    }
    return Promise.resolve({ verdict: 'NEI', confidence: 0.6 + Math.random() * 0.1 });
  }

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
  return {
    verdict: r.label as Verdict,
    confidence: parseFloat(r.confidence?.toString() || '0')
  };
}