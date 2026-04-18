import { WebClient } from '@slack/web-api';
import type { Envelope, SearchResult } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';

/**
 * Search Slack messages using the user's own xoxp- token.
 * This searches across all channels, DMs, and group DMs the user can see.
 * Never logs the token or message content — only IDs and counts.
 */
export async function searchMessages(
  userToken: string,
  searchQuery: string,
  count: number = 20,
): Promise<Envelope<readonly SearchResult[]>> {
  if (!searchQuery.trim()) {
    return fail('Search query cannot be empty');
  }

  try {
    const client = new WebClient(userToken);
    const response = await client.search.messages({
      query: searchQuery,
      sort: 'timestamp',
      sort_dir: 'desc',
      count,
    });

    if (!response.ok) {
      return fail('Slack search.messages returned ok=false');
    }

    const matches = response.messages?.matches ?? [];

    const results: SearchResult[] = matches.map((match) => ({
      messageId: match.ts ?? '',
      text: match.text ?? '',
      userId: match.user ?? '',
      channelId: (match.channel as { id?: string } | undefined)?.id ?? '',
      channelName: (match.channel as { name?: string } | undefined)?.name ?? '',
      timestamp: match.ts ?? '',
      permalink: match.permalink ?? '',
      reactionCount: Object.values(
        (match as { reactions?: Record<string, { count?: number }> }).reactions ?? {},
      ).reduce((sum: number, r) => sum + (r?.count ?? 0), 0),
      replyCount: (match as { reply_count?: number }).reply_count ?? 0,
    }));

    return ok(results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Search failed: ${message}`);
  }
}
