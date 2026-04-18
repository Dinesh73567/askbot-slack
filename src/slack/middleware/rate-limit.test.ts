import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRateLimiter } from './rate-limit.js';

describe('createRateLimiter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request', () => {
    const limiter = createRateLimiter(5);
    expect(limiter.check('U123').allowed).toBe(true);
  });

  it('allows up to perMinute requests in the same window', () => {
    const limiter = createRateLimiter(3);
    expect(limiter.check('U123').allowed).toBe(true);
    expect(limiter.check('U123').allowed).toBe(true);
    expect(limiter.check('U123').allowed).toBe(true);
  });

  it('blocks the N+1 request in the same window', () => {
    const limiter = createRateLimiter(3);
    limiter.check('U123');
    limiter.check('U123');
    limiter.check('U123');
    const result = limiter.check('U123');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThan(0);
  });

  it('returns retryAfterSec as a positive integer when blocked', () => {
    const limiter = createRateLimiter(1);
    limiter.check('U123');
    const result = limiter.check('U123');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(result.retryAfterSec)).toBe(true);
  });

  it('allows requests after the window expires', () => {
    const limiter = createRateLimiter(2);
    limiter.check('U123');
    limiter.check('U123');
    // Both slots used — now blocked
    expect(limiter.check('U123').allowed).toBe(false);

    // Advance past the 60-second window
    vi.advanceTimersByTime(60 * 1000 + 1);

    expect(limiter.check('U123').allowed).toBe(true);
  });

  it('tracks different users independently', () => {
    const limiter = createRateLimiter(1);
    limiter.check('U111');
    // U111 is now at limit, U222 should still be fine
    expect(limiter.check('U222').allowed).toBe(true);
    expect(limiter.check('U111').allowed).toBe(false);
  });

  it('returns retryAfterSec=0 when allowed', () => {
    const limiter = createRateLimiter(5);
    expect(limiter.check('U123').retryAfterSec).toBe(0);
  });
});
