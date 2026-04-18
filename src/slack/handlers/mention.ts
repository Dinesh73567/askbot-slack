import type { App } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';

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

export function registerMentionHandler(app: App, logger: Logger): void {
  app.event('app_mention', async ({ event, client }) => {
    if (!event.user) return;

    try {
      const rawText = event.text ?? '';
      const question = stripBotMention(rawText);

      logger.info({ userId: event.user, channel: event.channel }, 'Received mention');

      const response = buildEchoResponse(question);

      await client.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        text: response,
      });
    } catch (error) {
      logger.error({ err: error, userId: event.user, channel: event.channel }, 'Failed to handle mention');
    }
  });
}
