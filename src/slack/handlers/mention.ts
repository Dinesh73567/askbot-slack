import type { App } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';
import { parsePollCommand } from '../../poll/poll-parser.js';
import {
  createPoll,
  updatePollMessageTs,
} from '../../poll/poll-store.js';
import { buildPollBlocks, buildClosePollBlocks } from '../../poll/poll-blocks.js';
import type { PollState } from '../../types/index.js';

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

/**
 * Check if the mention text is a poll command.
 */
function isPollCommand(text: string): boolean {
  return /^poll\b/i.test(text);
}

export function registerMentionHandler(app: App, logger: Logger): void {
  app.event('app_mention', async ({ event, client }) => {
    if (!event.user) return;

    try {
      const rawText = event.text ?? '';
      const question = stripBotMention(rawText);

      logger.info({ userId: event.user, channel: event.channel }, 'Received mention');

      // Route poll commands to poll handler
      if (isPollCommand(question)) {
        await handlePollViaMention(event.user, event.channel, question, client, logger);
        return;
      }

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

const POLL_USAGE =
  'Usage: `@AskBot poll single "Your question?" "Option 1" "Option 2"`\n' +
  'Mode: `single` (one vote) or `multi` (multiple votes, default).';

async function handlePollViaMention(
  userId: string,
  channelId: string,
  text: string,
  client: { chat: { postEphemeral: (args: { channel: string; user: string; text: string; blocks?: unknown[] }) => Promise<unknown>; postMessage: (args: { channel: string; text: string; blocks: unknown[] }) => Promise<{ ts?: string }> } },
  logger: Logger,
): Promise<void> {
  const parsed = parsePollCommand(text);
  if (!parsed.success || !parsed.data) {
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: parsed.error ?? POLL_USAGE,
    });
    return;
  }

  const { question, options, mode } = parsed.data;

  const pollResult = await createPoll(channelId, userId, question, options, mode);
  if (!pollResult.success || !pollResult.data) {
    logger.error({ err: pollResult.error }, 'Failed to create poll via mention');
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'Failed to create poll. Please try again.',
    });
    return;
  }

  const poll = pollResult.data;
  const state: PollState = {
    poll,
    votes: [],
    voterNames: new Map(),
  };
  const blocks = buildPollBlocks(state);

  try {
    const postResult = await client.chat.postMessage({
      channel: channelId,
      text: `Poll: ${question}`,
      blocks: blocks as unknown[],
    });

    if (postResult.ts) {
      await updatePollMessageTs(poll.id, postResult.ts);
    }

    // Send ephemeral close button to creator only
    const closeBlocks = buildClosePollBlocks(poll.id);
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'Close poll controls',
      blocks: closeBlocks as unknown[],
    });

    logger.info({ pollId: poll.id, channelId }, 'Poll created via mention');
  } catch (error) {
    logger.error({ err: error, pollId: poll.id }, 'Failed to post poll message');
    await client.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'Failed to post poll. Please try again.',
    });
  }
}
