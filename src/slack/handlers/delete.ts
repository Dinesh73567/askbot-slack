import { WebClient } from '@slack/web-api';
import type { App } from '@slack/bolt';
import type { Logger } from '../../utils/logger.js';
import { getUserToken } from '../../db/token-store.js';

/**
 * Registers the /delete slash command.
 * Deletes all messages (bot + user) in the DM conversation.
 * Uses the bot token for bot messages and the user's OAuth token for user messages.
 */
export function registerDeleteHandler(app: App, logger: Logger): void {
  app.command('/delete', async ({ ack, command, client }) => {
    await ack();

    const userId = command.user_id;
    const channelId = command.channel_id;

    logger.info({ userId, channelId }, 'Delete command received');

    try {
      // Fetch the bot's own user ID
      const authResult = await client.auth.test();
      const botUserId = authResult.user_id;

      if (!botUserId) {
        await client.chat.postEphemeral({
          channel: channelId,
          user: userId,
          text: 'Could not determine bot identity. Please try again.',
        });
        return;
      }

      // Get user's OAuth token for deleting user messages
      const tokenResult = await getUserToken(userId);
      const userToken = tokenResult.success ? tokenResult.data : null;
      const userClient = userToken ? new WebClient(userToken) : null;

      // Paginate through all conversation history and collect messages
      let cursor: string | undefined;
      let deletedCount = 0;
      let hasMore = true;

      while (hasMore) {
        const history = await client.conversations.history({
          channel: channelId,
          limit: 200,
          cursor,
        });

        const messages = history.messages ?? [];

        for (const msg of messages) {
          if (!msg.ts) continue;

          try {
            if (msg.user === botUserId) {
              // Delete bot messages with bot token
              await client.chat.delete({
                channel: channelId,
                ts: msg.ts,
              });
              deletedCount++;
            } else if (msg.user === userId && userClient) {
              // Delete user messages with user's own token
              await userClient.chat.delete({
                channel: channelId,
                ts: msg.ts,
              });
              deletedCount++;
            }
          } catch (deleteErr) {
            logger.warn({ ts: msg.ts, user: msg.user, err: deleteErr }, 'Failed to delete message');
          }
        }

        cursor = history.response_metadata?.next_cursor || undefined;
        hasMore = Boolean(cursor);
      }

      logger.info({ userId, deletedCount }, 'Delete command completed');

      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: `Deleted ${deletedCount} message${deletedCount === 1 ? '' : 's'} from this conversation.`,
      });
    } catch (error) {
      logger.error({ err: error, userId, channelId }, 'Failed to execute delete command');
      await client.chat.postEphemeral({
        channel: channelId,
        user: userId,
        text: 'Failed to delete messages. Please try again.',
      });
    }
  });
}
