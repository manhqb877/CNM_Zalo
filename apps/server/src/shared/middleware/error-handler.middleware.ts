import { type Request, type Response, type NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors/app-error';
import { logger } from '../logger';

/**
 * Cấu trúc response lỗi thống nhất
 * Tất cả errors trong hệ thống PHẢI trả về format này.
 */
export interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    details?: unknown;
  };
  statusCode: number;
  timestamp: string;
  path?: string;
}

/**
 * Global Error Handler Middleware (Express 4.x)
 * 
 * Xử lý các loại lỗi:
 * 1. AppError (domain errors): BadRequestError, NotFoundError, ...
 * 2. ZodError (validation errors): Schema validation failures
 * 3. Mongoose errors: Duplicate key (11000), Cast errors
 * 4. JWT errors: Invalid/expired tokens
 * 5. Unknown errors: 500 fallback
 */
export function globalErrorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const timestamp = new Date().toISOString();
  const path = req.path;

  // ─── 1. Domain Errors (AppError và các subclass) ─────────────────────────────
  if (err instanceof AppError) {
    logger.warn(`[AppError] ${err.name}: ${err.message}`, {
      statusCode: err.statusCode,
      code: err.code,
      path,
    });

    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
      statusCode: err.statusCode,
      timestamp,
      path,
    } satisfies ErrorResponse);
    return;
  }

  // ─── 2. Zod Validation Errors ────────────────────────────────────────────────
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn('[ZodError] Validation failed', { details, path });

    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details,
      },
      statusCode: 400,
      timestamp,
      path,
    } satisfies ErrorResponse);
    return;
  }

  // ─── 3. Mongoose Errors ───────────────────────────────────────────────────────
  if (err instanceof Error) {
    // Duplicate key (MongoServerError code 11000)
    if ((err as any).code === 11000) {
      const keyValue = (err as any).keyValue ?? {};
      const field = Object.keys(keyValue)[0] ?? 'field';

      logger.warn(`[MongoError] Duplicate key: ${field}`, { path });

      res.status(409).json({
        success: false,
        error: {
          message: `${field} already exists`,
          code: 'DUPLICATE_KEY',
        },
        statusCode: 409,
        timestamp,
        path,
      } satisfies ErrorResponse);
      return;
    }

    // Mongoose Cast Error (invalid ObjectId)
    if (err.name === 'CastError') {
      res.status(400).json({
        success: false,
        error: {
          message: 'Invalid ID format',
          code: 'INVALID_ID',
        },
        statusCode: 400,
        timestamp,
        path,
      } satisfies ErrorResponse);
      return;
    }

    // JWT Errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      res.status(401).json({
        success: false,
        error: {
          message: err.name === 'TokenExpiredError' ? 'Token has expired' : 'Invalid token',
          code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN',
        },
        statusCode: 401,
        timestamp,
        path,
      } satisfies ErrorResponse);
      return;
    }
  }

  // ─── 5. Unknown / Unexpected Errors ─────────────────────────────────────────
  logger.error('[UnhandledError] An unexpected error occurred', {
    error: err,
    path,
    stack: err instanceof Error ? err.stack : undefined,
  });

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_ERROR',
    },
    statusCode: 500,
    timestamp,
    path,
  } satisfies ErrorResponse);
}
