import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  return { default: MockAnthropic };
});

import { summarize } from './summarizer.js';
import Anthropic from '@anthropic-ai/sdk';
import type { ParsedQuery, SearchResult } from '../types/index.js';

const mockQuery: ParsedQuery = Object.freeze({
  raw: 'what happened today?',
  type: 'personal',
  keywords: ['happened'],
  channelName: undefined,
  personMention: undefined,
  timeWindow: undefined,
  searchQuery: 'from:@me after:2024-03-15',
});

const mockResult: SearchResult = {
  messageId: '1710504000.000001',
  text: 'Deployed the new feature',
  userId: 'U12345',
  channelId: 'C12345',
  channelName: 'engineering',
  timestamp: '1710504000.000001',
  permalink: 'https://slack.com/msg/1',
  reactionCount: 2,
  replyCount: 1,
};

describe('summarize', () => {
  let mockCreate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const instance = new (Anthropic as unknown as ReturnType<typeof vi.fn>)();
    mockCreate = instance.messages.create;
  });

  it('returns summary on successful API call', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Here is what happened today...' }],
    });

    const result = await summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);
    expect(result.success).toBe(true);
    expect(result.data?.answer).toBe('Here is what happened today...');
    expect(result.data?.messageCount).toBe(1);
    expect(result.data?.model).toBe('claude-sonnet-4-20250514');
  });

  it('includes channel names in summary', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Summary text' }],
    });

    const result = await summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);
    expect(result.data?.channelsCited).toContain('engineering');
  });

  it('calls Claude with correct parameters', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Answer' }],
    });

    await summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);

    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      temperature: 0.3,
      system: expect.arrayContaining([
        expect.objectContaining({ cache_control: { type: 'ephemeral' } }),
      ]),
    }));
  });

  it('returns fail on API error', async () => {
    mockCreate.mockRejectedValue(new Error('Service unavailable'));

    const result = await summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);
    expect(result.success).toBe(false);
    expect(result.error).toContain('Claude API call failed');
  });

  it('retries once on rate limit error and succeeds', async () => {
    const rateLimitError = new Error('429 rate limit exceeded');
    mockCreate
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: 'Retry succeeded' }],
      });

    // Use fake timers to avoid actual delay
    vi.useFakeTimers();
    const promise = summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(true);
    expect(result.data?.answer).toBe('Retry succeeded');
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('returns fail when both attempts fail on rate limit', async () => {
    const rateLimitError = new Error('429 rate limit exceeded');
    mockCreate.mockRejectedValue(rateLimitError);

    vi.useFakeTimers();
    const promise = summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, [mockResult]);
    await vi.runAllTimersAsync();
    const result = await promise;
    vi.useRealTimers();

    expect(result.success).toBe(false);
    expect(result.error).toContain('after retry');
  });

  it('handles empty results gracefully', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'No messages found.' }],
    });

    const result = await summarize('sk-ant-test', 'claude-sonnet-4-20250514', mockQuery, []);
    expect(result.success).toBe(true);
    expect(result.data?.messageCount).toBe(0);
    expect(result.data?.channelsCited).toHaveLength(0);
  });
});
