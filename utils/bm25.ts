
/**
 * BM25+ Implementation for Lexical Retrieval
 * BM25+ is an improvement over BM25 that prevents over-penalizing long documents.
 */

export interface BM25Options {
    k1?: number; // Controls term frequency saturation (default 1.2)
    b?: number;  // Controls document length normalization (default 0.75)
    delta?: number; // BM25+ specific parameter (default 1.0)
}

export class BM25Plus {
    private k1: number;
    private b: number;
    private delta: number;
    private docCount: number = 0;
    private avgDocLength: number = 0;
    private docLengths: number[] = [];
    private termFrequencies: Map<string, number>[] = [];
    private corpusFreq: Map<string, number> = new Map();

    constructor(options: BM25Options = {}) {
        this.k1 = options.k1 ?? 1.2;
        this.b = options.b ?? 0.75;
        this.delta = options.delta ?? 1.0;
    }

    private tokenize(text: string): string[] {
        return text.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(t => t.length > 1);
    }

    /**
     * Adds a collection of documents to the index
     */
    public addDocuments(docs: string[]): void {
        this.docCount = docs.length;
        let totalLength = 0;

        docs.forEach((doc, idx) => {
            const tokens = this.tokenize(doc);
            const length = tokens.length;
            this.docLengths[idx] = length;
            totalLength += length;

            const tf = new Map<string, number>();
            tokens.forEach(token => {
                tf.set(token, (tf.get(token) || 0) + 1);
            });
            this.termFrequencies[idx] = tf;

            // Update corpus frequency (number of documents containing the term)
            tf.forEach((_, token) => {
                this.corpusFreq.set(token, (this.corpusFreq.get(token) || 0) + 1);
            });
        });

        this.avgDocLength = totalLength / this.docCount;
    }

    /**
     * Calculates the BM25+ score for a query against all indexed documents
     */
    public search(query: string): number[] {
        const queryTokens = this.tokenize(query);
        const scores = new Array(this.docCount).fill(0);

        queryTokens.forEach(token => {
            const df = this.corpusFreq.get(token) || 0;
            if (df === 0) return;

            // Inverse Document Frequency (IDF)
            const idf = Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);

            for (let i = 0; i < this.docCount; i++) {
                const tf = this.termFrequencies[i].get(token) || 0;
                if (tf === 0) continue;

                // BM25+ formula: IDF * [ ((tf * (k1 + 1)) / (tf + k1 * (1 - b + b * (docLen / avgLen)))) + delta ]
                const numerator = tf * (this.k1 + 1);
                const denominator = tf + this.k1 * (1 - this.b + this.b * (this.docLengths[i] / this.avgDocLength));
                
                scores[i] += idf * (numerator / denominator + this.delta);
            }
        });

        return scores;
    }
}

/**
 * Convenience function to score papers using BM25+
 */
export const scorePapersLexical = (papers: { title: string, abstract: string }[], query: string): number[] => {
    if (papers.length === 0) return [];
    
    const engine = new BM25Plus();
    const docs = papers.map(p => `${p.title} ${p.abstract}`);
    engine.addDocuments(docs);
    
    const rawScores = engine.search(query);
    
    // Normalize scores to 0-1 range
    const maxScore = Math.max(...rawScores, 0.0001);
    return rawScores.map(s => s / maxScore);
};
