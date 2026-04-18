import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { createLogger } from './utils/logger.js';
import { createApp } from './slack/app.js';
import { disconnectPrisma } from './db/token-store.js';

async function main() {
  const config = loadConfig();
  const logger = createLogger(config.logLevel);

  logger.info('AskBot starting...');

  const { boltApp, expressApp } = createApp(config, logger);

  // Start Express FIRST so the health check responds even if Slack Socket Mode hangs.
  // Railway (and similar PaaS) injects PORT at runtime; config.port is the fallback.
  const port = parseInt(process.env.PORT ?? String(config.port), 10);
  const httpServer = expressApp.listen(port, () => {
    logger.info({ port }, 'Express HTTP server listening');
  });

  // Start Bolt Socket Mode in the background. Log failures but do not block the HTTP server.
  boltApp
    .start()
    .then(() => logger.info('Bolt Socket Mode connected'))
    .catch((err) => logger.error({ err }, 'Bolt Socket Mode failed to start'));

  logger.info('AskBot is running! Waiting for messages...');

  const shutdown = async () => {
    logger.info('Shutting down...');

    // Stop accepting new HTTP connections
    httpServer.close((err) => {
      if (err) {
        logger.error({ err }, 'Error closing HTTP server');
      }
    });

    // Stop Bolt
    await boltApp.stop();

    // Disconnect Prisma
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
