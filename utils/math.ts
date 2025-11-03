export function cosineSimilarity(a: number[], b: number[]): number {
  const dot = a.reduce((s, v, i) => s + v * (b[i] ?? 0), 0);
  const normA = Math.sqrt(a.reduce((s,v)=> s + v*v, 0));
  const normB = Math.sqrt(b.reduce((s,v)=> s + v*v, 0));
  return normA === 0 || normB === 0 ? 0 : dot / (normA * normB);
}
