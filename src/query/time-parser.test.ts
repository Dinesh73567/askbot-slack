import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseTimeWindow, toSlackDateParam } from './time-parser.js';

// Fix time to 2024-03-15T12:00:00Z for deterministic tests
const FIXED_NOW = new Date('2024-03-15T12:00:00Z').getTime();
const FIXED_NOW_SECONDS = Math.floor(FIXED_NOW / 1000);
const SECONDS_PER_DAY = 86400;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('parseTimeWindow', () => {
  it('returns today window from midnight UTC to now', () => {
    const result = parseTimeWindow('what did I do today?');
    expect(result).toBeDefined();
    // Start of 2024-03-15 UTC in seconds
    const expectedStart = Math.floor(new Date('2024-03-15T00:00:00Z').getTime() / 1000);
    expect(result!.oldest).toBe(expectedStart);
    expect(result!.latest).toBe(FIXED_NOW_SECONDS);
  });

  it('returns yesterday window', () => {
    const result = parseTimeWindow('what happened yesterday?');
    expect(result).toBeDefined();
    const todayStart = Math.floor(new Date('2024-03-15T00:00:00Z').getTime() / 1000);
    expect(result!.oldest).toBe(todayStart - SECONDS_PER_DAY);
    expect(result!.latest).toBe(todayStart);
  });

  it('returns this week window (last 7 days)', () => {
    const result = parseTimeWindow('what happened this week?');
    expect(result).toBeDefined();
    expect(result!.oldest).toBe(FIXED_NOW_SECONDS - 7 * SECONDS_PER_DAY);
    expect(result!.latest).toBe(FIXED_NOW_SECONDS);
  });

  it('returns last week window', () => {
    const result = parseTimeWindow('what happened last week?');
    expect(result).toBeDefined();
    expect(result!.oldest).toBe(FIXED_NOW_SECONDS - 14 * SECONDS_PER_DAY);
    expect(result!.latest).toBe(FIXED_NOW_SECONDS - 7 * SECONDS_PER_DAY);
  });

  it('parses "last N days"', () => {
    const result = parseTimeWindow('last 3 days');
    expect(result).toBeDefined();
    expect(result!.oldest).toBe(FIXED_NOW_SECONDS - 3 * SECONDS_PER_DAY);
  });

  it('parses "past N days"', () => {
    const result = parseTimeWindow('past 5 days');
    expect(result).toBeDefined();
    expect(result!.oldest).toBe(FIXED_NOW_SECONDS - 5 * SECONDS_PER_DAY);
  });

  it('returns undefined for unrecognized time expression', () => {
    const result = parseTimeWindow('what is the deployment status?');
    expect(result).toBeUndefined();
  });

  it('handles case insensitivity', () => {
    const result = parseTimeWindow('What Did I Do TODAY?');
    expect(result).toBeDefined();
  });
});

describe('toSlackDateParam', () => {
  it('formats a unix timestamp to YYYY-MM-DD', () => {
    const ts = Math.floor(new Date('2024-03-15T00:00:00Z').getTime() / 1000);
    expect(toSlackDateParam(ts)).toBe('2024-03-15');
  });

  it('zero-pads month and day', () => {
    const ts = Math.floor(new Date('2024-01-05T00:00:00Z').getTime() / 1000);
    expect(toSlackDateParam(ts)).toBe('2024-01-05');
  });
});
