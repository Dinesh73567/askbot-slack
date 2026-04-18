import type { App } from '@slack/bolt';
import type Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '../../utils/logger.js';
import { formatThinkingResponse } from '../../formatter/slack-blocks.js';
import { handleQuestion } from './pipeline.js';

const BOT_MENTION_REGEX = /<@[A-Z0-9]+>/;

export function stripBotMention(text: string): string {
  return text.replace(BOT_MENTION_REGEX, '').replace(/\s+/g, ' ').trim();
}

export function buildEchoResponse(question: string): string {
  if (!question) {
    return 'Please ask me a question! Example: @AskBot what happened today?';
  }
  return `I heard: ${question}`;
}

export function registerMentionHandler(
  app: App,
  anthropic: Anthropic,
  model: string,
  logger: Logger,
): void {
  app.event('app_mention', async ({ event, client }) => {
    const rawText = event.text ?? '';
    const question = stripBotMention(rawText);
    const userId = event.user ?? '';

    logger.info({ userId, channel: event.channel }, 'Received mention');

    await client.chat.postEphemeral({
      channel: event.channel,
      user: userId,
      text: formatThinkingResponse(),
    });

    const result = await handleQuestion({
      client,
      anthropic,
      question,
      userId,
      model,
      logger,
    });

    await client.chat.postEphemeral({
      channel: event.channel,
      user: userId,
      text: result.text,
      blocks: result.blocks as never[],
    });
  });
}
