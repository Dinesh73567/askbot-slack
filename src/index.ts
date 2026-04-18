import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';

// TODO: Import and wire up createApp from ./slack/app.js

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info('AskBot starting...');

  // TODO: Create Bolt app and start
  // const app = createApp(config, logger);
  // await app.start();

  logger.info('AskBot is running! Waiting for messages...');

  const shutdown = async () => {
    logger.info('Shutting down...');
    // TODO: await app.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('Failed to start AskBot:', error);
  process.exit(1);
});
