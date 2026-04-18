import type { TimeWindow } from '../types/index.js';

/**
 * All timestamps use UTC for consistency.
 * "Today" means midnight UTC of the current UTC day to now.
 * "Yesterday" means the previous full UTC day.
 * "This week" means the last 7 full days.
 */

/** Returns the Unix timestamp (seconds) for the start of today in UTC */
function startOfTodayUtc(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  return Math.floor(midnight.getTime() / 1000);
}

/** Returns the current Unix timestamp in seconds */
function nowUtc(): number {
  return Math.floor(Date.now() / 1000);
}

/** Returns seconds per day */
const SECONDS_PER_DAY = 86400;

/**
 * Parse natural language time expressions into a { oldest, latest } window.
 * Returns undefined if no recognized time expression is found.
 */
export function parseTimeWindow(text: string): TimeWindow | undefined {
  const lower = text.toLowerCase();
  const now = nowUtc();
  const todayStart = startOfTodayUtc();

  if (/\btoday\b/.test(lower)) {
    return { oldest: todayStart, latest: now };
  }

  if (/\byesterday\b/.test(lower)) {
    return {
      oldest: todayStart - SECONDS_PER_DAY,
      latest: todayStart,
    };
  }

  if (/\bthis week\b/.test(lower)) {
    return {
      oldest: now - 7 * SECONDS_PER_DAY,
      latest: now,
    };
  }

  if (/\blast week\b/.test(lower)) {
    return {
      oldest: now - 14 * SECONDS_PER_DAY,
      latest: now - 7 * SECONDS_PER_DAY,
    };
  }

  // Match "last N days"
  const lastNDays = /\blast\s+(\d+)\s+days?\b/.exec(lower);
  if (lastNDays) {
    const n = parseInt(lastNDays[1]!, 10);
    return {
      oldest: now - n * SECONDS_PER_DAY,
      latest: now,
    };
  }

  // Match "past N days"
  const pastNDays = /\bpast\s+(\d+)\s+days?\b/.exec(lower);
  if (pastNDays) {
    const n = parseInt(pastNDays[1]!, 10);
    return {
      oldest: now - n * SECONDS_PER_DAY,
      latest: now,
    };
  }

  return undefined;
}

/** Format a Unix timestamp (seconds) into Slack's `before:` / `after:` date format: YYYY-MM-DD */
export function toSlackDateParam(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
