import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './slack/app.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info('AskBot starting...');

  const app = createApp(config, logger);
  await app.start();

  logger.info('AskBot is running! Waiting for messages...');

  const shutdown = async () => {
    logger.info('Shutting down...');
    await app.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  const logger = createLogger('error');
  logger.error({ err: error }, 'Failed to start AskBot');
  process.exit(1);
});
