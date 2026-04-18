import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEventDedupe } from './event-dedupe.js';

describe('createEventDedupe', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns false on first call for a key (not a duplicate)', () => {
    const dedupe = createEventDedupe();
    expect(dedupe.seen('event-1')).toBe(false);
  });

  it('returns true on second call for same key (duplicate)', () => {
    const dedupe = createEventDedupe();
    dedupe.seen('event-1');
    expect(dedupe.seen('event-1')).toBe(true);
  });

  it('returns false for different keys', () => {
    const dedupe = createEventDedupe();
    dedupe.seen('event-1');
    expect(dedupe.seen('event-2')).toBe(false);
  });

  it('entries expire after ttl and are no longer duplicates', () => {
    const ttlMs = 5 * 60 * 1000;
    const dedupe = createEventDedupe(ttlMs);
    dedupe.seen('event-1');

    // Advance time past TTL
    vi.advanceTimersByTime(ttlMs + 1000);

    // The key should now be evicted — returns false (not a duplicate)
    expect(dedupe.seen('event-1')).toBe(false);
  });

  it('does not expire entries before ttl', () => {
    const ttlMs = 5 * 60 * 1000;
    const dedupe = createEventDedupe(ttlMs);
    dedupe.seen('event-1');

    vi.advanceTimersByTime(ttlMs - 1000);

    expect(dedupe.seen('event-1')).toBe(true);
  });

  it('handles many different keys independently', () => {
    const dedupe = createEventDedupe();
    for (let i = 0; i < 100; i++) {
      expect(dedupe.seen(`event-${i}`)).toBe(false);
    }
    for (let i = 0; i < 100; i++) {
      expect(dedupe.seen(`event-${i}`)).toBe(true);
    }
  });
});
