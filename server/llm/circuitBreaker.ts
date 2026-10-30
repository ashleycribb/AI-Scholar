/**
 * Minimal circuit breaker (closed -> open -> half-open -> closed).
 *  - closed: calls flow; `failureThreshold` consecutive health failures open it.
 *  - open: calls are refused until `openMs` has passed.
 *  - half-open: exactly one probe call is allowed; success closes, a health failure re-opens.
 */
export type BreakerState = "closed" | "open" | "half-open";

export interface BreakerOptions {
  failureThreshold?: number;
  openMs?: number;
  now?: () => number;
}

export class CircuitBreaker {
  private state: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private probing = false;
  private readonly threshold: number;
  private readonly openMs: number;
  private readonly now: () => number;

  constructor(opts: BreakerOptions = {}) {
    this.threshold = Math.max(1, opts.failureThreshold ?? 5);
    this.openMs = Math.max(1, opts.openMs ?? 30_000);
    this.now = opts.now ?? Date.now;
  }

  /** Current state (an expired open window reads as half-open). */
  getState(): BreakerState {
    if (this.state === "open" && this.now() - this.openedAt >= this.openMs) return "half-open";
    return this.state;
  }

  /** ms until a probe is allowed (0 unless open). */
  retryAfterMs(): number {
    return this.getState() === "open" ? Math.max(0, this.openMs - (this.now() - this.openedAt)) : 0;
  }

  /** Ask permission for a call. Returns false when the call must not be attempted. */
  tryAcquire(): boolean {
    const s = this.getState();
    if (s === "closed") return true;
    if (s === "open") return false;
    // half-open: one probe at a time
    this.state = "half-open";
    if (this.probing) return false;
    this.probing = true;
    return true;
  }

  /** The call succeeded. */
  onSuccess(): void {
    this.failures = 0;
    this.probing = false;
    this.state = "closed";
  }

  /** The provider answered but not with a health failure (bad input, quota, auth). Neither opens nor resets in closed state. */
  onNeutral(): void {
    if (this.state === "half-open") this.onSuccess();
  }

  /** The call was a health failure (5xx, network, timeout). */
  onFailure(): void {
    if (this.state === "half-open") {
      this.probing = false;
      this.trip();
      return;
    }
    this.failures += 1;
    if (this.failures >= this.threshold) this.trip();
  }

  private trip() {
    this.state = "open";
    this.openedAt = this.now();
    this.failures = 0;
  }
}
