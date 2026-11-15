export const NOT_AVAILABLE = 'Not available';

export function isKnownScore(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Percent label for a 0–1 score; unknown values are 'Not available', never a default ratio. */
export function formatPercentScore(score: number | null | undefined): string {
  if (!isKnownScore(score)) return NOT_AVAILABLE;
  return `${Math.round(score * 100)}%`;
}

export function formatVacs(vacs: number | null | undefined): string {
  if (!isKnownScore(vacs)) return NOT_AVAILABLE;
  return String(vacs);
}
