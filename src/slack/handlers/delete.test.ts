import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDeleteHandler } from './delete.js';
import type { App } from '@slack/bolt';

vi.mock('../../db/token-store.js', () => ({
  getUserToken: vi.fn(),
}));

vi.mock('@slack/web-api', () => ({
  WebClient: vi.fn().mockImplementation((token: string) => ({
    _token: token,
    chat: {
      delete: vi.fn().mockResolvedValue({}),
    },
  })),
}));

import { getUserToken } from '../../db/token-store.js';
import { WebClient } from '@slack/web-api';

const mockedGetUserToken = vi.mocked(getUserToken);

describe('registerDeleteHandler', () => {
  const mockLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    fatal: vi.fn(),
  };

  let commandHandler: (args: Record<string, unknown>) => Promise<void>;

  beforeEach(() => {
    vi.clearAllMocks();

    mockedGetUserToken.mockResolvedValue({ success: true, data: 'xoxp-user-token', error: null });

    const mockApp = {
      command: vi.fn((name: string, handler: (args: Record<string, unknown>) => Promise<void>) => {
        if (name === '/delete') {
          commandHandler = handler;
        }
      }),
    } as unknown as App;

    registerDeleteHandler(mockApp, mockLogger as never);
  });

  it('registers the /delete command', () => {
    expect(commandHandler).toBeDefined();
  });

  it('acks the command immediately', async () => {
    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn().mockResolvedValue({ messages: [], response_metadata: {} }),
      },
      chat: {
        postEphemeral: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
      },
    };

    await commandHandler({
      ack,
      command: { user_id: 'U123', channel_id: 'D456' },
      client,
    });

    expect(ack).toHaveBeenCalledOnce();
  });

  it('deletes both bot and user messages', async () => {
    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [
            { user: 'BOT123', ts: '1111.1111' },
            { user: 'U123', ts: '2222.2222' },
            { user: 'BOT123', ts: '3333.3333' },
          ],
          response_metadata: {},
        }),
      },
      chat: {
        delete: vi.fn().mockResolvedValue({}),
        postEphemeral: vi.fn().mockResolvedValue({}),
      },
    };

    await commandHandler({
      ack,
      command: { user_id: 'U123', channel_id: 'D456' },
      client,
    });

    // Bot messages deleted via bot client
    expect(client.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '1111.1111' });
    expect(client.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '3333.3333' });

    // User message deleted via user WebClient
    const userClientInstance = vi.mocked(WebClient).mock.results[0]?.value;
    expect(userClientInstance.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '2222.2222' });

    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Deleted 3 messages from this conversation.' }),
    );
  });

  it('only deletes bot messages when no user token available', async () => {
    mockedGetUserToken.mockResolvedValue({ success: true, data: null, error: null });

    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [
            { user: 'BOT123', ts: '1111.1111' },
            { user: 'U123', ts: '2222.2222' },
          ],
          response_metadata: {},
        }),
      },
      chat: {
        delete: vi.fn().mockResolvedValue({}),
        postEphemeral: vi.fn().mockResolvedValue({}),
      },
    };

    await commandHandler({
      ack,
      command: { user_id: 'U123', channel_id: 'D456' },
      client,
    });

    // Only bot message deleted
    expect(client.chat.delete).toHaveBeenCalledTimes(1);
    expect(client.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '1111.1111' });

    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Deleted 1 message from this conversation.' }),
    );
  });

  it('handles pagination', async () => {
    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn()
          .mockResolvedValueOnce({
            messages: [{ user: 'BOT123', ts: '1111.1111' }],
            response_metadata: { next_cursor: 'cursor123' },
          })
          .mockResolvedValueOnce({
            messages: [{ user: 'U123', ts: '2222.2222' }],
            response_metadata: {},
          }),
      },
      chat: {
        delete: vi.fn().mockResolvedValue({}),
        postEphemeral: vi.fn().mockResolvedValue({}),
      },
    };

    await commandHandler({
      ack,
      command: { user_id: 'U123', channel_id: 'D456' },
      client,
    });

    expect(client.conversations.history).toHaveBeenCalledTimes(2);
    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Deleted 2 messages from this conversation.' }),
    );
  });

  it('continues when individual deletion fails', async () => {
    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [
            { user: 'BOT123', ts: '1111.1111' },
            { user: 'BOT123', ts: '2222.2222' },
          ],
          response_metadata: {},
        }),
      },
      chat: {
        delete: vi.fn()
          .mockRejectedValueOnce(new Error('message_not_found'))
          .mockResolvedValueOnce({}),
        postEphemeral: vi.fn().mockResolvedValue({}),
      },
    };

    await commandHandler({
      ack,
      command: { user_id: 'U123', channel_id: 'D456' },
      client,
    });

    expect(client.chat.delete).toHaveBeenCalledTimes(2);
    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Deleted 1 message from this conversation.' }),
    );
  });
});
