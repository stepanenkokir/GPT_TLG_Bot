import { describe, it, expect, vi, beforeEach } from "vitest";
import { BotRateLimiter } from "../middleware/rateLimiter.js";

describe("BotRateLimiter", () => {
  let limiter;

  beforeEach(() => {
    limiter = new BotRateLimiter(3, 60000); // 3 requests per minute
  });

  it("allows first request", () => {
    expect(limiter.isRateLimited(1)).toBe(false);
  });

  it("allows requests up to the max", () => {
    limiter.isRateLimited(1); // 1st
    limiter.isRateLimited(1); // 2nd
    expect(limiter.isRateLimited(1)).toBe(false); // 3rd — still ok
  });

  it("blocks request exceeding max", () => {
    limiter.isRateLimited(1); // 1st
    limiter.isRateLimited(1); // 2nd
    limiter.isRateLimited(1); // 3rd
    expect(limiter.isRateLimited(1)).toBe(true); // 4th — blocked
  });

  it("tracks users independently", () => {
    limiter.isRateLimited(1);
    limiter.isRateLimited(1);
    limiter.isRateLimited(1);
    expect(limiter.isRateLimited(1)).toBe(true);  // user 1 blocked
    expect(limiter.isRateLimited(2)).toBe(false); // user 2 unaffected
  });

  it("resets window after windowMs passes", () => {
    vi.useFakeTimers();
    limiter.isRateLimited(1);
    limiter.isRateLimited(1);
    limiter.isRateLimited(1);
    expect(limiter.isRateLimited(1)).toBe(true);

    vi.advanceTimersByTime(60001); // advance past the window
    expect(limiter.isRateLimited(1)).toBe(false);
    vi.useRealTimers();
  });

  it("returns correct remaining count before limit", () => {
    expect(limiter.getRemaining(99)).toBe(3); // new user
    limiter.isRateLimited(99);
    expect(limiter.getRemaining(99)).toBe(2);
    limiter.isRateLimited(99);
    expect(limiter.getRemaining(99)).toBe(1);
  });

  it("returns 0 remaining when at limit", () => {
    limiter.isRateLimited(5);
    limiter.isRateLimited(5);
    limiter.isRateLimited(5);
    expect(limiter.getRemaining(5)).toBe(0);
  });

  it("cleanup removes expired entries", () => {
    vi.useFakeTimers();
    limiter.isRateLimited(10);
    expect(limiter.requests.has(10)).toBe(true);

    vi.advanceTimersByTime(60001);
    limiter.cleanup();
    expect(limiter.requests.has(10)).toBe(false);
    vi.useRealTimers();
  });

  it("cleanup keeps non-expired entries", () => {
    vi.useFakeTimers();
    limiter.isRateLimited(20);
    limiter.cleanup(); // not expired yet
    expect(limiter.requests.has(20)).toBe(true);
    vi.useRealTimers();
  });
});
