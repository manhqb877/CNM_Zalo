import { getRedis } from '../../infrastructure/redis';
import { FriendshipModel } from '../friends/friendship.model';
import { logger } from '../../shared/logger';
import { UserModel } from './user.model';

const PRESENCE_TTL_SECONDS = 60; // 60s TTL, heartbeat refreshes it

export interface PresenceInfo {
  online: boolean;
  lastSeen: string | null;
}

/**
 * Mark user as online (TTL refreshed, lastSeen NOT overwritten on connect).
 * Only set initial lastSeen if it doesn't exist yet.
 */
export async function setPresenceOnline(userId: string): Promise<void> {
  const redis = getRedis();
  const pipeline = redis.pipeline();
  pipeline.setex(`presence:${userId}`, PRESENCE_TTL_SECONDS, 'online');
  // Only set initial lastSeen if user has no record yet (don't overwrite on reconnect)
  pipeline.setnx(`presence:lastSeen:${userId}`, Date.now().toString());
  await pipeline.exec();
}

/**
 * Mark user as offline and record lastSeen timestamp.
 * Called on socket disconnect.
 */
export async function setPresenceOffline(userId: string): Promise<void> {
  const redis = getRedis();
  const now = Date.now();
  const pipeline = redis.pipeline();
  pipeline.del(`presence:${userId}`);
  pipeline.set(`presence:lastSeen:${userId}`, now.toString());
  await pipeline.exec();
}

/**
 * Refresh online TTL without changing lastSeen.
 * Called on heartbeat to keep user online.
 */
export async function refreshPresenceOnline(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.setex(`presence:${userId}`, PRESENCE_TTL_SECONDS, 'online');
}

/**
 * Get presence for a single user.
 */
export async function getUserPresence(userId: string, requesterId?: string): Promise<PresenceInfo> {
  const redis = getRedis();
  const [onlineKey, lastSeenRaw] = await Promise.all([
    redis.get(`presence:${userId}`),
    redis.get(`presence:lastSeen:${userId}`),
  ]);

  const presence: PresenceInfo = {
    online: onlineKey === 'online',
    lastSeen: lastSeenRaw ? new Date(Number(lastSeenRaw)).toISOString() : null,
  };

  if (requesterId && requesterId !== userId) {
    const user = await UserModel.findById(userId).select('showOnlineStatus').lean();
    if (user && user.showOnlineStatus === false) {
      return { online: false, lastSeen: null };
    }
  }

  return presence;
}

/**
 * Get presence for multiple users efficiently using pipeline.
 */
export async function getBulkPresence(
  userIds: string[],
  requesterId?: string,
): Promise<Map<string, PresenceInfo>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return new Map();
  }

  const redis = getRedis();
  const pipeline = redis.pipeline();
  for (const id of uniqueIds) {
    pipeline.get(`presence:${id}`);
    pipeline.get(`presence:lastSeen:${id}`);
  }
  const results = await pipeline.exec();

  const presenceMap = new Map<string, PresenceInfo>();
  let visibilityMap: Map<string, boolean> | null = null;

  if (requesterId) {
    const users = await UserModel.find({ _id: { $in: uniqueIds } })
      .select('showOnlineStatus')
      .lean();
    visibilityMap = new Map<string, boolean>();
    for (const user of users) {
      visibilityMap.set(user._id.toString(), user.showOnlineStatus !== false);
    }
  }

  for (let i = 0; i < uniqueIds.length; i++) {
    const onlineValue = results?.[i * 2]?.[1] as string | null;
    const lastSeenValue = results?.[i * 2 + 1]?.[1] as string | null;
    const targetId = uniqueIds[i]!;
    const visible = !requesterId || requesterId === targetId || (visibilityMap?.get(targetId) ?? true);
    if (!visible) {
      presenceMap.set(targetId, { online: false, lastSeen: null });
      continue;
    }

    presenceMap.set(uniqueIds[i]!, {
      online: onlineValue === 'online',
      lastSeen: lastSeenValue ? new Date(Number(lastSeenValue)).toISOString() : null,
    });
  }

  return presenceMap;
}

/**
 * Get all friend IDs of a user (accepted friendships only).
 * Uses Redis cache with 10-minute TTL.
 */
export async function getFriendIds(userId: string): Promise<string[]> {
  const redis = getRedis();
  const cacheKey = `friends:${userId}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as string[];
    } catch {
      // ignore parse error
    }
  }

  const friendships = await FriendshipModel.find({
    $or: [{ userId }, { friendId: userId }],
    status: 'accepted',
  }).select('userId friendId').lean();

  const friendIds = friendships.map((f) =>
    f.userId === userId ? f.friendId : f.userId
  );

  await redis.setex(cacheKey, 600, JSON.stringify(friendIds));
  return friendIds;
}

/**
 * Invalidate friends cache when friendship changes.
 */
export async function invalidateFriendsCache(userId: string): Promise<void> {
  const redis = getRedis();
  await redis.del(`friends:${userId}`);
}

/**
 * Format lastSeen timestamp into human-readable Vietnamese string.
 */
export function formatLastSeen(lastSeen: string | null): string {
  if (!lastSeen) return 'Chua tung hoat dong';

  const diff = Date.now() - new Date(lastSeen).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Vua xong';
  if (minutes < 60) return `Hoat dong ${minutes} phut truoc`;
  if (hours < 24) return `Hoat dong ${hours} gio truoc`;
  if (days < 7) return `Hoat dong ${days} ngay truoc`;
  return 'Chua tung hoat dong gan day';
}
