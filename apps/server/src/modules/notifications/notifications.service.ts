import { NotificationModel, type INotification, type NotificationType } from './notification.model';
import { NotificationPreferenceModel, type INotificationPreference } from './notification-preference.model';
import { produceMessage, KAFKA_TOPICS } from '../../infrastructure/kafka';
import { BadRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { UserModel } from '../users/user.model';

// ─── Cursor helpers ───

function buildCursor(item: INotification): string {
  return Buffer.from(`${item.createdAt.toISOString()}|${item._id.toString()}`).toString('base64');
}

function parseCursor(cursor: string): { createdAt: Date; id: string } {
  const decoded = Buffer.from(cursor, 'base64').toString('utf8');
  const [createdAtRaw, id] = decoded.split('|');

  if (!createdAtRaw || !id) {
    throw new BadRequestError('Invalid cursor');
  }

  const createdAt = new Date(createdAtRaw);
  if (Number.isNaN(createdAt.getTime())) {
    throw new BadRequestError('Invalid cursor');
  }

  return { createdAt, id };
}

// ─── C1.1 – Create notification ───

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, string>,
  conversationId?: string,
  fromUserId?: string,
): Promise<INotification> {
  return NotificationModel.create({
    userId,
    type,
    title,
    body,
    data,
    conversationId,
    fromUserId,
    read: false,
  });
}

// ─── C1.2 – Produce Kafka notification event ───

export interface NotificationEventPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
  createAt?: Date;
}

export async function produceNotificationEvent(payload: NotificationEventPayload): Promise<void> {
  try {
    await produceMessage(KAFKA_TOPICS.NOTIFICATIONS, payload.userId, payload as unknown as Record<string, unknown>);
  } catch (err) {
    logger.error('Failed to produce notification event', err);
  }
}

// ─── C1.3 – Get notifications (cursor pagination) ───

export interface GetNotificationsResult {
  notifications: INotification[];
  nextCursor: string | null;
}

export async function getNotifications(
  userId: string,
  cursor?: string,
  limit: number = 20,
): Promise<GetNotificationsResult> {
  const query: Record<string, unknown> = { userId };

  if (cursor) {
    const parsed = parseCursor(cursor);
    query['$or'] = [
      { createdAt: { $lt: parsed.createdAt } },
      { createdAt: parsed.createdAt, _id: { $lt: parsed.id } },
    ];
  }

  const rows = await NotificationModel.find(query)
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? buildCursor(notifications[notifications.length - 1]!) : null;

  return { notifications, nextCursor };
}

// ─── C1.4 – Mark as read (batch) ───

export async function markAsRead(userId: string, notificationIds: string[]): Promise<number> {
  const result = await NotificationModel.updateMany(
    { _id: { $in: notificationIds }, userId, read: false },
    { $set: { read: true } },
  );
  return result.modifiedCount;
}

// ─── C1.5 – Mark all as read ───

export async function markAllAsRead(userId: string): Promise<number> {
  const result = await NotificationModel.updateMany(
    { userId, read: false },
    { $set: { read: true } },
  );
  return result.modifiedCount;
}

// ─── C1.6 – Get unread count ───

export async function getUnreadCount(userId: string): Promise<number> {
  return NotificationModel.countDocuments({ userId, read: false });
}

// ─── C1.7 – Check if conversation is muted ───

export async function isConversationMuted(userId: string, conversationId: string): Promise<boolean> {
  const pref = await NotificationPreferenceModel.findOne({ userId }).lean();
  if (!pref) return false;

  if (!pref.mutedConversations.includes(conversationId)) return false;

  const mutedUntilMap = pref.mutedUntil as unknown as Map<string, Date> | undefined;
  if (mutedUntilMap) {
    const expiry = mutedUntilMap instanceof Map
      ? mutedUntilMap.get(conversationId)
      : (mutedUntilMap as Record<string, Date>)[conversationId];

    if (expiry && new Date(expiry) < new Date()) {
      await NotificationPreferenceModel.updateOne(
        { userId },
        {
          $pull: { mutedConversations: conversationId },
          $unset: { [`mutedUntil.${conversationId}`]: '' },
        },
      );
      return false;
    }
  }

  return true;
}

// ─── C1.8 – Mute conversation ───

export async function muteConversation(
  userId: string,
  conversationId: string,
  until?: Date,
): Promise<void> {
  const update: Record<string, unknown> = {
    $addToSet: { mutedConversations: conversationId },
  };

  if (until) {
    update['$set'] = { [`mutedUntil.${conversationId}`]: until };
  } else {
    update['$unset'] = { [`mutedUntil.${conversationId}`]: '' };
  }

  await NotificationPreferenceModel.findOneAndUpdate(
    { userId },
    update,
    { upsert: true, new: true },
  );

  // Keep homepage badge consistent with mute state for this conversation.
  await NotificationModel.updateMany(
    { userId, conversationId, read: false },
    { $set: { read: true } },
  );
}

// ─── C1.9 – Unmute conversation ───

export async function unmuteConversation(userId: string, conversationId: string): Promise<void> {
  await NotificationPreferenceModel.updateOne(
    { userId },
    {
      $pull: { mutedConversations: conversationId },
      $unset: { [`mutedUntil.${conversationId}`]: '' },
    },
  );
}

// ─── C1.10 – Pin conversation ───

export async function pinConversation(userId: string, conversationId: string): Promise<void> {
  await NotificationPreferenceModel.findOneAndUpdate(
    { userId },
    { $addToSet: { pinnedConversations: conversationId } },
    { upsert: true, new: true },
  );
}

// ─── C1.11 – Unpin conversation ───

export async function unpinConversation(userId: string, conversationId: string): Promise<void> {
  await NotificationPreferenceModel.updateOne(
    { userId },
    { $pull: { pinnedConversations: conversationId } },
  );
}

// ─── C1.12 – Get preferences ───

export async function getPreferences(userId: string): Promise<INotificationPreference> {
  let pref = await NotificationPreferenceModel.findOne({ userId });

  if (!pref) {
    pref = await NotificationPreferenceModel.create({
      userId,
      mutedConversations: [],
      pinnedConversations: [],
      enablePush: true,
      enableSound: true,
      enableBadge: true,
    });
  }

  return pref;
}

// ─── C1.13 – Update preferences ───

export async function updatePreferences(
  userId: string,
  prefs: { enablePush?: boolean; enableSound?: boolean; enableBadge?: boolean },
): Promise<INotificationPreference> {
  const updated = await NotificationPreferenceModel.findOneAndUpdate(
    { userId },
    { $set: prefs },
    { upsert: true, new: true },
  );
  return updated!;
}

// ─── C1.14 – Notify post author when someone likes their post ───

export async function notifyPostLiked(
  postAuthorId: string,
  likerId: string,
  postId: string,
  postTitle: string,
): Promise<void> {
  if (postAuthorId === likerId) return;
  try {
    const liker = await UserModel.findById(likerId).select('displayName').lean();
    const likerName = (liker?.displayName as string) ?? 'Một developer';
    await produceNotificationEvent({
      userId: postAuthorId,
      type: 'post_like',
      title: 'Bài viết được yêu thích',
      body: `${likerName} đã thích bài viết của bạn: "${postTitle.slice(0, 60)}${postTitle.length > 60 ? '…' : ''}"`,
      fromUserId: likerId,
      data: { postId, action: 'open_community' },
    });
  } catch (err) {
    logger.error('Failed to notify post liked', err);
  }
}

// ─── C1.15 – Notify post author when someone comments on their post ───

export async function notifyPostCommented(
  postAuthorId: string,
  commenterId: string,
  postId: string,
  postTitle: string,
  commentPreview: string,
): Promise<void> {
  if (postAuthorId === commenterId) return;
  try {
    const commenter = await UserModel.findById(commenterId).select('displayName').lean();
    const commenterName = (commenter?.displayName as string) ?? 'Một developer';
    const preview = commentPreview.slice(0, 80);
    await produceNotificationEvent({
      userId: postAuthorId,
      type: 'post_comment',
      title: 'Bình luận mới',
      body: `${commenterName} đã bình luận: "${preview}${commentPreview.length > 80 ? '…' : ''}"`,
      fromUserId: commenterId,
      data: { postId, action: 'open_community' },
    });
  } catch (err) {
    logger.error('Failed to notify post commented', err);
  }
}

// ─── C1.16 – Notify post author when someone bookmarks their post ───

export async function notifyPostBookmarked(
  postAuthorId: string,
  bookmarkerId: string,
  postId: string,
  postTitle: string,
): Promise<void> {
  if (postAuthorId === bookmarkerId) return;
  try {
    const bookmarker = await UserModel.findById(bookmarkerId).select('displayName').lean();
    const bookmarkerName = (bookmarker?.displayName as string) ?? 'Một developer';
    await produceNotificationEvent({
      userId: postAuthorId,
      type: 'post_bookmark',
      title: 'Bài viết được lưu',
      body: `${bookmarkerName} đã lưu bài viết của bạn: "${postTitle.slice(0, 50)}${postTitle.length > 50 ? '…' : ''}"`,
      fromUserId: bookmarkerId,
      data: { postId, action: 'open_community' },
    });
  } catch (err) {
    logger.error('Failed to notify post bookmarked', err);
  }
}

// ─── C1.17 – Notify all friends when user creates a community post ───

export async function notifyFriendsOfNewPost(
  authorId: string,
  postId: string,
  postTitle: string,
  postType: string,
  friendIds: string[],
): Promise<void> {
  if (friendIds.length === 0) return;
  try {
    const author = await UserModel.findById(authorId).select('displayName avatarUrl').lean();
    const authorName = (author?.displayName as string) ?? 'Một developer';

    const postTypeLabels: Record<string, string> = {
      discussion: 'Thảo luận',
      question: 'Câu hỏi',
      til: 'TIL',
      showcase: 'Showcase',
      tutorial: 'Hướng dẫn',
      job: 'Tuyển dụng',
    };
    const typeLabel = postTypeLabels[postType] ?? 'Bài viết';

    await Promise.allSettled(
      friendIds.map((friendId) =>
        produceNotificationEvent({
          userId: friendId,
          type: 'community_post',
          title: `${typeLabel} mới từ bạn bè`,
          body: `${authorName} vừa đăng: "${postTitle.slice(0, 60)}${postTitle.length > 60 ? '…' : ''}"`,
          fromUserId: authorId,
          data: { postId, action: 'open_community' },
        }),
      ),
    );
  } catch (err) {
    logger.error('Failed to notify friends of new post', err);
  }
}
