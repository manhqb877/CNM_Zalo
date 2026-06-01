/**
 * AI-specific rate limiter – Redis sliding window.
 *
 * Key: `ai_rate:{userId}`
 * Default limit: 10 requests / 60 seconds per user (configurable via AI_RATE_LIMIT_PER_MINUTE).
 */

import { getRedis } from '../../../infrastructure/redis';
import { logger } from '../../../shared/logger';

const WINDOW_SECONDS = 60;
const DEFAULT_LIMIT = parseInt(process.env['AI_RATE_LIMIT_PER_MINUTE'] ?? '10', 10);

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetInSeconds: number;
}

/**
 * Check whether the given userId may make another AI request.
 *
 * Uses a Redis Sorted Set (ZSET) sliding-window:
 *   1. Remove entries older than (now - windowSeconds)
 *   2. Add current timestamp
 *   3. Count total entries
 *   4. Allow if count <= limit
 *
 * @param userId – MongoDB string ObjectId
 * @param limit  – override the default per-minute cap (useful for tests)
 */
export async function checkAIRateLimit(
  userId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<RateLimitResult> {
  const redis = getRedis();
  const key = `ai_rate:${userId}`;
  const now = Date.now();
  const windowMs = WINDOW_SECONDS * 1000;
  const cutoff = now - windowMs;

  const pipe = redis.pipeline();
  pipe.zremrangebyscore(key, '-inf', cutoff);      // 1. prune old
  pipe.zadd(key, now, `${now}-${Math.random()}`);  // 2. add this request
  pipe.zcard(key);                                  // 3. count
  pipe.expire(key, WINDOW_SECONDS + 1);             // 4. TTL safety
  const results = await pipe.exec();

  const count = (results?.[2]?.[1] as number) ?? 0;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);

  if (!allowed) {
    logger.warn('[AIRateLimit] User exceeded AI rate limit', { userId, count, limit });
  }

  return {
    allowed,
    remaining,
    resetInSeconds: WINDOW_SECONDS,
  };
}

/**
 * Express middleware factory for AI route rate limiting.
 * Expects `req.user.id` to be set by the auth middleware upstream.
 */
export function aiRateLimitMiddleware(limit: number = DEFAULT_LIMIT) {
  return async (
    req: { user?: { id?: string } },
    res: { status: (c: number) => { json: (b: unknown) => void } },
    next: () => void,
  ) => {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    const result = await checkAIRateLimit(userId, limit);
    if (!result.allowed) {
      res.status(429).json({
        success: false,
        error: `AI rate limit exceeded. ${result.remaining} requests remaining in this window.`,
        retryAfterSeconds: result.resetInSeconds,
      });
      return;
    }

    next();
  };
}
