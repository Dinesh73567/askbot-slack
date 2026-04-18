import type { RankedResult, SlackMessage, GroupedResults } from '../types/index.js';
import { scoreMessage } from './keyword-matcher.js';

const MAX_RESULTS = 15;

export function rankResults(
  messages: readonly SlackMessage[],
  keywords: readonly string[],
): readonly RankedResult[] {
  const scored = messages
    .map((msg) => ({
      ...msg,
      relevanceScore: scoreMessage(msg, keywords),
      rank: 0,
    }))
    .filter((msg) => msg.relevanceScore > 0);

  const seen = new Set<string>();
  const deduped = scored.filter((msg) => {
    if (seen.has(msg.timestamp)) return false;
    seen.add(msg.timestamp);
    return true;
  });

  const sorted = [...deduped].sort((a, b) => b.relevanceScore - a.relevanceScore);

  return sorted.slice(0, MAX_RESULTS).map((msg, index) => ({
    ...msg,
    rank: index + 1,
  }));
}

export function groupByChannel(results: readonly RankedResult[]): readonly GroupedResults[] {
  const groups = new Map<string, { readonly channelName: string; readonly channelId: string; messages: RankedResult[] }>();

  for (const result of results) {
    const existing = groups.get(result.channelId);
    if (existing) {
      existing.messages.push(result);
    } else {
      groups.set(result.channelId, {
        channelName: result.channelName,
        channelId: result.channelId,
        messages: [result],
      });
    }
  }

  return [...groups.values()].map((group) => ({
    ...group,
    messages: [...group.messages],
  }));
}
