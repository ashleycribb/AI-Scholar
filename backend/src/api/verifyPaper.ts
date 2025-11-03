
import express, { Request, Response } from 'express';
import cors from 'cors';
import { fetchMetadataByDOI } from '../services/metadataService';
import { findSupportingPassages } from '../services/retrievalService';
import { checkEntailment } from '../services/entailmentService';
import { analyzeCitations } from '../services/citationService';
import { computeVACS } from '../services/scoringService';
import { MIN_EVIDENCE_SPANS_FOR_VERIFIED, MIN_SUPPORT_EVIDENCE_CONFIDENCE } from '../utils/constants';
import { VerificationResult } from '../types';


const app = express();
app.use(cors()); 
// FIX: Replace deprecated body-parser with express.json()
app.use(express.json());

// FIX: Add explicit Request and Response types from the express namespace to avoid global type conflicts.
app.post('/api/verifyPaper', async (req: Request, res: Response) => {
  const { doi, claimText } = req.body;
  if (!doi) return res.status(400).json({ error: 'doi is required' });

  try {
    const meta = await fetchMetadataByDOI(doi);
    const claim = claimText.trim() || meta.title || 'Main claim of the paper';
    
    const candidatePassages = await findSupportingPassages(doi, claim);
    
    const evidenceResults = [];
    if (candidatePassages.length > 0) {
        const entailmentPromises = candidatePassages.map(p => 
            checkEntailment(claim, p.passage).then(ent => ({...p, ...ent}))
        );
        const allEntailments = await Promise.all(entailmentPromises);
        
        for (const p of allEntailments) {
            if (p.verdict === 'SUPPORT' && p.confidence >= MIN_SUPPORT_EVIDENCE_CONFIDENCE) {
                evidenceResults.push({
                    source: p.source,
                    passage: p.passage,
                    score: p.confidence
                });
            }
        }
    }

    const citationStats = await analyzeCitations(doi);
    
    const result: VerificationResult = computeVACS(meta, citationStats, evidenceResults);

    if (result.verdict === 'Verified' && result.evidence.length < MIN_EVIDENCE_SPANS_FOR_VERIFIED) {
      result.verdict = 'Inconclusive';
      result.rationale.push('Verdict changed to Inconclusive: Not enough supporting evidence found.');
    }

    return res.json(result);
  } catch (e: any) {
    console.error('verifyPaper error', e);
    return res.status(500).json({ error: e.message || 'Unknown error' });
  }
});

export default app;
