import { test, expect } from "bun:test";
import { calculateCentrality } from "../../services/apiService";
import { cosineSimilarity } from "../../utils/math";

// Mock data generation
function generateEmbeddings(n: number, dim: number): number[][] {
  const embeddings: number[][] = [];
  for (let i = 0; i < n; i++) {
    const vec: number[] = [];
    for (let j = 0; j < dim; j++) {
      vec.push(Math.random());
    }
    embeddings.push(vec);
  }
  return embeddings;
}

// Old Implementation (copied from services/apiService.ts before optimization)
function calculateCentralityOld(papersWithAbstracts: { id: string }[], embeddingMap: Map<string, number[]>): Map<string, number> {
    const centralityScores = new Map<string, number>();
    papersWithAbstracts.forEach(paperA => {
        const embeddingA = embeddingMap.get(paperA.id);
        if (!embeddingA || embeddingA.length === 0) {
            centralityScores.set(paperA.id, 0); return;
        }
        let totalSimilarity = 0;
        let count = 0;
        papersWithAbstracts.forEach(paperB => {
            if (paperA.id === paperB.id) return;
            const embeddingB = embeddingMap.get(paperB.id);
            if (embeddingB && embeddingB.length > 0) {
                totalSimilarity += cosineSimilarity(embeddingA, embeddingB);
                count++;
            }
        });
        const avgSimilarity = count > 0 ? totalSimilarity / count : 0;
        centralityScores.set(paperA.id, ((avgSimilarity + 1) / 2) * 100); // Normalize to 0-100
    });
    return centralityScores;
}

test("Centrality Calculation Benchmark", () => {
    const N = 200; // Number of papers
    const DIM = 768; // Embedding dimension
    const embeddings = generateEmbeddings(N, DIM);
    const papersWithAbstracts = embeddings.map((_, i) => ({ id: `paper-${i}` }));
    const embeddingMap = new Map<string, number[]>();
    embeddings.forEach((vec, i) => embeddingMap.set(`paper-${i}`, vec));

    console.log(`Benchmarking with N=${N}, DIM=${DIM}`);

    const startOld = performance.now();
    const resultOld = calculateCentralityOld(papersWithAbstracts, embeddingMap);
    const endOld = performance.now();
    console.log(`Old Implementation Time: ${(endOld - startOld).toFixed(2)}ms`);

    const startNew = performance.now();
    // New implementation expects array of embeddings
    // We need to ensure we pass the embeddings in the same order as papersWithAbstracts
    const embeddingsArray = papersWithAbstracts.map(p => embeddingMap.get(p.id)!);
    const scoresArray = calculateCentrality(embeddingsArray);

    // Convert array back to map for comparison
    const resultNew = new Map<string, number>();
    papersWithAbstracts.forEach((p, i) => {
        resultNew.set(p.id, scoresArray[i]);
    });
    const endNew = performance.now();
    console.log(`New Implementation Time: ${(endNew - startNew).toFixed(2)}ms`);

    // Verify correctness
    let maxDiff = 0;
    papersWithAbstracts.forEach(p => {
        const valOld = resultOld.get(p.id) || 0;
        const valNew = resultNew.get(p.id) || 0;
        const diff = Math.abs(valOld - valNew);
        if (diff > maxDiff) maxDiff = diff;
        expect(diff).toBeLessThan(1e-9);
    });
    console.log(`Max difference: ${maxDiff}`);
});
