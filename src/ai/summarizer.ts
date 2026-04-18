import Anthropic from '@anthropic-ai/sdk';
import type { Envelope, AISummary, SearchResult, ParsedQuery } from '../types/index.js';
import { ok, fail } from '../utils/envelope.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompt-builder.js';

const MAX_TOKENS = 1024;
const TEMPERATURE = 0.3;
const RETRY_DELAY_MS = 5000;

/**
 * Call Claude to summarize search results in response to the user's query.
 * Uses prompt caching on the system prompt (ephemeral cache_control).
 * Retries once on HTTP 429 (rate limit) after waiting the retry-after header.
 */
export async function summarize(
  apiKey: string,
  model: string,
  query: ParsedQuery,
  results: readonly SearchResult[],
  userNames?: ReadonlyMap<string, string>,
): Promise<Envelope<AISummary>> {
  const client = new Anthropic({ apiKey });
  const userPrompt = buildUserPrompt(query, results, userNames);

  const channelNames = [...new Set(results.map((r) => r.channelName).filter(Boolean))];

  try {
    const response = await callClaude(client, model, userPrompt);
    return ok(buildSummary(response, model, results.length, channelNames));
  } catch (error) {
    // Single retry on rate limit (429)
    if (isRateLimitError(error)) {
      const delay = extractRetryAfter(error) ?? RETRY_DELAY_MS;
      await sleep(delay);
      try {
        const response = await callClaude(client, model, userPrompt);
        return ok(buildSummary(response, model, results.length, channelNames));
      } catch (retryError) {
        const message = retryError instanceof Error ? retryError.message : 'Unknown error';
        return fail(`Claude API failed after retry: ${message}`);
      }
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    return fail(`Claude API call failed: ${message}`);
  }
}

async function callClaude(
  client: Anthropic,
  model: string,
  userPrompt: string,
): Promise<Anthropic.Message> {
  return client.messages.create({
    model,
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [{ role: 'user', content: userPrompt }],
  });
}

function buildSummary(
  response: Anthropic.Message,
  model: string,
  messageCount: number,
  channelsCited: readonly string[],
): AISummary {
  const textBlock = response.content.find((b) => b.type === 'text');
  const answer = textBlock && textBlock.type === 'text' ? textBlock.text : '';
  return Object.freeze({ answer, channelsCited, messageCount, model });
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('429') ||
      error.message.toLowerCase().includes('rate limit') ||
      ('status' in error && (error as { status?: number }).status === 429)
    );
  }
  return false;
}

function extractRetryAfter(error: unknown): number | undefined {
  if (error instanceof Error && 'headers' in error) {
    const headers = (error as { headers?: Record<string, string> }).headers;
    const retryAfter = headers?.['retry-after'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      if (!isNaN(seconds)) return seconds * 1000;
    }
  }
  return undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
