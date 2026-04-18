/**
 * Per-user fixed-window rate limiter.
 * Each window is 60 seconds. The counter resets when the window rolls over.
 * This is simpler than a sliding window and sufficient for preventing abuse.
 */
export interface RateLimitResult {
  readonly allowed: boolean;
  readonly retryAfterSec: number;
}

export interface RateLimiter {
  readonly check: (userId: string) => RateLimitResult;
}

interface WindowEntry {
  count: number;
  resetAt: number; // Unix timestamp ms when this window expires
}

const WINDOW_MS = 60 * 1000;

/**
 * Create a per-user rate limiter.
 * @param perMinute Maximum requests allowed per user per 60-second window.
 */
export function createRateLimiter(perMinute: number): RateLimiter {
  const windows = new Map<string, WindowEntry>();

  return {
    check(userId: string): RateLimitResult {
      const now = Date.now();
      const entry = windows.get(userId);

      if (!entry || now >= entry.resetAt) {
        // New window
        windows.set(userId, { count: 1, resetAt: now + WINDOW_MS });
        return { allowed: true, retryAfterSec: 0 };
      }

      if (entry.count >= perMinute) {
        const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
        return { allowed: false, retryAfterSec };
      }

      entry.count += 1;
      return { allowed: true, retryAfterSec: 0 };
    },
  };
}
