import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './slack/app.js';
import { disconnectPrisma } from './db/token-store.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info('AskBot starting...');

  const { expressApp } = createApp(config, logger);

  // Railway (and similar PaaS) injects PORT at runtime; config.port is the fallback.
  const port = parseInt(process.env.PORT ?? String(config.port), 10);
  const httpServer = expressApp.listen(port, () => {
    logger.info({ port }, 'AskBot listening (HTTP Events API + OAuth + health)');
  });

  const shutdown = async () => {
    logger.info('Shutting down...');
    httpServer.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      }
    });
    await disconnectPrisma();
    logger.info('Shutdown complete');
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
