import Anthropic from '@anthropic-ai/sdk';
import type { Envelope, AISummary, GroupedResults } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';
import { SYSTEM_PROMPT, buildUserPrompt, buildNoResultsPrompt } from './prompt-builder.js';
import type { Logger } from '../utils/logger.js';

export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}

export async function summarize(
  client: Anthropic,
  question: string,
  groupedResults: readonly GroupedResults[],
  model: string,
  logger: Logger,
): Promise<Envelope<AISummary>> {
  const totalMessages = groupedResults.reduce((sum, g) => sum + g.messages.length, 0);

  const userPrompt = totalMessages > 0
    ? buildUserPrompt(question, groupedResults)
    : buildNoResultsPrompt(question);

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
    });

    const answer = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    const channelsCited = groupedResults.map((g) => g.channelName);

    logger.info({ model, messageCount: totalMessages }, 'AI summarization complete');

    return ok({
      answer,
      channelsCited,
      messageCount: totalMessages,
      model,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown AI error';
    logger.error({ err: error }, 'AI summarization failed');

    if (msg.includes('rate_limit') || msg.includes('429')) {
      logger.info('Rate limited by Anthropic, retrying in 2s...');
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const retry = await client.messages.create({
          model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
          temperature: 0.3,
        });

        const answer = retry.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('\n');

        return ok({
          answer,
          channelsCited: groupedResults.map((g) => g.channelName),
          messageCount: totalMessages,
          model,
        });
      } catch (retryError) {
        const retryMsg = retryError instanceof Error ? retryError.message : 'Retry failed';
        return fail(`AI error after retry: ${retryMsg}`);
      }
    }

    return fail(`AI summarization failed: ${msg}`);
  }
}
