import { App, LogLevel } from '@slack/bolt';
import type { AppConfig } from '../types/index.js';
import type { Logger } from '../utils/logger.js';
import { registerMentionHandler } from './handlers/mention.js';
import { registerDmHandler } from './handlers/dm.js';

const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  debug: LogLevel.DEBUG,
  info: LogLevel.INFO,
  warn: LogLevel.WARN,
  error: LogLevel.ERROR,
};

export function createApp(config: AppConfig, logger: Logger): App {
  const app = new App({
    token: config.slackBotToken,
    appToken: config.slackAppToken,
    signingSecret: config.slackSigningSecret,
    socketMode: true,
    logLevel: LOG_LEVEL_MAP[config.logLevel] ?? LogLevel.INFO,
  });

  registerMentionHandler(app, logger);
  registerDmHandler(app, logger);

  return app;
}
