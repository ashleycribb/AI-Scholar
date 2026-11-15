/** Deterministic bag-of-words embedder for tests (no model, no network): shared words -> higher cosine. */
const DIM = 256;
const h = (w: string) => { let x = 2166136261; for (let i = 0; i < w.length; i++) x = Math.imul(x ^ w.charCodeAt(i), 16777619); return (x >>> 0) % DIM; };
export function hashEmbed(text: string): number[] {
  const v = new Array(DIM).fill(0);
  for (const w of text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(t => t.length > 2)) v[h(w)] += 1;
  const n = Math.hypot(...v) || 1;
  return v.map(x => x / n);
}
