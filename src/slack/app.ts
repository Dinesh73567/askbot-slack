import express, { type Express } from 'express';
import { App, LogLevel } from '@slack/bolt';
import type { AppConfig } from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import { registerMentionHandler } from './handlers/mention.js';
import { registerDmHandler } from './handlers/dm.js';
import { createOAuthRouter } from '../auth/oauth-routes.js';

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

export interface CreatedApp {
  readonly boltApp: App;
  readonly expressApp: Express;
}

export function createApp(config: AppConfig, logger: Logger): CreatedApp {
  // --- Bolt (Socket Mode) ---
  const boltApp = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    logLevel: LOG_LEVEL_MAP[config.logLevel] ?? LogLevel.INFO,
  });

  registerMentionHandler(boltApp, logger);
  registerDmHandler(boltApp, config, logger);

  // --- Express (OAuth routes) ---
  const expressApp = express();
  expressApp.use(express.json());

  // Mount OAuth router under /auth
  const oauthRouter = createOAuthRouter(config, logger);
  expressApp.use('/auth', oauthRouter);

  // Health check
  expressApp.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return { boltApp, expressApp };
}
