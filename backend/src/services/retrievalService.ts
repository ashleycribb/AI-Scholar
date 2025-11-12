import { embedText } from "../utils/embeddings";
import { cosineSimilarity } from "../utils/math";
import { EvidenceSpan } from "../types";
import config from '../config';

/**
 * For a given DOI and claim, retrieve candidate passage(s) from the paper
 * and nearby works (arXiv, S2ORC or cached full-text).
 * This is a simplified implementation: attempt to fetch full-text from Unpaywall,
 * fallback to arXiv if DOI links to arXiv, else retrieve abstract.
 */

async function fetchFullText(url: string): Promise<string | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) return null;
    // crude: return body text; in prod, use pdf-parsing and passage segmentation.
    return await resp.text();
  } catch (e) {
    return null;
  }
}

// Split fullText into candidate passages (simple paragraph split)
function splitIntoPassages(fullText: string): string[] {
  return fullText.split(/\n{2,}/).map(s => s.trim()).filter(Boolean);
}

export async function findSupportingPassages(doi: string, claim: string): Promise<EvidenceSpan[]> {
  // 1) Try Unpaywall to get OA PDF or URL
  const upUrl = `https://api.unpaywall.org/v2/${doi}?email=${config.unpaywallEmail}`;
  try {
    const upResp = await fetch(upUrl);
    if (!upResp.ok) throw new Error("Unpaywall responded with an error");
    const upData = await upResp.json();
    
    const best = upData?.best_oa_location;
    const candidates: string[] = [];
    if (best?.url_for_pdf) candidates.push(best.url_for_pdf);
    if (best?.url) candidates.push(best.url);

    // if DOI points to arxiv
    if (doi.toLowerCase().includes('arxiv')) {
      candidates.push(`https://arxiv.org/abs/${doi.split('arxiv.org/abs/').pop()}`);
    }

    for (const c of candidates) {
      const text = await fetchFullText(c);
      if (!text) continue;
      const passages = splitIntoPassages(text);
      // embed claim once
      const claimEmb = await embedText(claim);
      if (claimEmb.length === 0) continue;

      const scored: Array<{ p: string; s: number }> = [];
      for (const p of passages) {
        const emb = await embedText(p);
        if (emb.length === 0) continue;
        const sim = cosineSimilarity(claimEmb, emb);
        if (sim > 0.6) scored.push({ p, s: sim });
      }
      scored.sort((a,b)=>b.s-a.s);
      const top = scored.slice(0,5);
      if (top.length) {
        return top.map(t => ({
          source: c,
          passage: t.p,
          score: t.s
        }));
      }
    }
  } catch (e) {
    // fallback to abstract retrieval
  }

  // fallback: fetch Crossref / OpenAlex abstract
  try {
    const oxResp = await fetch(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    if (!oxResp.ok) throw new Error("OpenAlex fetch failed");
    const oxData = await oxResp.json();

    const deinvertAbstract = (invertedAbstract: { [key: string]: number[] }): string => {
        if (!invertedAbstract) return '';
        const abstractArray: string[] = [];
        let maxIndex = -1;
        for (const word in invertedAbstract) {
            for (const pos of invertedAbstract[word]) {
                if (pos > maxIndex) maxIndex = pos;
            }
        }
        if(maxIndex > -1){
            abstractArray.length = maxIndex + 1;
            abstractArray.fill('');
        }
        for (const word in invertedAbstract) {
            for (const pos of invertedAbstract[word]) {
                abstractArray[pos] = word;
            }
        }
        return abstractArray.join(' ').trim();
    };
    
    const abstract = oxData?.abstract_inverted_index ? deinvertAbstract(oxData.abstract_inverted_index) : '';
    if (abstract) {
      // if abstract is long, split and compute sim
      const claimEmb = await embedText(claim);
      if (claimEmb.length === 0) return [];
      const emb = await embedText(abstract);
      if (emb.length === 0) return [];
      const sim = cosineSimilarity(claimEmb, emb);
      if (sim > 0.5) {
        return [{ source: `https://doi.org/${doi}`, passage: abstract, score: sim }];
      }
    }
  } catch (e) {}

  return [];
}