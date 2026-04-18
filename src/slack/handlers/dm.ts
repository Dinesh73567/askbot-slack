import type { App } from '@slack/bolt';
import type { AppConfig } from '../../types/index.js';
import type { Logger } from '../../utils/logger.js';
import { getUserToken } from '../../db/token-store.js';
import { parseQuery } from '../../query/query-parser.js';
import { searchMessages } from '../../search/user-search.js';
import { processResults } from '../../search/importance-scorer.js';
import { summarize } from '../../ai/summarizer.js';
import { buildResponseBlocks, buildNoResultsBlocks, buildConnectAccountBlocks } from '../../formatter/slack-blocks.js';
import { UserResolver } from '../user-resolver.js';

export function registerDmHandler(app: App, config: AppConfig, logger: Logger): void {
  app.event('message', async ({ event, client }) => {
    // Only handle direct messages
    if (event.channel_type !== 'im') {
      return;
    }

    // Skip edits and bot messages
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

    const rawText = event.text.trim();
    const channel = event.channel;

    logger.info({ userId, channel }, 'Received DM');

    try {
      // Step 1: Look up user token
      const tokenResult = await getUserToken(userId);
      if (!tokenResult.success) {
        logger.error({ userId, error: tokenResult.error }, 'Failed to look up user token');
        await client.chat.postMessage({
          channel,
          text: 'Something went wrong. Please try again later.',
        });
        return;
      }

      // Step 2: No token — prompt OAuth
      if (!tokenResult.data) {
        logger.info({ userId }, 'No token found, prompting OAuth');
        const installUrl = `${config.appUrl}/auth/install?user_id=${userId}`;
        await client.chat.postMessage({
          channel,
          text: 'To answer your questions, I need access to your Slack data. Please connect your account.',
          blocks: buildConnectAccountBlocks(installUrl) as never[],
        });
        return;
      }

      // Step 3: Post acknowledgement ephemeral while processing
      await client.chat.postEphemeral({
        channel,
        user: userId,
        text: 'Searching your Slack workspace...',
      });

      // Step 4: Parse query
      const parsedQuery = parseQuery(rawText);
      logger.info({ userId, queryType: parsedQuery.type, keywords: parsedQuery.keywords.length }, 'Parsed query');

      // Step 5: Search using user token
      const searchResult = await searchMessages(tokenResult.data, parsedQuery.searchQuery);
      if (!searchResult.success) {
        logger.error({ userId, error: searchResult.error }, 'Search failed');
        await client.chat.postMessage({
          channel,
          text: 'Search failed. Please try again.',
        });
        return;
      }

      // Step 6: Rank and deduplicate
      const topResults = processResults(searchResult.data ?? [], 15);
      logger.info({ userId, resultCount: topResults.length }, 'Search results processed');

      // Step 7: No results
      if (topResults.length === 0) {
        await client.chat.postMessage({
          channel,
          text: 'No relevant messages found.',
          blocks: buildNoResultsBlocks(rawText) as never[],
        });
        return;
      }

      // Step 7.5: Resolve user IDs to display names
      const resolver = new UserResolver(client);
      const userIds = topResults.map((r) => r.userId);
      const userNames = await resolver.resolveAll(userIds);

      // Step 8: Summarize with Claude
      const summaryResult = await summarize(
        config.anthropicApiKey,
        config.claudeModel,
        parsedQuery,
        topResults,
        userNames,
      );
      if (!summaryResult.success) {
        logger.error({ userId, error: summaryResult.error }, 'Summarization failed');
        await client.chat.postMessage({
          channel,
          text: 'I found messages but could not summarize them. Please try again.',
        });
        return;
      }

      // Step 9: Format and post
      const blocks = buildResponseBlocks(summaryResult.data!);
      await client.chat.postMessage({
        channel,
        text: summaryResult.data!.answer.slice(0, 150),
        blocks: blocks as never[],
      });

      logger.info({ userId, messageCount: topResults.length }, 'Response sent');
    } catch (error) {
      logger.error({ err: error, userId, channel }, 'Failed to handle DM');
      await client.chat.postMessage({
        channel,
        text: 'An unexpected error occurred. Please try again.',
      });
    }
  });
}
