import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies before importing the handler
vi.mock('../../db/token-store.js', () => ({
  getUserToken: vi.fn(),
}));

vi.mock('../../query/query-parser.js', () => ({
  parseQuery: vi.fn(),
}));

vi.mock('../../search/user-search.js', () => ({
  searchMessages: vi.fn(),
}));

vi.mock('../../search/importance-scorer.js', () => ({
  processResults: vi.fn(),
}));

vi.mock('../../ai/summarizer.js', () => ({
  summarize: vi.fn(),
}));

vi.mock('../../formatter/slack-blocks.js', () => ({
  buildResponseBlocks: vi.fn().mockReturnValue([]),
  buildNoResultsBlocks: vi.fn().mockReturnValue([]),
  buildConnectAccountBlocks: vi.fn().mockReturnValue([]),
}));

import { registerDmHandler } from './dm.js';
import { getUserToken } from '../../db/token-store.js';
import { parseQuery } from '../../query/query-parser.js';
import { searchMessages } from '../../search/user-search.js';
import { processResults } from '../../search/importance-scorer.js';
import { summarize } from '../../ai/summarizer.js';
import { createLogger } from '../../utils/logger.js';
import type { AppConfig } from '../../types/index.js';

const testConfig: AppConfig = {
  slackBotToken: 'xoxb-test',
  slackAppToken: 'xapp-test',
  slackSigningSecret: 'secret',
  slackClientId: 'client123',
  slackClientSecret: 'clientsecret',
  anthropicApiKey: 'sk-ant-test',
  claudeModel: 'claude-sonnet-4-20250514',
  logLevel: 'error',
  rateLimitPerUserPerMinute: 5,
  appUrl: 'https://example.com',
  port: 3000,
  databaseUrl: 'file:./dev.db',
  databaseProvider: 'sqlite',
};

const mockParsedQuery = {
  raw: 'what happened today?',
  type: 'personal' as const,
  keywords: ['happened'],
  channelName: undefined,
  personMention: undefined,
  timeWindow: undefined,
  searchQuery: 'from:@me',
};

const mockSearchResult = {
  messageId: 'ts-1',
  text: 'Deployed feature',
  userId: 'U99999',
  channelId: 'C12345',
  channelName: 'engineering',
  timestamp: 'ts-1',
  permalink: 'https://slack.com',
  reactionCount: 1,
  replyCount: 0,
};

function buildHandler() {
  const mockApp = { event: vi.fn() };
  const logger = createLogger('error');
  registerDmHandler(mockApp as never, testConfig, logger);
  return {
    handler: mockApp.event.mock.calls[0]?.[1] as (args: Record<string, unknown>) => Promise<void>,
  };
}

function makeEventArgs(overrides: Record<string, unknown> = {}) {
  const mockPostMessage = vi.fn().mockResolvedValue({});
  const mockPostEphemeral = vi.fn().mockResolvedValue({});
  return {
    event: {
      channel_type: 'im',
      text: 'what happened today?',
      user: 'U12345',
      channel: 'D12345',
      ...overrides,
    },
    client: {
      chat: { postMessage: mockPostMessage, postEphemeral: mockPostEphemeral },
    },
    mockPostMessage,
    mockPostEphemeral,
  };
}

describe('registerDmHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers a message event handler', () => {
    const mockApp = { event: vi.fn() };
    registerDmHandler(mockApp as never, testConfig, createLogger('error'));
    expect(mockApp.event).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('ignores non-DM messages', async () => {
    const { handler } = buildHandler();
    const args = makeEventArgs({ channel_type: 'channel' });
    await handler({ event: args.event, client: args.client } as never);
    expect(args.mockPostMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with subtypes', async () => {
    const { handler } = buildHandler();
    const args = makeEventArgs({ subtype: 'message_changed' });
    await handler({ event: args.event, client: args.client } as never);
    expect(args.mockPostMessage).not.toHaveBeenCalled();
  });

  it('ignores messages without text', async () => {
    const { handler } = buildHandler();
    const args = makeEventArgs({ text: undefined });
    await handler({ event: args.event, client: args.client } as never);
    expect(args.mockPostMessage).not.toHaveBeenCalled();
  });

  it('prompts OAuth when user has no token', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: null, error: null });
    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);
    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'D12345',
    }));
    // Should NOT call search
    expect(searchMessages).not.toHaveBeenCalled();
  });

  it('posts error message on token lookup failure', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'DB error' });
    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);
    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('went wrong'),
    }));
  });

  it('runs full pipeline and posts response when token exists', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: 'xoxp-token', error: null });
    (parseQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockParsedQuery);
    (searchMessages as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [mockSearchResult], error: null });
    (processResults as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchResult]);
    (summarize as ReturnType<typeof vi.fn>).mockResolvedValue({
      success: true,
      data: { answer: 'Here is what happened.', channelsCited: ['engineering'], messageCount: 1, model: 'claude' },
      error: null,
    });

    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);

    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'D12345',
    }));
  });

  it('posts no-results message when search returns nothing', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: 'xoxp-token', error: null });
    (parseQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockParsedQuery);
    (searchMessages as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [], error: null });
    (processResults as ReturnType<typeof vi.fn>).mockReturnValue([]);

    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);

    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: 'No relevant messages found.',
    }));
  });

  it('posts error when search fails', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: 'xoxp-token', error: null });
    (parseQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockParsedQuery);
    (searchMessages as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'Search error' });

    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);

    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Search failed'),
    }));
  });

  it('posts error when summarize fails', async () => {
    (getUserToken as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: 'xoxp-token', error: null });
    (parseQuery as ReturnType<typeof vi.fn>).mockReturnValue(mockParsedQuery);
    (searchMessages as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: [mockSearchResult], error: null });
    (processResults as ReturnType<typeof vi.fn>).mockReturnValue([mockSearchResult]);
    (summarize as ReturnType<typeof vi.fn>).mockResolvedValue({ success: false, data: null, error: 'Claude error' });

    const { handler } = buildHandler();
    const args = makeEventArgs();
    await handler({ event: args.event, client: args.client } as never);

    expect(args.mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('could not summarize'),
    }));
  });
});
