import type { SearchResult, ParsedQuery } from '../types/index.js';

/** System prompt — cached via Anthropic's prompt caching (ephemeral) */
export const SYSTEM_PROMPT = `You are AskBot, an AI knowledge assistant for a Slack workspace. You answer questions based ONLY on real Slack messages provided to you.

RULES:
1. ONLY use information from the provided messages. Never fabricate.
2. ALWAYS cite sources: "According to @username in #channel..."
3. Use Slack mrkdwn: *bold*, _italic_, \`code\`, > blockquote
4. If not enough info, say so and suggest where to look.
5. Keep answers concise: 3-4 short paragraphs max.
6. End with "Sources:" listing channels referenced.`;

/**
 * Format a single search result as a readable message block for the prompt.
 * Never includes the full token; only message IDs and text.
 */
function formatMessage(result: SearchResult, index: number): string {
  const date = new Date(parseFloat(result.timestamp) * 1000).toISOString().split('T')[0];
  const reactions = result.reactionCount > 0 ? ` [${result.reactionCount} reactions]` : '';
  const replies = result.replyCount > 0 ? ` [${result.replyCount} replies]` : '';
  return `[${index + 1}] @${result.userId} in #${result.channelName} (${date})${reactions}${replies}:\n${result.text}`;
}

/**
 * Build the user-facing prompt sent to Claude.
 * Groups messages by channel for readability.
 */
export function buildUserPrompt(
  query: ParsedQuery,
  results: readonly SearchResult[],
): string {
  if (results.length === 0) {
    return `The user asked: "${query.raw}"\n\nNo matching messages were found. Please inform the user and suggest alternative searches.`;
  }

  // Group by channelName for readability
  const grouped = new Map<string, SearchResult[]>();
  for (const result of results) {
    const key = result.channelName || result.channelId || 'unknown';
    const existing = grouped.get(key) ?? [];
    grouped.set(key, [...existing, result]);
  }

  const sections: string[] = [];
  let globalIndex = 0;

  for (const [channelName, messages] of grouped.entries()) {
    const header = `--- #${channelName} (${messages.length} message${messages.length === 1 ? '' : 's'}) ---`;
    const formatted = messages.map((m) => {
      const line = formatMessage(m, globalIndex);
      globalIndex++;
      return line;
    });
    sections.push([header, ...formatted].join('\n'));
  }

  const messageBlock = sections.join('\n\n');

  return `The user asked: "${query.raw}"

Here are the ${results.length} most relevant Slack messages found (sorted by importance):

${messageBlock}

Please answer the user's question based only on these messages. Cite sources using @userId and #channelName format.`;
}
