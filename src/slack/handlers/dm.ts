import type { App } from '@slack/bolt';
import type Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '../../utils/logger.js';
import { stripBotMention } from './mention.js';
import { formatThinkingResponse } from '../../formatter/slack-blocks.js';
import { handleQuestion } from './pipeline.js';

export function registerDmHandler(
  app: App,
  anthropic: Anthropic,
  model: string,
  logger: Logger,
): void {
  app.event('message', async ({ event, client }) => {
    if (event.channel_type !== 'im') return;
    if ('subtype' in event && event.subtype !== undefined) return;
    if (!('text' in event) || !event.text) return;

    const userId = 'user' in event ? event.user : undefined;
    if (!userId) return;

    const question = stripBotMention(event.text);

    logger.info({ userId, channel: event.channel }, 'Received DM');

    await client.chat.postMessage({
      channel: event.channel,
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

    await client.chat.postMessage({
      channel: event.channel,
      text: result.text,
      blocks: result.blocks as never[],
    });
  });
}
