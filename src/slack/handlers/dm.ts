import type { App } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';
import { buildEchoResponse, stripBotMention } from './mention.js';

export function registerDmHandler(app: App, logger: Logger): void {
  app.event('message', async ({ event, client }) => {
    if (event.channel_type !== 'im') {
      return;
    }

    if ('subtype' in event && event.subtype !== undefined) {
      return;
    }

    if (!('text' in event) || !event.text) {
      return;
    }

    const userId = 'user' in event ? event.user : undefined;
    if (!userId) {
      return;
    }

    const question = stripBotMention(event.text);

    logger.info({ userId, channel: event.channel }, 'Received DM');

    const response = buildEchoResponse(question);

    await client.chat.postMessage({
      channel: event.channel,
      text: response,
    });
  });
}
