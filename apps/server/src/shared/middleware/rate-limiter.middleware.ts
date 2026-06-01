import rateLimit from 'express-rate-limit';
import { type Request, type Response, type NextFunction } from 'express';
import { getRedis } from '../../infrastructure/redis';
import { TooManyRequestsError } from '../errors';
import { type AuthRequest } from './auth.middleware';

function parseEnvPositiveInt(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
}

const DEFAULT_OTP_RATE_LIMIT_WINDOW_SECONDS = 60 * 60;
const DEFAULT_OTP_RATE_LIMIT_MAX = process.env['NODE_ENV'] === 'production' ? 3 : 100;

const OTP_RATE_LIMIT_WINDOW_SECONDS =
  parseEnvPositiveInt(process.env['OTP_RATE_LIMIT_WINDOW_SECONDS'])
  ?? DEFAULT_OTP_RATE_LIMIT_WINDOW_SECONDS;

const OTP_RATE_LIMIT_MAX =
  parseEnvPositiveInt(process.env['OTP_RATE_LIMIT_MAX'])
  ?? DEFAULT_OTP_RATE_LIMIT_MAX;

function normalizeOtpIdentifier(identifier: string): string {
  return identifier.trim().toLowerCase();
}

function extractOtpIdentifierFromBody(body: unknown): string | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as {
    identifier?: unknown;
    email?: unknown;
  };

  const rawIdentifier =
    typeof payload.identifier === 'string'
      ? payload.identifier
      : typeof payload.email === 'string'
        ? payload.email
        : null;

  if (!rawIdentifier) {
    return null;
  }

  return normalizeOtpIdentifier(rawIdentifier);
}

async function increaseCounterWithTtl(key: string): Promise<number> {
  const redis = getRedis();
  const result = await redis.multi().incr(key).ttl(key).exec();
  const count = Number(result?.[0]?.[1] ?? 0);
  const ttl = Number(result?.[1]?.[1] ?? -1);

  if (ttl < 0) {
    await redis.expire(key, OTP_RATE_LIMIT_WINDOW_SECONDS);
  }

  return count;
}

/**
 * Rate limit OTP: 3 lần/giờ theo IP hoặc identifier.
 * Nếu vượt một trong hai ngưỡng thì chặn request.
 */
export async function otpRateLimiter(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const ip = req.ip ?? 'unknown';
    const identifier = extractOtpIdentifierFromBody(req.body);
    const retryAfterMinutes = Math.ceil(OTP_RATE_LIMIT_WINDOW_SECONDS / 60);

    const ipKey = `otp_rl:ip:${ip}`;
    const ipCount = await increaseCounterWithTtl(ipKey);
    if (ipCount > OTP_RATE_LIMIT_MAX) {
      return next(
        new TooManyRequestsError(
          `OTP rate limit exceeded for this IP. Max ${OTP_RATE_LIMIT_MAX} requests/${retryAfterMinutes} minutes.`,
        ),
      );
    }

    if (identifier) {
      const identifierKey = `otp_rl:id:${identifier}`;
      const identifierCount = await increaseCounterWithTtl(identifierKey);
      if (identifierCount > OTP_RATE_LIMIT_MAX) {
        return next(
          new TooManyRequestsError(
            `OTP rate limit exceeded for this email. Max ${OTP_RATE_LIMIT_MAX} requests/${retryAfterMinutes} minutes.`,
          ),
        );
      }
    }

    next();
  } catch {
    // Fail-open để tránh chặn đăng nhập hàng loạt nếu Redis gặp sự cố
    next();
  }
}

/** Rate limit upload pre-signed URL: 10 lần/phút/user */
export const uploadRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => req.headers['x-user-id'] as string ?? req.ip ?? 'unknown',
  message: { success: false, error: 'Upload rate limit exceeded. Try again in 1 minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limit kết bạn: 20 lần/giờ/user */
export const friendRequestRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? 'unknown',
  message: { success: false, error: 'Friend request rate limit exceeded. Try again in 1 hour.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Rate limit chung: 100 lần/phút/IP */
export const generalRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests. Slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
