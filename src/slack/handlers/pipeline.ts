import type { WebClient } from '@slack/web-api';
import type Anthropic from '@anthropic-ai/sdk';
import type { Logger } from '../../utils/logger.js';
import { fetchAllMessages } from '../../search/channel-fetcher.js';
import { parseQuery, filterByUser } from '../../search/keyword-matcher.js';
import { rankResults, groupByChannel } from '../../search/result-ranker.js';
import { summarize } from '../../ai/summarizer.js';
import { formatResponse, formatErrorResponse } from '../../formatter/slack-blocks.js';

interface PipelineParams {
  readonly client: WebClient;
  readonly anthropic: Anthropic;
  readonly question: string;
  readonly userId: string;
  readonly model: string;
  readonly logger: Logger;
}

interface PipelineResult {
  readonly blocks: readonly unknown[];
  readonly text: string;
}

export async function handleQuestion(params: PipelineParams): Promise<PipelineResult> {
  const { client, anthropic, question, userId, model, logger } = params;

  if (!question.trim()) {
    return {
      blocks: formatErrorResponse('Please ask me a question! Example: "What are my tasks today?"'),
      text: 'Please ask me a question!',
    };
  }

  const intent = parseQuery(question);
  logger.info({ intent, userId }, 'Parsed query intent');

  const messagesResult = await fetchAllMessages(
    client,
    logger,
    intent.hoursBack,
    intent.targetChannel ?? undefined,
  );

  if (!messagesResult.success || !messagesResult.data) {
    return {
      blocks: formatErrorResponse(messagesResult.error ?? 'Failed to fetch messages'),
      text: messagesResult.error ?? 'Failed to fetch messages',
    };
  }

  let messages = messagesResult.data;

  if (intent.isPersonal) {
    messages = filterByUser(messages, userId);
  }

  const ranked = rankResults(messages, intent.keywords);
  const grouped = groupByChannel(ranked);

  logger.info({
    totalMessages: messages.length,
    rankedCount: ranked.length,
    groupCount: grouped.length,
  }, 'Search complete');

  const summaryResult = await summarize(anthropic, question, grouped, model, logger);

  if (!summaryResult.success || !summaryResult.data) {
    return {
      blocks: formatErrorResponse(summaryResult.error ?? 'AI summarization failed'),
      text: summaryResult.error ?? 'AI summarization failed',
    };
  }

  return {
    blocks: formatResponse(summaryResult.data),
    text: summaryResult.data.answer,
  };
}
