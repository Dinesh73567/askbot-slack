import { describe, it, expect, vi } from 'vitest';
import type { AppConfig } from '../types/index.js';
import { createLogger } from '../utils/logger.js';

vi.mock('@slack/bolt', () => {
  const mockApp = {
    event: vi.fn(),
    command: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
  };
  return {
    App: vi.fn(() => mockApp),
    LogLevel: { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' },
  };
});

// Mock auth routes so Express does not try to instantiate real Prisma
vi.mock('../auth/oauth-routes.js', async () => {
  const { Router } = await import('express');
  return {
    createOAuthRouter: vi.fn(() => Router()),
  };
});

const { createApp } = await import('./app.js');

const mockConfig: AppConfig = Object.freeze({
  slackBotToken: 'xoxb-test-token',
  slackAppToken: 'xapp-test-token',
  slackSigningSecret: 'test-secret',
  slackClientId: 'client123',
  slackClientSecret: 'clientsecret',
  anthropicApiKey: 'sk-ant-test',
  claudeModel: 'claude-sonnet-4-20250514',
  logLevel: 'info',
  rateLimitPerUserPerMinute: 5,
  appUrl: 'https://example.com',
  port: 3000,
  databaseUrl: 'file:./dev.db',
  databaseProvider: 'sqlite',
});

describe('createApp', () => {
  it('returns boltApp and expressApp', () => {
    const logger = createLogger('error');
    const { boltApp, expressApp } = createApp(mockConfig, logger);
    expect(boltApp).toBeDefined();
    expect(boltApp.start).toBeDefined();
    expect(boltApp.stop).toBeDefined();
    expect(expressApp).toBeDefined();
  });

  it('registers the app_mention event handler on boltApp', () => {
    const logger = createLogger('error');
    const { boltApp } = createApp(mockConfig, logger);
    expect(boltApp.event).toHaveBeenCalledWith('app_mention', expect.any(Function));
  });

  it('registers the message event handler on boltApp', () => {
    const logger = createLogger('error');
    const { boltApp } = createApp(mockConfig, logger);
    expect(boltApp.event).toHaveBeenCalledWith('message', expect.any(Function));
  });
});
