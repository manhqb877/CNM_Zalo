import Redis from 'ioredis';
import { logger } from '../shared/logger';

let redisClient: Redis | null = null;

export async function connectRedis(): Promise<void> {
  const url = process.env['REDIS_URL'];
  if (!url) {
    throw new Error('REDIS_URL is required. Please set REDIS_URL in your .env');
  }

  redisClient = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryStrategy: (times) => Math.min(times * 200, 2000),
  });

  redisClient.on('connect', () => logger.info('Redis connected'));
  redisClient.on('error', (err) => logger.error('Redis error', err));
  redisClient.on('close', () => logger.warn('Redis connection closed'));

  await redisClient.connect();
}

export function getRedis(): Redis {
  if (!redisClient) throw new Error('Redis client not initialized. Call connectRedis() first.');
  return redisClient;
}

/** Tạo connection Redis riêng cho subscriber – Pub/Sub yêu cầu connection độc lập, không dùng chung với publisher */
export function createRedisDuplicate(): Redis {
  return getRedis().duplicate();
}

// ─── Idempotency Key Management ───

/**
 * Check if idempotency key exists and return cached message data
 * @param key Idempotency key
 * @returns Cached message data or null if not found
 */
export async function checkIdempotencyKey(key: string): Promise<Record<string, unknown> | null> {
  const redis = getRedis();
  const cached = await redis.get(`idempotency:${key}`);
  return cached ? (JSON.parse(cached) as Record<string, unknown>) : null;
}

/**
 * Set idempotency key with message data (TTL 5 minutes)
 * @param key Idempotency key
 * @param messageData Message data to cache
 * @param ttl Time to live in seconds (default 300 = 5 minutes)
 */
export async function setIdempotencyKey(
  key: string,
  messageData: Record<string, unknown>,
  ttl: number = 300,
): Promise<void> {
  const redis = getRedis();
  await redis.setex(`idempotency:${key}`, ttl, JSON.stringify(messageData));
}

// ─── Typing Indicator Management ───

/**
 * Set typing indicator for a user in a conversation (TTL 3 seconds)
 * @param conversationId Conversation ID
 * @param userId User ID
 * @param ttl Time to live in seconds (default 3)
 */
export async function setTypingIndicator(
  conversationId: string,
  userId: string,
  ttl: number = 3,
): Promise<void> {
  const redis = getRedis();
  await redis.setex(`typing:${conversationId}:${userId}`, ttl, '1');
}

/**
 * Remove typing indicator for a user in a conversation
 * @param conversationId Conversation ID
 * @param userId User ID
 */
export async function removeTypingIndicator(
  conversationId: string,
  userId: string,
): Promise<void> {
  const redis = getRedis();
  await redis.del(`typing:${conversationId}:${userId}`);
}

/**
 * Get list of users currently typing in a conversation
 * @param conversationId Conversation ID
 * @returns Array of user IDs who are typing
 */
export async function getTypingUsers(conversationId: string): Promise<string[]> {
  const redis = getRedis();
  const keys = await redis.keys(`typing:${conversationId}:*`);
  
  // Extract userId from keys like "typing:{convId}:{userId}"
  return keys.map((key) => {
    const parts = key.split(':');
    return parts[2] ?? '';
  }).filter(Boolean);
}

// ─── Online Status Management ───

/**
 * Set user as online with current timestamp
 * @param userId User ID
 */
export async function setUserOnline(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.hset('online_users', userId, Date.now().toString());
}

/**
 * Remove user from online status
 * @param userId User ID
 */
export async function removeUserOnline(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.hdel('online_users', userId);
}

/**
 * Get user's online status (timestamp of when they came online)
 * @param userId User ID
 * @returns Timestamp string or null if user is offline
 */
export async function getUserOnlineStatus(userId: string): Promise<string | null> {
  const redis = getRedis();
  return redis.hget('online_users', userId);
}

/**
 * Get all online users with their last seen timestamp
 * @returns Object with userId as key and timestamp as value
 */
export async function getAllOnlineUsers(): Promise<Record<string, string>> {
  const redis = getRedis();
  return redis.hgetall('online_users');
}

// ─── Rate Limiting (Sliding Window) ───

// Normal mode: Kafka batch insert working (300 msgs/500ms)
const MSG_RATE_WINDOW_MS_NORMAL = 500;
const MSG_RATE_LIMIT_NORMAL = 300;

// Fallback mode: Direct insert when Kafka fails (200 msgs/500ms)
const MSG_RATE_WINDOW_MS_FALLBACK = 500;
const MSG_RATE_LIMIT_FALLBACK = 200;

/**
 * Check if user has exceeded message rate limit
 * Uses Redis Sorted Set (ZSET) with sliding window algorithm
 * @param userId User ID
 * @param isFallbackMode Whether Kafka is in failure/fallback mode
 * @returns true if within limit, false if rate limit exceeded
 */
export async function checkMessageRateLimit(userId: string, isFallbackMode: boolean = false): Promise<boolean> {
  const redis = getRedis();
  const rateLimitKey = `msg_rate:${userId}`;
  const now = Date.now();
  
  const windowMs = isFallbackMode ? MSG_RATE_WINDOW_MS_FALLBACK : MSG_RATE_WINDOW_MS_NORMAL;
  const limit = isFallbackMode ? MSG_RATE_LIMIT_FALLBACK : MSG_RATE_LIMIT_NORMAL;

  // Pipeline: clean old entries → add new → count → set TTL
  const pipe = redis.pipeline();
  pipe.zremrangebyscore(rateLimitKey, '-inf', now - windowMs); // Remove old entries
  pipe.zadd(rateLimitKey, now, `${now}`); // Add current timestamp
  pipe.zcard(rateLimitKey); // Count total entries
  pipe.expire(rateLimitKey, 2); // Set TTL to 2s
  const results = await pipe.exec();
  
  const count = (results?.[2]?.[1] as number) ?? 0;
  return count <= limit;
}
