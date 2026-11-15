
export type EntailmentVerdict = 'SUPPORT' | 'NEI' | 'UNAVAILABLE';

export type EntailmentResult = {
    verdict: EntailmentVerdict;
    confidence: number | null;
    source: 'unavailable';
};

/**
 * No entailment / cross-encoder model is integrated. This does not invent a
 * keyword-match confidence or delay; callers must treat the result as unknown
 * and must not let it raise or lower a verification score.
 */
export async function checkEntailment(_claim: string, _passage: string): Promise<EntailmentResult> {
    return { verdict: 'UNAVAILABLE', confidence: null, source: 'unavailable' };
}
