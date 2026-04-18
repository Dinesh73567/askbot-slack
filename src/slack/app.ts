import express, { type Express } from 'express';
import { App, ExpressReceiver, LogLevel } from '@slack/bolt';
import type { AppConfig } from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import { registerMentionHandler } from './handlers/mention.js';
import { registerDmHandler } from './handlers/dm.js';
import { registerDeleteHandler } from './handlers/delete.js';
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
  // Bolt uses HTTP Events API (not Socket Mode). The receiver exposes an Express
  // router that we mount at /slack so Slack POSTs events to /slack/events.
  const receiver = new ExpressReceiver({
    signingSecret: config.slackSigningSecret,
    endpoints: '/events',
    processBeforeResponse: true,
  });

  const boltApp = new App({
    token: config.slackBotToken,
    receiver,
    logLevel: LOG_LEVEL_MAP[config.logLevel] ?? LogLevel.INFO,
  });

  registerMentionHandler(boltApp, logger);
  registerDmHandler(boltApp, config, logger);
  registerDeleteHandler(boltApp, logger);

  // Combined Express app: OAuth routes + Slack events + health check.
  const expressApp = express();

  // Mount Slack events FIRST, before express.json(). Bolt's receiver needs the raw
  // body to verify the request signature; a prior express.json() would consume it.
  expressApp.use('/slack', receiver.router);

  expressApp.use(express.json());

  const oauthRouter = createOAuthRouter(config, logger);
  expressApp.use('/auth', oauthRouter);

  expressApp.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return { boltApp, expressApp };
}
