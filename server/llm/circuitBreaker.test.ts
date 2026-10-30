import { test, expect } from "bun:test";
import { CircuitBreaker } from "./circuitBreaker";

const mk = () => {
  let t = 1000;
  const b = new CircuitBreaker({ failureThreshold: 3, openMs: 10_000, now: () => t });
  return { b, tick: (ms: number) => { t += ms; } };
};

test("opens after N consecutive failures; a success in between resets the count", () => {
  const { b } = mk();
  b.onFailure(); b.onFailure(); b.onSuccess(); b.onFailure(); b.onFailure();
  expect(b.getState()).toBe("closed");
  b.onFailure();
  expect(b.getState()).toBe("open");
  expect(b.tryAcquire()).toBe(false);
  expect(b.retryAfterMs()).toBe(10_000);
});

test("open -> half-open after openMs; only one probe at a time; probe success closes", () => {
  const { b, tick } = mk();
  for (let i = 0; i < 3; i++) b.onFailure();
  tick(9_999); expect(b.tryAcquire()).toBe(false);
  tick(1); expect(b.getState()).toBe("half-open");
  expect(b.tryAcquire()).toBe(true);   // the probe
  expect(b.tryAcquire()).toBe(false);  // a second call while probing is refused
  b.onSuccess();
  expect(b.getState()).toBe("closed");
  expect(b.tryAcquire()).toBe(true);
});

test("half-open probe failure re-opens for a full window", () => {
  const { b, tick } = mk();
  for (let i = 0; i < 3; i++) b.onFailure();
  tick(10_000);
  expect(b.tryAcquire()).toBe(true);
  b.onFailure();
  expect(b.getState()).toBe("open");
  expect(b.retryAfterMs()).toBe(10_000);
});

test("neutral outcome (provider answered, e.g. bad input) closes a half-open probe but does not count in closed state", () => {
  const { b, tick } = mk();
  b.onFailure(); b.onFailure(); b.onNeutral(); b.onFailure();
  expect(b.getState()).toBe("open"); // neutral did not reset the failure count
  tick(10_000);
  expect(b.tryAcquire()).toBe(true);
  b.onNeutral();
  expect(b.getState()).toBe("closed");
});
