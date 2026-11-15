/** Prints on-topic vs off-topic cosine similarity for the local model on tests/fixtures/papers50.json. */
import papers from "../tests/fixtures/papers50.json";
import { createLocalEmbedder } from "../server/embed/embedders";
import { paperEmbeddingText } from "../services/embeddingService";
import { cosineSimilarity } from "../utils/math";
const e = createLocalEmbedder();
const docs = await e.embed((papers as any[]).map(p => paperEmbeddingText(p as any)), "document");
const topics = [...new Set((papers as any[]).map(p => p.topic))];
const on: number[] = [], off: number[] = [];
for (const t of topics) {
  const [q] = await e.embed([t], "query");
  (papers as any[]).forEach((p, i) => (p.topic === t ? on : off).push(cosineSimilarity(q, docs[i])));
}
const pct = (a: number[], q: number) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))].toFixed(3); };
console.log(e.model, { on: { min: pct(on, 0), p10: pct(on, 0.1), p50: pct(on, 0.5), p90: pct(on, 0.9), max: pct(on, 1) }, off: { p50: pct(off, 0.5), p90: pct(off, 0.9), p99: pct(off, 0.99), max: pct(off, 1) } });
