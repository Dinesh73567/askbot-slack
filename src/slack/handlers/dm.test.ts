import { describe, it, expect, vi } from 'vitest';

vi.mock('./pipeline.js', () => ({
  handleQuestion: vi.fn().mockResolvedValue({
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'test answer' } }],
    text: 'test answer',
  }),
}));

vi.mock('../../formatter/slack-blocks.js', () => ({
  formatThinkingResponse: vi.fn(() => 'Searching...'),
}));

const { registerDmHandler } = await import('./dm.js');
import { createLogger } from '../../utils/logger.js';

describe('registerDmHandler', () => {
  it('registers a message event handler', () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');
    const mockAnthropic = {} as never;

    registerDmHandler(mockApp as never, mockAnthropic, 'claude-sonnet-4-20250514', logger);

    expect(mockApp.event).toHaveBeenCalledWith('message', expect.any(Function));
  });

  it('responds to DM messages', async () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');
    const mockAnthropic = {} as never;

    registerDmHandler(mockApp as never, mockAnthropic, 'claude-sonnet-4-20250514', logger);

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

    expect(mockPostMessage).toHaveBeenCalledTimes(2);
    expect(mockPostMessage).toHaveBeenCalledWith({
      channel: 'D12345',
      text: 'Searching...',
    });
  });

  it('ignores non-DM messages', async () => {
    const mockApp = { event: vi.fn() };
    const logger = createLogger('error');
    const mockAnthropic = {} as never;

    registerDmHandler(mockApp as never, mockAnthropic, 'claude-sonnet-4-20250514', logger);

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
});
