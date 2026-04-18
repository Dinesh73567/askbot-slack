/**
 * In-memory event deduplication store.
 * Tracks event keys with timestamps and expiry to prevent double-processing
 * when Slack retries event delivery.
 */
export interface EventDedupe {
  /** Returns true if the key was already seen (duplicate). Marks it as seen otherwise. */
  readonly seen: (key: string) => boolean;
}

/**
 * Create an event deduplication store backed by a Map with TTL-based cleanup.
 * Cleanup runs inline on each `seen()` call — no background interval needed.
 */
export function createEventDedupe(ttlMs: number = 5 * 60 * 1000): EventDedupe {
  const store = new Map<string, number>();

  function evict(): void {
    const cutoff = Date.now() - ttlMs;
    for (const [key, ts] of store) {
      if (ts < cutoff) {
        store.delete(key);
      }
    }
  }

  return {
    seen(key: string): boolean {
      evict();
      if (store.has(key)) {
        return true;
      }
      store.set(key, Date.now());
      return false;
    },
  };
}
