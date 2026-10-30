/** Small in-memory fixed-window limiter. Single-process only (documented in the PR). */
export class FixedWindowLimiter {
  private hits = new Map<string, { n: number; reset: number }>();
  constructor(private maxKeys = 20_000) {}

  /** Records a hit; returns true when the caller is within the limit. */
  allow(key: string, limit: number, windowMs: number, now: number): boolean {
    const cur = this.hits.get(key);
    if (!cur || now >= cur.reset) {
      if (this.hits.size >= this.maxKeys) this.sweep(now);
      if (this.hits.size >= this.maxKeys) {
        // Still full of live entries: fail closed rather than grow without bound.
        return false;
      }
      this.hits.set(key, { n: 1, reset: now + windowMs });
      return true;
    }
    cur.n += 1;
    return cur.n <= limit;
  }

  retryAfterSeconds(key: string, now: number): number {
    const cur = this.hits.get(key);
    return cur ? Math.max(1, Math.ceil((cur.reset - now) / 1000)) : 1;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (now >= v.reset) this.hits.delete(k);
  }
}
