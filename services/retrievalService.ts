import { embedText } from "../utils/embeddings";
import { cosineSimilarity } from "../utils/math";
import { EvidenceSpan } from "../types";
import { deinvertAbstract } from "./utils"; // Helper from OpenAlex parsing

export async function findSupportingPassages(doi: string, claim: string): Promise<EvidenceSpan[]> {
  // Client-side PDF fetching and parsing is highly complex and often blocked by CORS.
  // As a robust client-side strategy, we will rely on fetching the abstract from OpenAlex,
  // which is a reliable and available source of text for verification.
  console.warn("Client-side retrieval is using the paper's abstract as the source text for verification.");
  
  try {
    const oxResp = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    if (oxResp.ok) {
        const oxData = await oxResp.json();
        
        const abstract = deinvertAbstract(oxData?.abstract_inverted_index);

        if (abstract) {
            // In this simplified version, the whole abstract is treated as a single "passage".
            // A more advanced version could split the abstract into sentences.
            const claimEmb = await embedText(claim);
            if (claimEmb.length === 0) return [];
            
            const passageEmb = await embedText(abstract);
            if (passageEmb.length === 0) return [];

            const similarity = cosineSimilarity(claimEmb, passageEmb);
            
            // Only return the passage if it has a reasonable semantic similarity to the claim.
            if (similarity > 0.5) {
                return [{ source: `https://doi.org/${doi}`, passage: abstract, score: similarity }];
            }
        }
    }
  } catch (e) {
    console.error("OpenAlex abstract retrieval failed during verification:", e);
    throw new Error("Could not retrieve the paper's abstract for claim verification.");
  }

  return [];
}
