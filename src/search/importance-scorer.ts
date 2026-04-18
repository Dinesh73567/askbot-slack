import type { SearchResult } from '../types/index.js';

/**
 * Importance score weights.
 * Reactions signal community-level recognition; replies signal active discussion.
 */
const REACTION_WEIGHT = 2;
const REPLY_WEIGHT = 1;

/**
 * Compute an importance score for a single message.
 * Higher score = more relevant/important.
 */
export function scoreMessage(result: SearchResult): number {
  return result.reactionCount * REACTION_WEIGHT + result.replyCount * REPLY_WEIGHT;
}

/**
 * Sort search results by importance score (descending) and return the top N.
 * When scores are equal, recency wins (Slack already returns by timestamp desc).
 */
export function rankByImportance(
  results: readonly SearchResult[],
  topN: number = 15,
): readonly SearchResult[] {
  return [...results]
    .sort((a, b) => scoreMessage(b) - scoreMessage(a))
    .slice(0, topN);
}

/**
 * Deduplicate results by messageId (timestamp).
 * Keeps the first occurrence (Slack occasionally returns duplicates across pages).
 */
export function deduplicateResults(
  results: readonly SearchResult[],
): readonly SearchResult[] {
  const seen = new Set<string>();
  return results.filter((r) => {
    if (seen.has(r.messageId)) return false;
    seen.add(r.messageId);
    return true;
  });
}

/**
 * Full pipeline: deduplicate → rank by importance → cap at topN.
 */
export function processResults(
  results: readonly SearchResult[],
  topN: number = 15,
): readonly SearchResult[] {
  return rankByImportance(deduplicateResults(results), topN);
}
