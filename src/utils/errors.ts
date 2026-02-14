import { logger } from './logger.js';

export function setupErrorHandlers(): void {
  process.on('uncaughtException', (error: Error) => {
    logger.error({ error }, 'Uncaught exception occurred');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error({ reason }, 'Unhandled promise rejection');
    process.exit(1);
  });
}
