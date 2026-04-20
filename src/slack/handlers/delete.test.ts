import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerDeleteHandler } from './delete.js';
import type { App } from '@slack/bolt';

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

  it('deletes only bot messages and skips user messages', async () => {
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

    // Only bot messages deleted
    expect(client.chat.delete).toHaveBeenCalledTimes(2);
    expect(client.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '1111.1111' });
    expect(client.chat.delete).toHaveBeenCalledWith({ channel: 'D456', ts: '3333.3333' });

    expect(client.chat.postEphemeral).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Deleted 2 bot messages from this conversation.' }),
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
            messages: [{ user: 'BOT123', ts: '2222.2222' }],
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
    expect(client.chat.delete).toHaveBeenCalledTimes(2);
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
      expect.objectContaining({ text: 'Deleted 1 bot message from this conversation.' }),
    );
  });

  it('skips messages with no timestamp', async () => {
    const ack = vi.fn();
    const client = {
      auth: { test: vi.fn().mockResolvedValue({ user_id: 'BOT123' }) },
      conversations: {
        history: vi.fn().mockResolvedValue({
          messages: [
            { user: 'BOT123' },
            { user: 'BOT123', ts: '1111.1111' },
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

    expect(client.chat.delete).toHaveBeenCalledTimes(1);
  });
});
