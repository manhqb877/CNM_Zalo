import express, { type Application, type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { authRouter } from './modules/auth/auth.routes';
import { usersRouter } from './modules/users/users.routes';
import { friendsRouter } from './modules/friends/friends.routes';
import { groupsRouter } from './modules/groups/groups.routes';
import { conversationsRouter } from './modules/conversations/conversations.routes';
import { messagesRouter } from './modules/messages/messages.routes';
import { uploadRouter } from './modules/upload/upload.routes';
import { notificationsRouter } from './modules/notifications/notifications.routes';
import { aiRouter } from './modules/ai/ai.routes';
import { callsRouter } from './modules/calls/calls.routes';
import { stickersRouter } from './modules/stickers/sticker.routes';
import { postsRouter } from './modules/posts/posts.routes';
import { logger } from './shared/logger';
import { renderMetrics } from './shared/metrics';
import { globalErrorHandler } from './shared/middleware/error-handler.middleware';

export function createApp(): Application {
  const app = express();
  const configuredCorsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isLanMode = process.env['NODE_ENV'] !== 'production'
    && process.env['HOST'] === '0.0.0.0';

  // Middleware bảo mật
  app.use(helmet());
  app.use(cors({
    origin: isLanMode ? true : configuredCorsOrigins,
    credentials: true,
  }));

  // Phân tích request body
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  // Logging HTTP request
  if (process.env['NODE_ENV'] !== 'test') {
    app.use(morgan('combined', {
      stream: { write: (msg: string) => logger.http(msg.trim()) },
      skip: (req, res) => res.statusCode < 400 && req.url !== '/health', // Only log errors/warnings (>= 400) to keep console clean
    }));
  }

  // Endpoint kiểm tra sức khỏe server
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.get('/metrics', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const metrics = await renderMetrics();
      res.setHeader('Content-Type', metrics.contentType);
      res.send(metrics.body);
    } catch (err) {
      next(err);
    }
  });

  // Đăng ký toàn bộ routes
  app.use('/api/auth', authRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/groups', groupsRouter);
  app.use('/api/conversations', conversationsRouter);
  app.use('/api/messages', messagesRouter);
  app.use('/api/upload', uploadRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/ai', aiRouter);
  app.use('/api/calls', callsRouter);
  app.use('/api/stickers', stickersRouter);
  app.use('/api/posts', postsRouter);

  // Xử lý route không tồn tại
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { message: 'Not found', code: 'NOT_FOUND' },
      statusCode: 404,
      timestamp: new Date().toISOString(),
    });
  });

  // ✅ Global Error Handler - chuẩn hóa format lỗi toàn hệ thống
  app.use(globalErrorHandler);

  return app;
}
