import type { AISummary } from '../types/index.js';

interface SlackBlock {
  readonly type: string;
  readonly text?: {
    readonly type: string;
    readonly text: string;
  };
  readonly elements?: readonly {
    readonly type: string;
    readonly text: string;
  }[];
}

const MAX_SECTION_LENGTH = 2800;

function splitAtParagraph(text: string, maxLen: number): readonly string[] {
  if (text.length <= maxLen) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLen) {
    const cutPoint = remaining.lastIndexOf('\n\n', maxLen);
    const splitAt = cutPoint > 0 ? cutPoint : maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).trimStart();
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export function formatResponse(summary: AISummary): readonly SlackBlock[] {
  const blocks: SlackBlock[] = [];

  const chunks = splitAtParagraph(summary.answer, MAX_SECTION_LENGTH);
  for (const chunk of chunks) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: chunk },
    });
  }

  blocks.push({ type: 'divider' });

  const sources = summary.channelsCited.length > 0
    ? summary.channelsCited.map((ch) => `#${ch}`).join(', ')
    : 'No channels';

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Sources: ${sources} | ${summary.messageCount} messages analyzed | Powered by Claude`,
      },
    ],
  });

  return blocks;
}

export function formatErrorResponse(error: string): readonly SlackBlock[] {
  return [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Something went wrong: ${error}\n\nPlease try again or rephrase your question.`,
      },
    },
  ];
}

export function formatThinkingResponse(): string {
  return 'Searching across channels and analyzing messages...';
}
