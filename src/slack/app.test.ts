import { describe, it, expect, vi } from 'vitest';
import type { AppConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

vi.mock('@slack/bolt', () => {
  const mockApp = {
    event: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return {
    App: vi.fn(() => mockApp),
    LogLevel: { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' },
  };
});

vi.mock('../ai/summarizer.js', () => ({
  createAnthropicClient: vi.fn(() => ({})),
}));

const { createApp } = await import('./app.js');

const mockConfig: AppConfig = Object.freeze({
  slackBotToken: 'xoxb-test-token',
  slackAppToken: 'xapp-test-token',
  slackSigningSecret: 'test-secret',
  anthropicApiKey: 'sk-ant-test',
  claudeModel: 'claude-sonnet-4-20250514',
  logLevel: 'info',
  rateLimitPerUserPerMinute: 5,
});

describe('createApp', () => {
  it('creates an App instance', () => {
    const logger = createLogger('error');
    const app = createApp(mockConfig, logger);
    expect(app).toBeDefined();
    expect(app.start).toBeDefined();
    expect(app.stop).toBeDefined();
  });

  it('registers event handlers', () => {
    const logger = createLogger('error');
    const app = createApp(mockConfig, logger);
    expect(app.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
    expect(app.event).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
