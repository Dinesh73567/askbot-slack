import type { GroupedResults } from '../types/index.js';

export const SYSTEM_PROMPT = `You are AskBot, a Slack workspace knowledge assistant. Users ask you questions and you answer based on real messages from their Slack workspace.

RULES:
1. ONLY use information from the provided messages. Never fabricate or assume.
2. ALWAYS cite sources: "According to @username in #channel-name..."
3. Use Slack mrkdwn: *bold*, _italic_, \`code\`, > blockquote, bullet lists
4. If messages don't contain enough info, say so honestly and suggest who/where to ask.
5. Keep answers concise: 2-4 paragraphs max.
6. If messages show conflicting info, present all sides.
7. For personal summaries ("what did I do"), organize by time and activity.
8. For channel summaries, group by topic/theme.`;

function formatTimestamp(ts: string): string {
  const seconds = parseFloat(ts);
  if (isNaN(seconds)) return 'unknown time';
  const date = new Date(seconds * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function truncateText(text: string, maxLength: number = 500): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

export function buildUserPrompt(
  question: string,
  groupedResults: readonly GroupedResults[],
): string {
  const totalMessages = groupedResults.reduce((sum, g) => sum + g.messages.length, 0);
  const channelCount = groupedResults.length;

  let prompt = `QUESTION: ${question}\n\n`;
  prompt += `MESSAGES (${totalMessages} messages from ${channelCount} channels):\n\n`;

  for (const group of groupedResults) {
    prompt += `=== #${group.channelName} ===\n`;
    for (const msg of group.messages) {
      const time = formatTimestamp(msg.timestamp);
      prompt += `[@${msg.username}, ${time}]:\n${truncateText(msg.text)}\n\n`;
    }
  }

  prompt += 'Based on these messages, answer the question.';
  return prompt;
}

export function buildNoResultsPrompt(question: string): string {
  return `The user asked: "${question}"

No relevant messages were found in the channels I have access to. Please let the user know politely and suggest:
1. Try rephrasing the question
2. Make sure I'm invited to the relevant channels (/invite @AskBot)
3. The information might be older than the search window`;
}
