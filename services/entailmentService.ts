import { Verdict } from "../types";

/**
 * Mocks an entailment/cross-encoder model to check if `passage` supports `claim`.
 * This client-side mock provides a reasonable approximation for development purposes.
 */
export async function checkEntailment(claim: string, passage: string): Promise<{ verdict: Verdict; confidence: number }> {
    // In a real application, this would call a deployed model endpoint.
    // For this client-side version, we use a simple heuristic as a mock.
    console.warn("Using mock entailment service.");

    return new Promise(resolve => {
        setTimeout(() => { // Simulate network delay
            const passageLower = passage.toLowerCase();
            // Use a simple keyword-based check: if a few keywords from the claim appear in the passage, consider it supportive.
            const claimKeywords = claim.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').filter(w => w.length > 3);
            const passageWords = new Set(passageLower.replace(/[^a-z0-9\s]/g, '').split(' '));
            
            const matchCount = claimKeywords.filter(kw => passageWords.has(kw)).length;
            const matchRatio = claimKeywords.length > 0 ? matchCount / claimKeywords.length : 0;

            if (matchRatio > 0.5) { // If more than 50% of keywords match
                resolve({ verdict: 'SUPPORT', confidence: 0.85 + (matchRatio - 0.5) * 0.2 }); // Scale confidence
            } else {
                resolve({ verdict: 'NEI', confidence: 0.6 + matchRatio * 0.2 });
            }
        }, 200 + Math.random() * 300);
    });
}
