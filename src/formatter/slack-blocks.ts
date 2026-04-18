import type { AISummary } from '../types/index.js';

/** Slack's mrkdwn text block limit is ~3000 chars; we split at 2800 to be safe */
const BLOCK_CHAR_LIMIT = 2800;

/** A minimal Block Kit block type (subset needed here) */
export type SlackBlock =
  | { readonly type: 'section'; readonly text: { readonly type: 'mrkdwn'; readonly text: string } }
  | { readonly type: 'divider' }
  | { readonly type: 'context'; readonly elements: ReadonlyArray<{ readonly type: 'mrkdwn'; readonly text: string }> };

/**
 * Split a long text string into chunks of at most maxLength characters,
 * breaking on word boundaries where possible.
 */
function splitText(text: string, maxLength: number = BLOCK_CHAR_LIMIT): readonly string[] {
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    // Find the last whitespace within the limit
    let splitAt = remaining.lastIndexOf('\n', maxLength);
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = remaining.lastIndexOf(' ', maxLength);
    }
    if (splitAt === -1 || splitAt < maxLength / 2) {
      splitAt = maxLength;
    }
    chunks.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

/**
 * Build a Block Kit message from an AISummary.
 * Structure:
 *   - One or more section blocks with the AI answer (split at 2800 chars)
 *   - A divider
 *   - A context block with source channel names and message count
 */
export function buildResponseBlocks(summary: AISummary): readonly SlackBlock[] {
  const textChunks = splitText(summary.answer);

  const sectionBlocks: SlackBlock[] = textChunks.map((chunk) => ({
    type: 'section',
    text: { type: 'mrkdwn', text: chunk },
  }));

  const divider: SlackBlock = { type: 'divider' };

  const sourceChannels =
    summary.channelsCited.length > 0
      ? summary.channelsCited.map((ch) => `#${ch}`).join(', ')
      : 'various channels';

  const contextText = `Sources: ${sourceChannels} | ${summary.messageCount} message${summary.messageCount === 1 ? '' : 's'} analyzed`;

  const contextBlock: SlackBlock = {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: contextText }],
  };

  return [...sectionBlocks, divider, contextBlock];
}

/**
 * Build a "no results" Block Kit response when search returns nothing.
 */
export function buildNoResultsBlocks(query: string): readonly SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `I searched for _"${query}"_ but could not find relevant messages in your accessible Slack channels.\n\nTry rephrasing your question or check that you have access to the channels where this topic is discussed.`,
      },
    },
  ];
}

/**
 * Build a "connect account" Block Kit prompt for users without a stored token.
 */
export function buildConnectAccountBlocks(installUrl: string): readonly (SlackBlock | {
  readonly type: 'actions';
  readonly elements: ReadonlyArray<{
    readonly type: 'button';
    readonly text: { readonly type: 'plain_text'; readonly text: string; readonly emoji: false };
    readonly url: string;
    readonly style: 'primary';
  }>;
})[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'To answer your questions, I need access to your Slack data. Click below to connect your account (one-time setup).',
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Connect Your Account', emoji: false as const },
          url: installUrl,
          style: 'primary',
        },
      ],
    },
  ];
}
