import { describe, it, expect, vi } from 'vitest';
import { registerDmHandler } from './dm.js';
import { createLogger } from '../../utils/logger.js';

describe('registerDmHandler', () => {
  it('registers a message event handler', () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');

    registerDmHandler(mockApp as never, logger);

    expect(mockApp.event).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('responds to DM messages', async () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');

    registerDmHandler(mockApp as never, logger);

    const handler = mockApp.event.mock.calls[0]?.[1] as (args: Record<string, unknown>) => Promise<void>;
    const mockPostMessage = vi.fn().mockResolvedValue({});
    const event = {
      channel_type: 'im',
      text: 'what are my tasks today?',
      user: 'U12345',
      channel: 'D12345',
    };

    await handler({
      event,
      client: { chat: { postMessage: mockPostMessage } },
    });

    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'D12345',
      text: 'I heard: what are my tasks today?',
    });
  });

  it('ignores non-DM messages', async () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');

    registerDmHandler(mockApp as never, logger);

    const handler = mockApp.event.mock.calls[0]?.[1] as (args: Record<string, unknown>) => Promise<void>;
    const mockPostMessage = vi.fn().mockResolvedValue({});
    const event = {
      channel_type: 'channel',
      text: 'hello',
      user: 'U12345',
      channel: 'C12345',
    };

    await handler({
      event,
      client: { chat: { postMessage: mockPostMessage } },
    });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });

  it('ignores messages with subtypes (edits, bot messages, etc)', async () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');

    registerDmHandler(mockApp as never, logger);

    const handler = mockApp.event.mock.calls[0]?.[1] as (args: Record<string, unknown>) => Promise<void>;
    const mockPostMessage = vi.fn().mockResolvedValue({});
    const event = {
      channel_type: 'im',
      subtype: 'message_changed',
      text: 'edited',
      user: 'U12345',
      channel: 'D12345',
    };

    await handler({
      event,
      client: { chat: { postMessage: mockPostMessage } },
    });

    expect(mockPostMessage).not.toHaveBeenCalled();
  });
});
