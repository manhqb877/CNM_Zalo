import { Types } from 'mongoose';
import { ConversationMemberModel } from './conversation-member.model';
import { ConversationModel } from './conversation.model';
import { UserModel } from '../users/user.model';
import { FriendshipModel } from '../friends/friendship.model';
import { MessageModel } from '../messages/message.model';
import { CallSessionModel } from '../calls/calls.model';
import { getRedis } from '../../infrastructure/redis';
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '../../shared/errors';
import { logger } from '../../shared/logger';

const ACTIVE_CALL_SESSION_STATUSES = ['ringing', 'connecting', 'connected'] as const;

type ActiveConversationCall = {
  callSessionId: string;
  type: 'audio' | 'video';
  status: 'ringing' | 'connecting' | 'connected';
  startedAt?: Date | string | null;
  initiatedBy: string;
};

interface EnrichedConversation {
  _id: string;
  type: 'direct' | 'group';
  name?: string;
  avatarUrl?: string;
  createdBy?: string;
  adminIds: string[];
  memberApprovalEnabled?: boolean;
  lastMessage?: {
    content: string;
    senderId: string;
    senderDisplayName?: string;
    sentAt: Date;
  };
  activeCall: ActiveConversationCall | null;
  unreadCounts?: Record<string, number>;
  aiPreferences?: {
    catchupEnabled: boolean;
    smartSearchEnabled?: boolean;
  };
  updatedAt: Date;
  users: Array<{ _id: string; displayName: string; avatarUrl?: string }>;
}

interface ConversationMemberOverride {
  userId: string;
  lastVisibleMessageRef?: string;
  lastVisibleAt?: Date;
  unreadCount?: number;
  aiPreferences?: {
    catchupEnabled: boolean;
    smartSearchEnabled?: boolean;
  };
}

interface LastVisibleMessage {
  messageRef: string;
  content: string;
  senderId: string;
  senderDisplayName: string;
  sentAt: Date;
}

type DirectMessageRelationship = {
  isAcceptedFriend: boolean;
  isBlocked: boolean;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function allowDirectMessageNonFriends(): boolean {
  return process.env['ALLOW_DIRECT_MESSAGE_NON_FRIENDS'] !== 'false';
}

function getNonFriendDirectMessageWindowSeconds(): number {
  return parsePositiveInt(process.env['NON_FRIEND_DIRECT_MESSAGE_WINDOW_SECONDS'], 60 * 60);
}

function getNonFriendDirectMessageMax(): number {
  return parsePositiveInt(process.env['NON_FRIEND_DIRECT_MESSAGE_MAX'], 10);
}

function normalizeUnreadCounts(unreadCounts: unknown): Record<string, number> {
  if (!unreadCounts) {
    return {};
  }

  if (unreadCounts instanceof Map) {
    return Object.fromEntries(unreadCounts.entries());
  }

  return unreadCounts as Record<string, number>;
}

function getUnreadCountForUser(unreadCounts: unknown, userId: string): number {
  const normalized = normalizeUnreadCounts(unreadCounts);
  const value = normalized[userId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function getMessagePreview(content: unknown, type: unknown): string {
  const text = typeof content === 'string' ? content.trim() : '';
  if (text.length > 0) {
    return text;
  }

  if (type === 'image') return 'Da gui anh';
  if (type === 'video') return 'Da gui video';
  if (typeof type === 'string' && type.startsWith('file/')) return 'Da gui tep dinh kem';
  if (type === 'audio') return 'Da gui am thanh';
  if (type === 'sticker') return 'Da gui sticker';
  return 'Tin nhan media';
}

async function getDirectMessageRelationship(
  userId: string,
  targetUserId: string,
): Promise<DirectMessageRelationship> {
  const [forward, reverse] = await Promise.all([
    FriendshipModel.findOne({ userId, friendId: targetUserId }).select('status').lean(),
    FriendshipModel.findOne({ userId: targetUserId, friendId: userId }).select('status').lean(),
  ]);

  return {
    isAcceptedFriend: forward?.status === 'accepted' || reverse?.status === 'accepted',
    isBlocked: forward?.status === 'blocked' || reverse?.status === 'blocked',
  };
}

async function findExistingDirectConversation(
  userId: string,
  targetUserId: string,
): Promise<EnrichedConversation | null> {
  const existingMembers = await ConversationMemberModel.find({ userId: { $in: [userId, targetUserId] } })
    .select('conversationId userId')
    .lean();

  const conversationIdMap: Record<string, Set<string>> = {};
  for (const member of existingMembers) {
    const conversationId = member.conversationId.toString();
    if (!conversationIdMap[conversationId]) {
      conversationIdMap[conversationId] = new Set();
    }
    conversationIdMap[conversationId].add(member.userId);
  }

  for (const [convId, memberSet] of Object.entries(conversationIdMap)) {
    if (memberSet.size === 2 && memberSet.has(userId) && memberSet.has(targetUserId)) {
      const conversation = await ConversationModel.findById(convId).select('type').lean();
      if (conversation?.type === 'direct') {
        const enriched = await enrichConversationById(convId, userId);
        if (enriched) {
          logger.debug(`Found existing 1-1 conversation: ${convId}`);
          return enriched;
        }
      }
    }
  }

  return null;
}

async function enforceNonFriendDirectMessageRateLimit(userId: string): Promise<void> {
  try {
    const redis = getRedis();
    const key = `dm_rl:non_friend:${userId}`;
    const windowSeconds = getNonFriendDirectMessageWindowSeconds();
    const maxRequests = getNonFriendDirectMessageMax();
    const result = await redis.multi().incr(key).ttl(key).exec();
    const count = Number(result?.[0]?.[1] ?? 0);
    const ttl = Number(result?.[1]?.[1] ?? -1);

    if (ttl < 0) {
      await redis.expire(key, windowSeconds);
    }

    if (count > maxRequests) {
      const retryAfterMinutes = Math.ceil(windowSeconds / 60);
      throw new TooManyRequestsError(
        `Non-friend direct message rate limit exceeded. Try again in ${retryAfterMinutes} minutes.`,
      );
    }
  } catch (error) {
    if (error instanceof TooManyRequestsError) {
      throw error;
    }

    logger.warn('Non-friend direct message rate limiter failed open', error);
  }
}

export async function resolveActiveCallForConversation(
  conversationId: string,
  activeCall?: ActiveConversationCall | null,
): Promise<ActiveConversationCall | null> {
  if (!activeCall?.callSessionId) {
    return null;
  }

  const session = await CallSessionModel.findById(activeCall.callSessionId)
    .select('conversationId callType status startedAt initiatedBy')
    .lean();

  const sessionConversationId = session?.conversationId ? String(session.conversationId) : null;
  if (
    !session
    || sessionConversationId !== conversationId
    || !ACTIVE_CALL_SESSION_STATUSES.includes(session.status as ActiveConversationCall['status'])
  ) {
    await ConversationModel.updateOne(
      {
        _id: conversationId,
        'activeCall.callSessionId': activeCall.callSessionId,
      },
      { $unset: { activeCall: 1 } },
    );
    return null;
  }

  return {
    callSessionId: session._id.toString(),
    type: session.callType,
    status: session.status as ActiveConversationCall['status'],
    startedAt: session.startedAt ?? null,
    initiatedBy: session.initiatedBy,
  };
}

async function enrichConversationById(
  conversationId: string,
  viewerId?: string,
): Promise<EnrichedConversation | null> {
  const conversation = await ConversationModel.findById(conversationId);
  if (!conversation) {
    return null;
  }

  const membersRaw = await ConversationMemberModel.find({ conversationId })
    .select('userId lastVisibleMessageRef lastVisibleAt unreadCount aiPreferences')
    .lean();

  const members = membersRaw as unknown as ConversationMemberOverride[];
  const memberIds = members.map((member) => member.userId);
  const users = await UserModel.find({ _id: { $in: memberIds } }, 'displayName avatarUrl').lean();

  const usersNormalized = users.map((user) => ({
    _id: user._id.toString(),
    displayName: user.displayName as string,
    avatarUrl: user.avatarUrl as string | undefined,
  }));

  const userNameById = new Map(usersNormalized.map((user) => [user._id, user.displayName]));

  let lastMessage: EnrichedConversation['lastMessage'] = conversation.lastMessage
    ? {
        content: conversation.lastMessage.content,
        senderId: conversation.lastMessage.senderId,
        senderDisplayName: userNameById.get(conversation.lastMessage.senderId),
        sentAt: conversation.lastMessage.sentAt,
      }
    : undefined;

  const unreadCounts = normalizeUnreadCounts(conversation.unreadCounts);
  const activeCall = await resolveActiveCallForConversation(
    conversation._id.toString(),
    conversation.activeCall as ActiveConversationCall | null | undefined,
  );

  if (viewerId) {
    const viewerMember = members.find((member) => member.userId === viewerId);
    const hasOverride = Boolean(
      viewerMember
      && typeof viewerMember.lastVisibleMessageRef === 'string'
      && viewerMember.lastVisibleMessageRef.length > 0
      && viewerMember.lastVisibleAt instanceof Date
      && typeof viewerMember.unreadCount === 'number',
    );

    if (hasOverride && viewerMember?.lastVisibleMessageRef) {
      const message = await MessageModel.findOne({
        conversationId,
        idempotencyKey: viewerMember.lastVisibleMessageRef,
      })
        .select('content senderId type createdAt isDeleted deleteType')
        .lean();

      if (message) {
        const senderId = String(message.senderId);
        lastMessage = {
          content: message.isDeleted && message.deleteType === 'recall'
            ? 'Tin nhắn đã được thu hồi cho tôi'
            : getMessagePreview(message.content, message.type),
          senderId,
          senderDisplayName: userNameById.get(senderId),
          sentAt: message.createdAt as Date,
        };

        unreadCounts[viewerId] = viewerMember.unreadCount as number;
      }
    }
  }

  return {
    _id: conversation._id.toString(),
    type: conversation.type,
    name: conversation.name,
    avatarUrl: conversation.avatarUrl,
    createdBy: conversation.createdBy,
    adminIds: conversation.adminIds,
    memberApprovalEnabled: conversation.memberApprovalEnabled,
    lastMessage,
    activeCall,
    unreadCounts,
    aiPreferences: viewerId
      ? members.find((member) => member.userId === viewerId)?.aiPreferences ?? { catchupEnabled: true }
      : undefined,
    updatedAt: conversation.updatedAt,
    users: usersNormalized,
  };
}

export class ConversationsService {
  /**
   * Lấy danh sách hội thoại của một user, 
   * bao gồm cả thông tin thành viên (giúp hiển thị tên/avatar cho nhóm 1-1)
   */
  static async getUserConversations(userId: string): Promise<EnrichedConversation[]> {
    const memberships = await ConversationMemberModel.find({ userId }).select('conversationId').lean();
    const conversationIds = memberships.map((m) => m.conversationId);

    const conversations = await ConversationModel.find({ _id: { $in: conversationIds } })
      .sort({ 'lastMessage.sentAt': -1 })
      .select('_id')
      .lean();

    const enrichedConversations = (await Promise.all(
      conversations.map((conv) => enrichConversationById(conv._id.toString(), userId)),
    )).filter((conversation): conversation is EnrichedConversation => conversation !== null);

    return enrichedConversations.sort((a, b) => {
      const aTs = new Date(a.lastMessage?.sentAt || a.updatedAt || 0).getTime();
      const bTs = new Date(b.lastMessage?.sentAt || b.updatedAt || 0).getTime();
      return bTs - aTs;
    });
  }

  /**
   * Task 7.1: Get or Create 1-1 Conversation
   * Check if 1-1 conversation exists between two users, create if not
   * @param userId First user ID
   * @param targetUserId Second user ID
   * @returns Conversation document
   */
  static async getOrCreateConversation(userId: string, targetUserId: string): Promise<EnrichedConversation> {
    try {
      if (!userId || !targetUserId) {
        throw new BadRequestError('Missing user id');
      }

      if (!Types.ObjectId.isValid(targetUserId)) {
        throw new BadRequestError('Invalid target user id');
      }

      if (userId === targetUserId) {
        throw new BadRequestError('Cannot create conversation with yourself');
      }

      const [currentUser, targetUser] = await Promise.all([
        UserModel.findById(userId).select('isDeactivated').lean(),
        UserModel.findById(targetUserId).select('isDeactivated allowMessagesFrom').lean(),
      ]);

      if (!currentUser) {
        throw new NotFoundError('User not found');
      }

      if (!targetUser) {
        throw new NotFoundError('Target user not found');
      }

      if (currentUser.isDeactivated === true || targetUser.isDeactivated === true) {
        throw new ForbiddenError('User account is deactivated', 'DIRECT_MESSAGE_USER_DEACTIVATED');
      }

      const relationship = await getDirectMessageRelationship(userId, targetUserId);
      if (relationship.isBlocked) {
        throw new ForbiddenError('Direct message is blocked', 'DIRECT_MESSAGE_BLOCKED');
      }

      if (!allowDirectMessageNonFriends() && !relationship.isAcceptedFriend) {
        throw new ForbiddenError('Only friends can open direct conversation', 'DIRECT_MESSAGE_FRIENDS_ONLY');
      }

      if (targetUser.allowMessagesFrom === 'friends_only' && !relationship.isAcceptedFriend) {
        throw new ForbiddenError('This user only accepts messages from friends', 'DIRECT_MESSAGE_FRIENDS_ONLY');
      }

      const existingConversation = await findExistingDirectConversation(userId, targetUserId);
      if (existingConversation) {
        return existingConversation;
      }

      if (!relationship.isAcceptedFriend) {
        await enforceNonFriendDirectMessageRateLimit(userId);
      }

      const newConversation = await ConversationModel.create({
        type: 'direct',
        adminIds: [userId],
        unreadCounts: new Map<string, number>(),
      });

      await ConversationMemberModel.insertMany([
        { userId, conversationId: newConversation._id.toString() },
        { userId: targetUserId, conversationId: newConversation._id.toString() },
      ]);

      const enriched = await enrichConversationById(newConversation._id.toString(), userId);
      if (!enriched) {
        throw new NotFoundError('Conversation not found after creation');
      }

      logger.info(`Created new 1-1 conversation: ${newConversation._id}`);
      return enriched;
    } catch (err) {
      logger.error('Error in getOrCreateConversation', err);
      throw err;
    }
  }

  /**
   * Task 7.2: Update Last Message
   * Update conversation's lastMessage and updatedAt fields
   * @param conversationId Conversation ID
   * @param messageData Message data { content, senderId, sentAt }
   */
  static async updateLastMessage(
    conversationId: string,
    messageData: { content: string; senderId: string; sentAt: Date },
  ): Promise<void> {
    try {
      await ConversationModel.findByIdAndUpdate(
        conversationId,
        {
          lastMessage: {
            content: messageData.content,
            senderId: messageData.senderId,
            sentAt: messageData.sentAt,
          },
          updatedAt: new Date(),
        },
        { new: true },
      );

      logger.debug(`Updated lastMessage for conversation: ${conversationId}`);
    } catch (err) {
      logger.error('Error updating lastMessage', err);
      throw err;
    }
  }

  /**
   * Task 7.3: Increment Unread Count
   * Increment unread count for a specific user in a conversation
   * @param conversationId Conversation ID
   * @param userId User ID to increment unread for
   */
  static async incrementUnreadCount(conversationId: string, userId: string): Promise<void> {
    try {
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        logger.warn(`Conversation not found: ${conversationId}`);
        return;
      }

      // Get current unread count (default 0)
      const currentCount = conversation.unreadCounts.get(userId) ?? 0;

      // Increment and update
      conversation.unreadCounts.set(userId, currentCount + 1);
      await conversation.save();

      logger.debug(`Incremented unread count for user ${userId} in conversation ${conversationId}`);
    } catch (err) {
      logger.error('Error incrementing unreadCount', err);
      throw err;
    }
  }

  /**
   * Task 7.3: Clear Unread Count
   * Clear unread count for a specific user in a conversation (when they read messages)
   * @param conversationId Conversation ID
   * @param userId User ID to clear unread for
   */
  static async clearUnreadCount(conversationId: string, userId: string): Promise<void> {
    try {
      const conversation = await ConversationModel.findById(conversationId);
      if (!conversation) {
        logger.warn(`Conversation not found: ${conversationId}`);
        return;
      }

      // Delete the user's unread count entry
      conversation.unreadCounts.delete(userId);
      await conversation.save();

      await ConversationMemberModel.updateOne(
        {
          conversationId,
          userId,
          lastVisibleMessageRef: { $exists: true },
        },
        {
          $set: { unreadCount: 0 },
        },
      );

      logger.debug(`Cleared unread count for user ${userId} in conversation ${conversationId}`);
    } catch (err) {
      logger.error('Error clearing unreadCount', err);
      throw err;
    }
  }

  private static async resolveSenderDisplayName(senderId: string): Promise<string> {
    const sender = await UserModel.findById(senderId).select('displayName').lean();
    if (!sender?.displayName || typeof sender.displayName !== 'string') {
      return 'Nguoi dung';
    }

    return sender.displayName;
  }

  static async findLatestUsableMessageForMember(
    conversationId: string,
    userId: string,
  ): Promise<LastVisibleMessage | null> {
    const message = await MessageModel.findOne({
      conversationId,
      deletedFor: { $nin: [userId] },
      $or: [
        { isDeleted: { $ne: true } },
        { deleteType: 'recall' },
      ],
    })
      .sort({ createdAt: -1 })
      .select('idempotencyKey content senderId type createdAt isDeleted deleteType')
      .lean();

    if (!message?.idempotencyKey) {
      return null;
    }

    const senderId = String(message.senderId);
    const senderDisplayName = await this.resolveSenderDisplayName(senderId);

    return {
      messageRef: String(message.idempotencyKey),
      content: message.isDeleted && message.deleteType === 'recall'
        ? 'Tin nhắn đã được thu hồi cho tôi'
        : getMessagePreview(message.content, message.type),
      senderId,
      senderDisplayName,
      sentAt: message.createdAt as Date,
    };
  }

  static async applyDeleteForMeMemberState(
    conversationId: string,
    userId: string,
  ): Promise<{
    effectiveLastMessage: { content: string; senderId: string; sentAt: Date } | null;
    unreadCount: number;
    lastVisibleMessage: { content: string; senderId: string; senderDisplayName: string; sentAt: Date } | null;
  }> {
    const conversation = await ConversationModel.findById(conversationId).select('unreadCounts').lean();
    const unreadCount = getUnreadCountForUser(conversation?.unreadCounts, userId);
    const latestVisible = await this.findLatestUsableMessageForMember(conversationId, userId);

    if (!latestVisible) {
      await ConversationMemberModel.updateOne(
        { conversationId, userId },
        {
          $unset: {
            lastVisibleMessageRef: 1,
            lastVisibleAt: 1,
            unreadCount: 1,
          },
        },
      );

      return {
        effectiveLastMessage: null,
        unreadCount: 0,
        lastVisibleMessage: null,
      };
    }

    await ConversationMemberModel.updateOne(
      { conversationId, userId },
      {
        $set: {
          lastVisibleMessageRef: latestVisible.messageRef,
          lastVisibleAt: latestVisible.sentAt,
          unreadCount,
        },
      },
    );

    return {
      effectiveLastMessage: {
        content: latestVisible.content,
        senderId: latestVisible.senderId,
        sentAt: latestVisible.sentAt,
      },
      unreadCount,
      lastVisibleMessage: {
        content: latestVisible.content,
        senderId: latestVisible.senderId,
        senderDisplayName: latestVisible.senderDisplayName,
        sentAt: latestVisible.sentAt,
      },
    };
  }

  static async clearConversationMemberOverrideOnNewMessage(conversationId: string): Promise<void> {
    await ConversationMemberModel.updateMany(
      {
        conversationId,
        $or: [
          { lastVisibleMessageRef: { $exists: true } },
          { lastVisibleAt: { $exists: true } },
          { unreadCount: { $exists: true } },
        ],
      },
      {
        $unset: {
          lastVisibleMessageRef: 1,
          lastVisibleAt: 1,
          unreadCount: 1,
        },
      },
    );
  }

  static async recomputeConversationLastMessage(
    conversationId: string,
  ): Promise<{ content: string; senderId: string; sentAt: Date } | null> {
    const latestMessage = await MessageModel.findOne({
      conversationId,
      $or: [
        { isDeleted: { $ne: true } },
        { deleteType: 'recall' },
      ],
    })
      .sort({ createdAt: -1 })
      .select('content senderId type createdAt isDeleted deleteType')
      .lean();

    if (!latestMessage) {
      await ConversationModel.findByIdAndUpdate(conversationId, {
        $unset: { lastMessage: 1 },
        updatedAt: new Date(),
      });
      return null;
    }

    const content = latestMessage.isDeleted && latestMessage.deleteType === 'recall'
      ? 'Tin nhắn đã được thu hồi'
      : getMessagePreview(latestMessage.content, latestMessage.type);

    const payload = {
      content,
      senderId: String(latestMessage.senderId),
      sentAt: latestMessage.createdAt as Date,
    };

    await this.updateLastMessage(conversationId, payload);
    return payload;
  }
}
