
import { embedText } from "../utils/embeddings";
import { cosineSimilarity } from "../utils/math";
import { EvidenceSpan } from "../types";
import { searchOpenAlexByDoi } from "./openalexService";

export async function findSupportingPassages(doi: string | undefined, claim: string, providedAbstract?: string): Promise<EvidenceSpan[]> {
  // Client-side optimization: If we already have the abstract from the "local environment", use it.
  // This skips a slow API call to OpenAlex.
  let abstract = providedAbstract;

  if (!abstract && doi) {
      console.log("Abstract not provided locally, fetching from OpenAlex (cached)...");
      try {
        const paper = await searchOpenAlexByDoi(doi);
        if (paper && paper.abstract) {
            abstract = paper.abstract;
        }
      } catch (e) {
        console.error("OpenAlex abstract retrieval failed during verification:", e);
        // Don't throw here, just proceed. If abstract is still missing, we return empty evidence.
      }
  }

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
            const source = doi ? `https://doi.org/${doi}` : 'Local Abstract';
            return [{ source, passage: abstract, score: similarity }];
        }
  }

  return [];
}
