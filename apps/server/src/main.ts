import path from 'path';
import dotenv from 'dotenv';

// Tìm .env từ root monorepo (chạy từ apps/server/ nên cần đi lên 3 cấp)
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import http from 'http';
import { createApp } from './app';
import { connectDatabase } from './infrastructure/database';
import { connectRedis } from './infrastructure/redis';
import { connectKafka } from './infrastructure/kafka';
import { initSocketGateway } from './socket/gateway';
import { startMessageWorker, stopMessageWorker } from './workers/message.worker';
import { startNotificationWorker, stopNotificationWorker } from './workers/notification.worker';
import { startCatchupWorker, stopCatchupWorker } from './modules/ai/catchup/catchup.worker';
import { startAssistantWorker, stopAssistantWorker } from './modules/ai/workers/ai-assistant.worker';
import { startMessageEmbeddingWorker, stopMessageEmbeddingWorker } from './modules/ai/embeddings/message-embedding.worker';
import { runPgvectorMigration, isNeonAvailable } from './infrastructure/neon';
import { logger } from './shared/logger';

const originalEmitWarning = process.emitWarning.bind(process) as (...args: any[]) => void;
process.emitWarning = ((warning: string | Error, ...args: any[]) => {
  const typeOrOptions = args[0] as string | NodeJS.EmitWarningOptions | undefined;
  const warningName = warning instanceof Error
    ? warning.name
    : typeof typeOrOptions === 'string'
      ? typeOrOptions
      : typeOrOptions?.type;
  const warningMessage = warning instanceof Error ? warning.message : warning;

  if (
    warningName === 'TimeoutNegativeWarning'
    && warningMessage.includes('is a negative number')
  ) {
    return;
  }

  originalEmitWarning(warning, ...args);
}) as typeof process.emitWarning;

const PORT = parseInt(process.env['PORT'] ?? '3000', 10);
const HOST = process.env['HOST'];

async function bootstrap(): Promise<void> {
  // Kết nối infrastructure
  await connectDatabase();
  await connectRedis();

  // Neon PostgreSQL + pgvector (AI features) – optional, skip if not configured
  if (isNeonAvailable()) {
    await runPgvectorMigration().catch((err: unknown) => {
      logger.warn('[Neon] pgvector migration failed – AI vector features disabled', err);
    });
  } else {
    logger.warn('[Neon] NEON_DATABASE_URL not set – AI vector features disabled');
  }

  // Kafka là optional khi dev local – bật bằng KAFKA_ENABLED=true trong .env
  if (process.env['KAFKA_ENABLED'] === 'true') {
    await connectKafka();
    // Task 6.2: Start Kafka consumer worker
    void startMessageWorker().catch((err: unknown) => {
      logger.error('Message worker failed', err);
    });
    void startNotificationWorker().catch((err: unknown) => {
      logger.error('Notification worker failed', err);
    });
    if (isNeonAvailable()) {
      void startMessageEmbeddingWorker().catch((err: unknown) => {
        logger.error('Message embedding worker failed to start (non-fatal)', err);
      });
    }
    // AI Catchup + AI Assistant Box
    if (process.env['AI_CATCHUP_ENABLED'] !== 'false') {
      void startCatchupWorker().catch((err: unknown) => {
        logger.error('AI Catch-up worker failed to start (non-fatal)', err);
      });
      // AI Assistant Box worker (Phase 1)
      void startAssistantWorker().catch((err: unknown) => {
        logger.error('AI Assistant worker failed to start (non-fatal)', err);
      });
    }
  } else {
    logger.warn('Kafka bị tắt (KAFKA_ENABLED != true). Workers sẽ không chạy.');
  }

  // Tạo Express app và HTTP server
  const app = createApp();
  const httpServer = http.createServer(app);

  // Khởi tạo Socket.IO gateway
  initSocketGateway(httpServer);

  // Bắt đầu lắng nghe request
  const onListen = (): void => {
    const address = HOST ? `${HOST}:${PORT}` : `${PORT}`;
    logger.info(`Zync server started at ${address} [${process.env['NODE_ENV']}]`);
  };
  if (HOST) {
    httpServer.listen(PORT, HOST, onListen);
  } else {
    httpServer.listen(PORT, onListen);
  }

  // Tắt server an toàn khi nhận signal
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Nhận tín hiệu ${signal}, đang tắt server...`);
    
    // Task 6.2: Stop message worker gracefully
    if (process.env['KAFKA_ENABLED'] === 'true') {
      await stopMessageWorker();
      await stopNotificationWorker();
      await stopMessageEmbeddingWorker();
      await stopCatchupWorker();
      await stopAssistantWorker();
    }
    
    httpServer.close(() => {
      logger.info('HTTP server đã đóng');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
}

bootstrap().catch((err: unknown) => {
  logger.error('Failed to start server', err);
  process.exit(1);
});
