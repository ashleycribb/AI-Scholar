// agent-backend/src/services/retrievalService.ts (Copy of backend/src/services/retrievalService.ts)
import { embedText } from "../utils/embeddings.js";
import { cosineSimilarity } from "../utils/math.js";
import { EvidenceSpan } from "../types/index.js";
import { deinvertAbstract } from "./utils.js";

async function fetchFullText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    return await resp.text();
  } catch (e) {
    return null;
  }
}

function splitIntoPassages(fullText: string): string[] {
  return fullText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

export async function findSupportingPassages(doi: string, claim: string): Promise<EvidenceSpan[]> {
  const email = 'contact@ai-research-explorer.com';
  const upUrl = `https://api.unpaywall.org/v2/${doi}?email=${email}`;
  try {
    const upResp = await fetch(upUrl);
    if (upResp.ok) {
        const upData = await upResp.json();
        const pdfUrl = upData?.best_oa_location?.url_for_pdf;

        if (pdfUrl) {
            const text = await fetchFullText(pdfUrl);
            if (text) {
                const passages = splitIntoPassages(text);
                const claimEmb = await embedText(claim);
                if (claimEmb.length === 0) return [];

                const scoredPassages = await Promise.all(passages.map(async p => {
                    const emb = await embedText(p);
                    if (emb.length === 0) return { p, s: 0 };
                    const sim = cosineSimilarity(claimEmb, emb);
                    return { p, s: sim };
                }));
                
                const top = scoredPassages.filter(p => p.s > 0.6).sort((a,b)=>b.s-a.s).slice(0,5);
                if (top.length) {
                    return top.map(t => ({ source: pdfUrl, passage: t.p, score: t.s }));
                }
            }
        }
    }
  } catch (e) {
      console.warn("Unpaywall retrieval failed, falling back to abstract.", e);
  }

  try {
    const oxResp = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    if (oxResp.ok) {
        const oxData = await oxResp.json();
        const abstract = deinvertAbstract(oxData?.abstract_inverted_index);
        if (abstract) {
            return [{ source: `https://doi.org/${doi}`, passage: abstract, score: 0.9 }];
        }
    }
  } catch (e) {
    console.warn("OpenAlex abstract retrieval failed.", e);
  }

  return [];
}