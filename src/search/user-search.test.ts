import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@slack/web-api', () => {
  const mockSearchMessages = vi.fn();
  const MockWebClient = vi.fn().mockImplementation(() => ({
    search: { messages: mockSearchMessages },
  }));
  return { WebClient: MockWebClient };
});

import { searchMessages } from './user-search.js';
import { WebClient } from '@slack/web-api';

describe('searchMessages', () => {
  let mockSearch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    const instance = new (WebClient as ReturnType<typeof vi.fn>)();
    mockSearch = instance.search.messages;
  });

  it('returns search results on success', async () => {
    mockSearch.mockResolvedValue({
      ok: true,
      messages: {
        matches: [
          {
            ts: '1710504000.000001',
            text: 'Deployment complete',
            user: 'U12345',
            channel: { id: 'C12345', name: 'engineering' },
            permalink: 'https://slack.com/msg/1',
            reactions: { thumbsup: { count: 3 } },
            reply_count: 2,
          },
        ],
      },
    });

    const result = await searchMessages('xoxp-test', 'deployment');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].text).toBe('Deployment complete');
    expect(result.data![0].channelName).toBe('engineering');
    expect(result.data![0].reactionCount).toBe(3);
    expect(result.data![0].replyCount).toBe(2);
  });

  it('returns empty array when no matches', async () => {
    mockSearch.mockResolvedValue({
      ok: true,
      messages: { matches: [] },
    });

    const result = await searchMessages('xoxp-test', 'nonexistent topic');
    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it('returns fail on empty search query', async () => {
    const result = await searchMessages('xoxp-test', '');
    expect(result.success).toBe(false);
    expect(result.error).toContain('empty');
  });

  it('returns fail on Slack API error', async () => {
    mockSearch.mockRejectedValue(new Error('rate_limited'));

    const result = await searchMessages('xoxp-test', 'deployment');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Search failed');
  });

  it('calls search.messages with correct parameters', async () => {
    mockSearch.mockResolvedValue({ ok: true, messages: { matches: [] } });

    await searchMessages('xoxp-test', 'deployment status', 10);

    expect(mockSearch).toHaveBeenCalledWith({
      query: 'deployment status',
      sort: 'timestamp',
      sort_dir: 'desc',
      count: 10,
    });
  });

  it('returns fail when ok=false', async () => {
    mockSearch.mockResolvedValue({ ok: false });

    const result = await searchMessages('xoxp-test', 'test');
    expect(result.success).toBe(false);
  });
});
