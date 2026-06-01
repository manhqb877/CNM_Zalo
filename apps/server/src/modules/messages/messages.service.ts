import { MessageModel, MessageType, type ICallHistory, type IMessage, type IReplyTo } from './message.model';
import { MessageStatusModel, type IMessageStatus } from './message-status.model';
import { checkIdempotencyKey, setIdempotencyKey } from '../../infrastructure/redis';
import { ConversationsService } from '../conversations/conversations.service';
import { ConversationMemberModel } from '../conversations/conversation-member.model';
import { BadRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { produceMessage, KAFKA_TOPICS } from '../../infrastructure/kafka';
import { isNeonAvailable } from '../../infrastructure/neon';
import { getRedis } from '../../infrastructure/redis';
import { v4 as uuidv4 } from 'uuid';
import { MessageReactionsService } from './message-reaction.service';
import { UserModel } from '../users/user.model';
import { MessageRepository } from '../../shared/repositories/message.repository';

export interface PaginatedMessages {
  messages: IMessage[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface MessageWithStatus extends IMessage {
  status?: string;
}

interface DeleteForMeSyncResult {
  message: IMessage;
  effectiveLastMessage: {
    content: string;
    senderId: string;
    sentAt: Date;
  } | null;
  unreadCount: number;
  lastVisibleMessage: {
    content: string;
    senderId: string;
    senderDisplayName: string;
    sentAt: Date;
  } | null;
}

interface RecallSyncResult {
  message: IMessage;
  conversationLastMessage: {
    content: string;
    senderId: string;
    sentAt: Date;
  } | null;
}

interface ReadParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export class MessagesService {
  private static readonly IDEMPOTENCY_TTL = 5 * 60; // 5 minutes
  /** Repository singleton – all DB queries go through here */
  private static readonly repo = new MessageRepository();

  private static getLastMessagePreview(
    content: string,
    type: MessageType,
  ): string {
    const trimmed = content.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }

    if (type === 'image') return 'Da gui anh';
    if (type === 'video') return 'Da gui video';
    if (type?.startsWith('file/')) return 'Da gui tep dinh kem';
    if (type === 'audio') return 'Da gui am thanh';
    if (type === 'sticker') return 'Da gui sticker';
    if (type === 'call_history') return content || 'Lich su cuoc goi';
    return '';
  }

  private static shouldIndexForSmartSearch(content: string | undefined, type: MessageType): boolean {
    const text = content?.trim() ?? '';
    if (!text) return false;
    return type === 'text' || type === 'call_history' || type.startsWith('file/');
  }

  private static async enqueueMessageEmbedding(message: {
    _id: unknown;
    conversationId: string;
    content?: string;
    type: MessageType;
  }): Promise<void> {
    if (!isNeonAvailable() || !this.shouldIndexForSmartSearch(message.content, message.type)) {
      return;
    }

    try {
      await produceMessage(KAFKA_TOPICS.MESSAGE_EMBEDDINGS, String(message._id), {
        messageId: String(message._id),
        conversationId: message.conversationId,
        contentText: message.content?.trim() ?? '',
        type: message.type,
        requestedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.debug('[SmartSearch] Failed to enqueue message embedding', {
        messageId: String(message._id),
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  static getCallHistoryPreview(callHistory: ICallHistory): string {
    const callTypeLabel = callHistory.callType === 'audio' ? 'Cuoc goi thoai' : 'Cuoc goi video';
    if (callHistory.status === 'missed') return `${callTypeLabel} bi nho`;
    if (callHistory.status === 'rejected') return `${callTypeLabel} bi tu choi`;
    if (callHistory.status === 'cancelled') return `${callTypeLabel} da huy`;
    return `${callTypeLabel} da ket thuc`;
  }

  static async createCallHistoryMessage(
    conversationId: string,
    callHistory: ICallHistory,
  ): Promise<IMessage> {
    const idempotencyKey = `call-history:${callHistory.callSessionId}:${callHistory.status}`;
    const existing = await MessagesService.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      return existing as unknown as IMessage;
    }

    const content = this.getCallHistoryPreview(callHistory);
    const message = await MessageModel.create({
      conversationId,
      senderId: callHistory.callerId,
      content,
      type: 'call_history',
      callHistory,
      idempotencyKey,
      createdAt: callHistory.endedAt ?? new Date(),
    });

    const members = await ConversationMemberModel.find({ conversationId }).select('userId').lean();
    await MessageStatusModel.insertMany(
      members.map((member) => ({
        messageId: message._id.toString(),
        idempotencyKey,
        userId: member.userId,
        status: member.userId === callHistory.callerId ? 'sent' : 'delivered',
      })),
      { ordered: false },
    ).catch((err) => {
      logger.warn('[CallHistory] Failed to insert one or more message statuses', err);
    });

    await ConversationsService.updateLastMessage(conversationId, {
      content,
      senderId: callHistory.callerId,
      sentAt: message.createdAt,
    });
    await ConversationsService.clearConversationMemberOverrideOnNewMessage(conversationId);

    for (const member of members) {
      if (member.userId !== callHistory.callerId) {
        await ConversationsService.incrementUnreadCount(conversationId, member.userId);
      }
    }

    await this.enqueueMessageEmbedding(message);

    return message.toObject() as unknown as IMessage;
  }

  /**
   * Aggregate message status for sender vs recipient view
   * - Sender sees: Best case among recipients (read > delivered > sent)
   * - Recipient sees: Own status only
   */
  private static aggregateMessageStatus(
    messageId: string,
    senderId: string,
    requestingUserId: string,
    allStatuses: Array<{ userId: string; status: string }>,
  ): 'sent' | 'delivered' | 'read' {
    // If requesting user is sender
    if (requestingUserId === senderId) {
      // Show best case among recipients (exclude sender)
      const recipientStatuses = allStatuses
        .filter(s => s.userId !== senderId)
        .map(s => s.status as 'sent' | 'delivered' | 'read');

      // Priority: read > delivered > sent (best case)
      if (recipientStatuses.includes('read')) return 'read';
      if (recipientStatuses.includes('delivered')) return 'delivered';
      return 'sent';
    }

    // Recipient: show own status
    const ownStatus = allStatuses.find(s => s.userId === requestingUserId);
    return (ownStatus?.status as 'sent' | 'delivered' | 'read') || 'delivered';
  }

  /**
   * Tạo tin nhắn nhanh (chỉ publish Kafka, không insert vào DB)
   * - Check Redis idempotency cache
   * - Publish to Kafka topic (for Kafka worker to insert)
   * - Cache MessageId + return mock message object
   * 
   * Note: Actual DB insert sẽ do Kafka worker (hoặc fallback nếu fail)
   */
  static async createMessage(
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType,
    idempotencyKey: string,
    mediaUrl?: string,
    replyTo?: IReplyTo,
  ): Promise<IMessage> {
    // Step 1: Check idempotency cache
    const cachedMessage = await checkIdempotencyKey(idempotencyKey);
    if (cachedMessage) {
      logger.debug(`[Idempotency] Found cached message for key: ${idempotencyKey}`);
      return {
        _id: cachedMessage.messageId,
        conversationId,
        senderId,
        content: cachedMessage.content,
        type: cachedMessage.type,
        mediaUrl: cachedMessage.mediaUrl,
        moderationWarning: false,
        replyTo: cachedMessage.replyTo as IReplyTo | undefined,
        idempotencyKey,
        createdAt: new Date(cachedMessage.createdAt as number),
      } as unknown as IMessage;
    }

    // Step 2: Cache idempotency key immediately (before publishing)
    const now = new Date();
    
    await setIdempotencyKey(idempotencyKey, {
      messageId: idempotencyKey,
      conversationId,
      senderId,
      content,
      type,
      mediaUrl,
      replyTo,
      createdAt: now,
    });

    // Step 3: Publish to Kafka (worker will insert)
    try {
      await produceMessage(KAFKA_TOPICS.RAW_MESSAGES, conversationId, {
        messageId: idempotencyKey,
        conversationId,
        senderId,
        content,
        type,
        mediaUrl,
        replyTo,
        idempotencyKey,
        createdAt: now,
      });
      logger.debug(`[Message] Published to Kafka: ${idempotencyKey}`);
    } catch (err) {
      logger.error('[Message] Failed to publish to Kafka', err);
      throw err;
    }

    // Step 4: Return mock message object (real DB insert will happen in Kafka worker)
    return {
      _id: idempotencyKey,
      conversationId,
      senderId,
      content,
      type,
      mediaUrl,
      replyTo,
      idempotencyKey,
      createdAt: now,
    } as unknown as IMessage;
  }

  /**
   * Insert message with full metadata (MessageStatus, lastMessage, unreadCount)
   * Used by Kafka worker and fallback insert
   * Handles all DB operations after Kafka publishes message
   * 
   * @param mockId - Temporary server-generated ID (userId_timestamp) for mapping
   */
  static async insertMessageWithMetadata(
    conversationId: string,
    senderId: string,
    content: string,
    type: MessageType,
    idempotencyKey: string,
    mediaUrl?: string,
    mockId?: string,
    replyTo?: IReplyTo,
  ): Promise<IMessage> {
    // Step 1: Check if message already exists (idempotency)
    const existing = await MessagesService.repo.findByIdempotencyKey(idempotencyKey);
    if (existing) {
      logger.debug(`[InsertMetadata] Message already exists: ${idempotencyKey}`);
      return existing as unknown as IMessage;
    }

    // Step 2: Create Message document
    const message = new MessageModel({
      conversationId,
      senderId,
      content,
      type,
      mediaUrl,
      replyTo,
      idempotencyKey,
      createdAt: new Date(),
    });

    const savedMessage = await message.save();
    logger.debug(`[InsertMetadata] Created message: ${savedMessage._id}`);

    // Step 3: Create MessageStatus (sent for sender)
    // Store exact idempotencyKey from frontend for proper ID mapping
    const messageStatus = new MessageStatusModel({
      messageId: savedMessage._id.toString(),
      idempotencyKey: idempotencyKey, // Store exact frontend mockId for matching
      userId: senderId,
      status: 'sent',
    });

    await messageStatus.save();
    logger.debug(`[InsertMetadata] Created MessageStatus for: ${savedMessage._id} (mockId: ${mockId})`);

    // Step 3.5: Apply pending status updates from Redis queue
    // During Kafka processing time, frontend may have called updateMessageStatus()
    // Those updates were queued to Redis (since Message wasn't inserted yet)
    // Now that Message exists, apply all pending updates
    if (mockId) {
      try {
        const redis = getRedis();
        
        const pendingKey = `pending_status:${mockId}`;
        const pendingUpdates = await redis.hgetall(pendingKey);

        if (pendingUpdates && Object.keys(pendingUpdates).length > 0) {
          logger.debug(`[ApplyPending] Found ${Object.keys(pendingUpdates).length} pending updates for ${mockId}`);

          for (const [userId, status] of Object.entries(pendingUpdates)) {
            // Skip sender (already created above)
            if (userId === senderId) continue;

            try {
              const pendingStatus = new MessageStatusModel({
                messageId: savedMessage._id.toString(),
                idempotencyKey: idempotencyKey,
                userId,
                status,
              });
              await pendingStatus.save();
              logger.debug(`[ApplyPending] Applied pending status: ${userId}=${status} for message ${savedMessage._id}`);
            } catch (err) {
              // Ignore duplicate key errors (already created elsewhere)
              if ((err as any).code === 11000) {
                logger.debug(`[ApplyPending] Duplicate status record for ${userId}, skipping`);
              } else {
                logger.warn(`[ApplyPending] Error creating MessageStatus for ${userId}`, err);
              }
            }
          }

          // Clean up Redis queue
          await redis.del(pendingKey);
          logger.debug(`[ApplyPending] Cleaned up Redis queue: ${pendingKey}`);
        }
      } catch (err) {
        logger.warn('[InsertMetadata] Failed to apply pending status updates', err);
        // Continue anyway - pending updates will be lost but message is still created
      }
    }

    // Step 4: Update conversation's lastMessage
    try {
      const previewContent = this.getLastMessagePreview(content, type);
      await ConversationsService.updateLastMessage(conversationId, {
        content: previewContent,
        senderId,
        sentAt: savedMessage.createdAt,
      });

      await ConversationsService.clearConversationMemberOverrideOnNewMessage(conversationId);
    } catch (err) {
      logger.warn('[InsertMetadata] Failed to update conversation lastMessage', err);
    }

    // Step 5: Increment unread count for other conversation members
    try {
      const members = await ConversationMemberModel.find({ conversationId });
      for (const member of members) {
        if (member.userId !== senderId) {
          await ConversationsService.incrementUnreadCount(conversationId, member.userId);
        }
      }
    } catch (err) {
      logger.warn('[InsertMetadata] Failed to increment unread counts', err);
    }

    await this.enqueueMessageEmbedding(savedMessage);

    // Step 6: Apply any pending reactions queued before this message reached MongoDB
    try {
      const messageRefs = [savedMessage._id.toString(), idempotencyKey, mockId]
        .filter((value): value is string => typeof value === 'string' && value.length > 0);

      await MessageReactionsService.applyPendingReactionsForMessage({
        messageId: savedMessage._id.toString(),
        conversationId,
        messageRefs,
      });
    } catch (err) {
      logger.warn('[InsertMetadata] Failed to apply pending reactions', err);
    }

    return savedMessage.toObject() as unknown as IMessage;
  }

  /**
   * Fallback batch insert when Kafka batch fails
   * Inserts messages directly with all metadata
   * Used when message.worker fails to batch insert
   */
  static async fallbackBatchInsert(
    messages: Array<{
      mockId?: string;
      conversationId: string;
      senderId: string;
      content: string;
      type: string;
      mediaUrl?: string;
      replyTo?: IReplyTo;
      idempotencyKey: string;
      createdAt: Date;
    }>
  ): Promise<void> {
    if (messages.length === 0) return;

    for (const msg of messages) {
      try {
        await this.insertMessageWithMetadata(
          msg.conversationId,
          msg.senderId,
          msg.content,
          msg.type as MessageType,
          msg.idempotencyKey,
          msg.mediaUrl,
          msg.mockId,
          msg.replyTo,
        );
      } catch (err) {
        logger.error(`[Fallback] Failed to insert message ${msg.idempotencyKey}`, err);
      }
    }
  }

  /**
   * Lấy lịch sử tin nhắn của một hội thoại
   * - Cursor-based pagination (dùng createdAt + _id)
   * - Populate status cho current user
   * - Filters out messages deleted "for me" and shows placeholder for recalled messages
   * - Return { messages (with status), nextCursor, hasMore }
   */
  static async getMessageHistory(
    conversationId: string,
    userId: string,
    cursor?: string,
    limit: number = 20,
  ): Promise<PaginatedMessages> {
    try {

      // Decode cursor nếu có
      let cursorObj: { createdAt: Date; messageId: string } | undefined;
      if (cursor) {
        const [createdAtStr, messageId] = Buffer.from(cursor, 'base64').toString().split('_');
        cursorObj = { createdAt: new Date(parseInt(createdAtStr)), messageId };
      }

      // Fetch limit + 1 để check hasMore (dùng Repository)
      const messages = await MessagesService.repo['model']
        .find(cursorObj ? {
          conversationId,
          $or: [
            { createdAt: { $lt: cursorObj.createdAt } },
            { createdAt: cursorObj.createdAt, _id: { $lt: cursorObj.messageId } },
          ],
        } : { conversationId })
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();

      let hasMore = false;
      let nextCursor: string | null = null;

      if (messages.length > limit) {
        hasMore = true;
        messages.pop();

        // Encode next cursor
        const lastMessage = messages[messages.length - 1];
        nextCursor = Buffer.from(
          `${(lastMessage.createdAt as any).getTime()}_${lastMessage._id}`,
        ).toString('base64');
      }


      // ─── Filter based on deletion ───
      const filteredMessages = messages
        .map((msg) => {
          // If message is recalled: show placeholder
          if (msg.isDeleted && msg.deleteType === 'recall') {
            return {
              ...msg,
              content: '[Tin nhắn đã được thu hồi]',
              mediaUrl: undefined,
              type: 'system-recall' as const,
              isRecalled: true,
            };
          }

          // If deleted for this user only: hide it
          if (msg.deletedFor?.includes(userId)) {
            return null;
          }

          return msg;
        })
        .filter(Boolean);

      // ─── Fetch status ───
      const messageIds = filteredMessages.map((m: any) => m._id.toString());
      const allStatuses = await MessageStatusModel.find({
        messageId: { $in: messageIds },
      }).lean();

      const members = await ConversationMemberModel.find({ conversationId }).select('userId').lean();
      const memberIds = Array.from(new Set(
        members
          .map((member: any) => String(member.userId || ''))
          .filter((value: string) => value.length > 0),
      ));

      const users = memberIds.length > 0
        ? await UserModel.find({ _id: { $in: memberIds } }).select('displayName avatarUrl').lean()
        : [];

      const participantByUserId = new Map<string, ReadParticipant>();
      users.forEach((user: any) => {
        participantByUserId.set(String(user._id), {
          userId: String(user._id),
          displayName: user.displayName || 'Nguoi dung',
          avatarUrl: user.avatarUrl,
        });
      });

      // ─── Aggregate status ───
      const statusByMessageId = new Map<string, Array<{ userId: string; status: string; updatedAt: Date }>>();
      for (const status of allStatuses) {
        const msgId = status.messageId.toString();
        if (!statusByMessageId.has(msgId)) {
          statusByMessageId.set(msgId, []);
        }
        statusByMessageId.get(msgId)!.push({
          userId: status.userId,
          status: status.status,
          updatedAt: new Date((status as any).updatedAt || Date.now()),
        });
      }

      // Add status to messages
      const messagesWithStatus = filteredMessages.map((msg: any) => {
        const msgId = msg._id.toString();
        const msgStatuses = statusByMessageId.get(msgId) || [];
        const senderId = typeof msg.senderId === 'string' ? msg.senderId : String(msg.senderId?._id || '');

        const status = this.aggregateMessageStatus(
          msgId,
          senderId,
          userId,
          msgStatuses,
        );

        const readBy = msgStatuses
          .filter((item) => item.status === 'read' && item.userId !== senderId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
          .map((item) => {
            const participant = participantByUserId.get(String(item.userId));
            return {
              userId: String(item.userId),
              displayName: participant?.displayName || 'Nguoi dung',
              avatarUrl: participant?.avatarUrl,
              readAt: item.updatedAt,
            };
          });

        const readByIds = new Set(readBy.map((item) => String(item.userId)));

        const sentTo = memberIds
          .filter((memberId) => memberId !== senderId && !readByIds.has(memberId))
          .map((memberId) => {
            const participant = participantByUserId.get(memberId);
            return {
              userId: memberId,
              displayName: participant?.displayName || 'Nguoi dung',
              avatarUrl: participant?.avatarUrl,
            };
          });

        const readByPreview = Array.isArray(msg.readByPreview) && msg.readByPreview.length > 0
          ? msg.readByPreview.map((item: any) => ({
            userId: String(item.userId),
            displayName: item.displayName || 'Nguoi dung',
            avatarUrl: item.avatarUrl,
            readAt: new Date(item.readAt),
          }))
          : readBy.slice(0, 3);

        const sender = memberIds
          .filter((memberId) => memberId === senderId)
          .map((memberId) => {
            const participant = participantByUserId.get(memberId);
            return {
              senderId: memberId,
              displayName: participant?.displayName || 'Nguoi dung',
              avatarUrl: participant?.avatarUrl,
            };
          })[0];

        return {
          ...msg,
          status,
          sender,
          readBy,
          sentTo,
          readByPreview,
        };
      });

      const reactionSummaries = await MessageReactionsService.getSummariesByMessageIds(messageIds);

      const messagesWithStatusAndReactions = messagesWithStatus.map((msg: any) => {
        const msgId = msg._id.toString();
        return {
          ...msg,
          reactionSummary: reactionSummaries[msgId] ?? {
            totalCount: 0,
            emojiCounts: {},
          },
        };
      });

      return {
        messages: messagesWithStatusAndReactions as unknown as IMessage[],
        nextCursor,
        hasMore,
      };
    } catch (error) {
      logger.error('[MessagesService] Error in getMessageHistory:', error);
      throw error;
    }
  }

  /**
   * Cập nhật status của một tin nhắn cho một user
   * - Optimized: 2 paths
   * - Path A (fast): MessageStatus exists → update immediately
   * - Path B (pending): MessageStatus NOT found → queue to Redis, Kafka worker applies later
   * - Support both real messageId AND idempotencyKey (temp) lookup
   */
  static async updateMessageStatus(
    messageId: string,
    userId: string,
    status: 'sent' | 'delivered' | 'read',
  ): Promise<IMessageStatus | null> {
    try {
      // Step 1: Try find existing MessageStatus
      // (handles case where Message already inserted)
      const existingStatus = await MessageStatusModel.findOne({
        userId,
        $or: [
          { messageId },           // Real MongoDB ID
          { idempotencyKey: messageId }, // Temp ID
        ],
      });

      if (existingStatus) {
        // Status record exists → update immediately (fast path)
        existingStatus.status = status;
        await existingStatus.save();
        logger.info(
          `[MessageStatus] Updated existing: ${messageId}:${userId}=${status}`
        );
        return existingStatus;
      }

      // Step 2: Not found → Queue to Redis pending (Message still inserting)
      // Kafka worker will apply this after insertMessageWithMetadata() completes
      const pendingKey = `pending_status:${messageId}`;
      const redis = getRedis();
      
      await redis.hset(pendingKey, userId, status);
      await redis.expire(pendingKey, 300); // 5 min TTL auto-cleanup
      
      logger.info(
        `[PendingQueue] Queued status update: ${pendingKey}:${userId}=${status}`
      );
      
      // Return null for pending (consistent with "not yet stored in DB")
      // Frontend will be updated via Socket.io status_update event later
      return null;

    } catch (error) {
      logger.error('[MessagesService] Error in updateMessageStatus:', error);
      throw error;
    }
  }

  /**
   * Đánh dấu một tin nhắn là đã đọc cho user hiện tại
   * - Update MessageStatus: status → 'read'
   */
  static async markAsRead(messageId: string, userId: string): Promise<IMessageStatus | null> {
    return this.updateMessageStatus(messageId, userId, 'read');
  }

  /**
   * Batch đánh dấu nhiều tin nhắn là đã đọc
   * - Task 7.3: Clear unread count for user in conversation
   */
  static async markMultipleAsRead(messageIds: string[], userId: string): Promise<void> {
    try {
      // Get all messages to find conversation
      const messages = await MessageModel.find({ _id: { $in: messageIds } }).lean();
      const conversationId = messages[0]?.conversationId;

      // Update message statuses to read
      await MessageStatusModel.updateMany(
        { messageId: { $in: messageIds }, userId },
        { status: 'read', updatedAt: new Date() },
      );

      // Clear unread count for this conversation
      if (conversationId) {
        try {
          await ConversationsService.clearUnreadCount(conversationId, userId);
          await this.refreshReadByPreviewForReadEvents(conversationId, messageIds);
        } catch (err) {
          logger.warn('Failed to clear unread count', err);
        }
      }

      logger.debug(`[MessageStatus] Marked ${messageIds.length} messages as read for user ${userId}`);
    } catch (error) {
      logger.error('[MessagesService] Error in markMultipleAsRead:', error);
      throw error;
    }
  }

  /**
   * Lấy thông tin chi tiết của một tin nhắn
   */
  static async findMessageById(messageId: string): Promise<IMessage | null> {
    try {
      const message = await MessageModel.findById(messageId);
      return message as IMessage | null;
    } catch (error) {
      logger.error('[MessagesService] Error in findMessageById:', error);
      throw error;
    }
  }

  /**
   * Find message by either Mongo _id or idempotencyKey (UUID).
   * Needed for realtime flows where the client may only know temporary key.
   */
  static async findMessageByReference(messageReference: string): Promise<IMessage | null> {
    try {
      const message = await MessageModel.findOne(this.getMessageLookupQuery(messageReference));
      return message as IMessage | null;
    } catch (error) {
      logger.error('[MessagesService] Error in findMessageByReference:', error);
      throw error;
    }
  }

  /**
   * Lấy status của một tin nhắn cho user
   * - Support both real messageId AND idempotencyKey lookup
   */
  static async getMessageStatus(messageId: string, userId: string): Promise<IMessageStatus | null> {
    try {
      const status = await MessageStatusModel.findOne({
        userId,
        $or: [
          { messageId },           // Real ID
          { idempotencyKey: messageId }, // Temp ID
        ],
      }).lean();
      return status as IMessageStatus | null;
    } catch (error) {
      logger.error('[MessagesService] Error in getMessageStatus:', error);
      throw error;
    }
  }

  /**
   * Xóa tin nhắn (soft delete by bỏ content, hoặc hard delete)
   * Note: Tùy thiết kế, hiện chưa implement
   */
  static async deleteMessage(messageId: string, userId: string): Promise<void> {
    try {
      // Verify user is sender
      const message = await MessageModel.findById(messageId);
      if (!message) {
        throw new BadRequestError('Message not found');
      }

      if (message.senderId !== userId) {
        throw new BadRequestError('Cannot delete message sent by another user');
      }

      // Hard delete
      await MessageModel.deleteOne({ _id: messageId });
      await MessageStatusModel.deleteMany({ messageId });

      logger.info(`[Message] Deleted message: ${messageId}`);
    } catch (error) {
      logger.error('[MessagesService] Error in deleteMessage:', error);
      throw error;
    }
  }

  /**
   * Tìm các tin nhắn chưa được deliver cho user trong conversation
   * - Lấy tất cả messages trong conversation
   * - Filter: senderId !== userId (không phải tin nhắn của user này gửi)
   * - Filter: MessageStatus không tồn tại hoặc status != 'read'
   * - Return: Array of {id, idempotencyKey} để có thể match với mockId ở frontend
   */
  static async findUndeliveredForUser(
    conversationId: string,
    userId: string,
  ): Promise<Array<{ id: string; idempotencyKey: string }>> {
    try {
      // Get all messages in conversation sent by others
      const messages = await MessageModel
        .find({
          conversationId,
          senderId: { $ne: userId },
        })
        .select('_id idempotencyKey')
        .lean();

      if (messages.length === 0) {
        return [];
      }

      const messageIds = messages.map(m => m._id.toString());

      // Get all MessageStatus for these messages + user combination
      const statuses = await MessageStatusModel
        .find({
          messageId: { $in: messageIds },
          userId,
        })
        .select('messageId status')
        .lean();

      // Build set of already-read message IDs
      const readMessageIds = new Set<string>();
      for (const status of statuses) {
        if (status.status === 'read') {
          readMessageIds.add(status.messageId.toString());
        }
      }

      // Build map of messageId -> status
      const statusByMessageId = new Map<string, string>();
      for (const status of statuses) {
        statusByMessageId.set(status.messageId.toString(), status.status);
      }

      // Return messages where:
      // - No status exists (never marked), OR
      // - Status exists but is not 'read' (still sent/delivered only)
      const undeliveredIds = messages
        .filter((msg) => {
          const msgId = msg._id.toString();
          const currentStatus = statusByMessageId.get(msgId);
          return !currentStatus || currentStatus !== 'read';
        })
        .map((msg) => ({
          id: msg._id.toString(),
          idempotencyKey: msg.idempotencyKey,
        }));

      logger.info(
        `[MessagesService] Found ${undeliveredIds.length} undelivered messages for user ${userId} in conversation ${conversationId}`,
      );

      return undeliveredIds;
    } catch (error) {
      logger.error('[MessagesService] Error in findUndeliveredForUser:', error);
      throw error;
    }
  }

  /**
   * Check if message can be recalled (within 5 minute time limit)
   */
  private static readonly RECALL_TIMEOUT = 5 * 60 * 1000; // 5 minutes
  private static readonly RECALL_RETRY_MAX_ATTEMPTS = 6;
  private static readonly RECALL_RETRY_BASE_DELAY_MS = 150;

  private static isMessageNotFoundError(error: unknown): boolean {
    return error instanceof BadRequestError && error.message === 'Message not found';
  }

  private static getMessageLookupQuery(messageReference: string): Record<string, unknown> {
    if (/^[a-fA-F0-9]{24}$/.test(messageReference)) {
      return {
        $or: [
          { idempotencyKey: messageReference },
          { _id: messageReference },
        ],
      };
    }

    return { idempotencyKey: messageReference };
  }

  private static delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static canRecallMessage(message: IMessage): boolean {
    if (!message.senderId) return false;

    const now = Date.now();
    const createdTime = new Date(message.createdAt).getTime();

    // Cannot recall after 5 minutes
    return now - createdTime <= this.RECALL_TIMEOUT;
  }

  /**
   * Delete message for sender only (message still visible to recipients)
   * @param idempotencyKey Message ID or idempotencyKey to delete (supports both synced and pending messages)
   * @param userId User ID of sender
   * @returns Updated message document
   */
  static async deleteMessageForMe(
    idempotencyKey: string,
    userId: string,
  ): Promise<IMessage> {
    const message = await MessageModel.findOne(this.getMessageLookupQuery(idempotencyKey));

    if (!message) {
      throw new BadRequestError('Message not found');
    }

    // Only sender can delete
    if (message.senderId !== userId) {
      throw new BadRequestError('Only sender can delete own messages');
    }

    // Initialize deletedFor array if not exists
    if (!message.deletedFor) {
      message.deletedFor = [];
    }

    // Add userId to deletedFor if not already there
    if (!message.deletedFor.includes(userId)) {
      message.deletedFor.push(userId);
    }

    await message.save();
    logger.info(`[Delete] Message ${idempotencyKey} deleted for me by user ${userId}`);
    return message.toObject() as unknown as IMessage;
  }

  static async deleteMessageForMeWithConversationSync(
    messageReference: string,
    userId: string,
  ): Promise<DeleteForMeSyncResult> {
    const message = await this.deleteMessageForMe(messageReference, userId);

    const { effectiveLastMessage, unreadCount, lastVisibleMessage } =
      await ConversationsService.applyDeleteForMeMemberState(message.conversationId, userId);

    return {
      message,
      effectiveLastMessage,
      unreadCount,
      lastVisibleMessage,
    };
  }

  /**
   * Recall message (delete everywhere with placeholder)
   * @param messageReference Message ID or idempotencyKey to recall (supports both synced and pending messages)
   * @param userId User ID of sender
   * @returns Updated message document
   */
  static async recallMessage(
    messageReference: string,
    userId: string,
    force: boolean = false
  ): Promise<IMessage> {
    const message = await MessageModel.findOne(this.getMessageLookupQuery(messageReference));

    if (!message) {
      throw new BadRequestError('Message not found');
    }

    // Check sender and time limit if not forced
    if (!force) {
      if (message.senderId !== userId) {
        throw new BadRequestError('Only sender can recall own messages');
      }

      if (!this.canRecallMessage(message)) {
        throw new BadRequestError('Message is too old to recall (max 5 minutes)');
      }
    }

    // Mark as deleted
    message.isDeleted = true;
    message.deletedAt = new Date();
    message.deletedBy = userId;
    message.deleteType = 'recall';
    message.content = undefined; // Clear content
    message.mediaUrl = undefined; // Clear media
    await message.save();

    // Delete associated message status documents (optional cleanup)
    await MessageStatusModel.deleteMany({ idempotencyKey: message.idempotencyKey }).catch(() => {
      // Ignore if already deleted
    });

    logger.info(`[Recall] Message ${messageReference} recalled by user ${userId}`);
    return message.toObject() as unknown as IMessage;
  }

  static async recallMessageWithConversationSync(
    messageReference: string,
    userId: string,
    force: boolean = false,
  ): Promise<RecallSyncResult> {
    const message = await this.recallMessageWithRetry(messageReference, userId, force);
    const conversationLastMessage = await ConversationsService.recomputeConversationLastMessage(message.conversationId);

    return {
      message,
      conversationLastMessage,
    };
  }

  /**
   * Retry recall when message insert is still pending (race between workers).
   * Only retries on "Message not found" to avoid masking real permission/business errors.
   */
  static async recallMessageWithRetry(
    messageReference: string,
    userId: string,
    force: boolean = false,
    maxAttempts: number = this.RECALL_RETRY_MAX_ATTEMPTS,
  ): Promise<IMessage> {
    const attempts = Math.max(1, maxAttempts);
    let lastError: unknown;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.recallMessage(messageReference, userId, force);
      } catch (error) {
        lastError = error;
        const canRetry = this.isMessageNotFoundError(error) && attempt < attempts;
        if (!canRetry) {
          throw error;
        }

        const waitMs = this.RECALL_RETRY_BASE_DELAY_MS * attempt;
        logger.warn(
          `[Recall] Message ${messageReference} not found (attempt ${attempt}/${attempts}), retrying in ${waitMs}ms`,
        );
        await this.delay(waitMs);
      }
    }

    throw (lastError ?? new BadRequestError('Message not found'));
  }

  /**
   * Forward message to another conversation
   * Copies message content (text, media, type) and creates new message in target conversation
   * @param originalMessageId Message ID to forward
   * @param toConversationId Target conversation
   * @param userId User ID (sender/forwarder)
   * @param idempotencyKey Unique key for idempotency
   * @returns Created message
   */
  static async forwardMessage(
    originalMessageId: string,
    toConversationId: string,
    userId: string,
    idempotencyKey: string,
  ): Promise<IMessage> {
    // Step 1: Find original message
    const originalMessage = await MessageModel.findOne({
      idempotencyKey: idempotencyKey
    });

    if (!originalMessage) {
      throw new BadRequestError('Original message not found');
    }

    if (originalMessage.isDeleted) {
      throw new BadRequestError('Cannot forward deleted message');
    }

    // Step 2: Validate user is member of target conversation
    const isMember = await ConversationMemberModel.exists({
      conversationId: toConversationId,
      userId,
    });

    if (!isMember) {
      throw new BadRequestError('You are not a member of target conversation');
    }

    // Step 3: Copy message data (content, type, mediaUrl)
    const forwardedMessage = await this.createMessage(
      toConversationId,
      userId,
      originalMessage.content || '',
      originalMessage.type,
      uuidv4(),
      originalMessage.mediaUrl,
    );

    logger.info(`[Forward] Message ${originalMessageId} forwarded to ${toConversationId} by user ${userId}`);
    return forwardedMessage;
  }

  static async getReactionSummary(
    messageRef: string,
    userId: string,
  ): Promise<{
    messageId: string;
    conversationId: string;
    summary: { totalCount: number; emojiCounts: Record<string, number> };
  }> {
    const summary = await MessageReactionsService.getSummaryByMessageRef(messageRef);
    if (!summary) {
      throw new BadRequestError('Message not found', 'MESSAGE_NOT_FOUND');
    }

    const isMember = await ConversationMemberModel.exists({
      conversationId: summary.conversationId,
      userId,
    });

    if (!isMember) {
      throw new BadRequestError('Not allowed to view reactions for this conversation', 'FORBIDDEN');
    }

    return summary;
  }

  static async getReactionDetails(
    messageRef: string,
    userId: string,
  ): Promise<{
    messageId: string;
    conversationId: string;
    tabs: Array<{ emoji: string; count: number }>;
    rows: Array<{
      userId: string;
      displayName: string;
      avatarUrl?: string;
      lastEmoji: string | null;
      totalCount: number;
      emojiCounts: Record<string, number>;
    }>;
  }> {
    const details = await MessageReactionsService.getDetailsByMessageRef(messageRef);
    if (!details) {
      throw new BadRequestError('Message not found', 'MESSAGE_NOT_FOUND');
    }

    const isMember = await ConversationMemberModel.exists({
      conversationId: details.conversationId,
      userId,
    });

    if (!isMember) {
      throw new BadRequestError('Not allowed to view reactions for this conversation', 'FORBIDDEN');
    }

    return details;
  }

  static async refreshReadByPreviewForReadEvents(
    conversationId: string,
    messageRefs: string[],
  ): Promise<void> {
    if (!conversationId || !Array.isArray(messageRefs) || messageRefs.length === 0) {
      return;
    }

    const latestMessage = await MessageModel.findOne({
      conversationId,
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1, _id: -1 })
      .select('_id idempotencyKey')
      .lean();

    if (!latestMessage) {
      return;
    }

    const refSet = new Set(messageRefs.map((ref) => String(ref)));
    const latestMessageId = String(latestMessage._id);
    const latestIdempotencyKey = latestMessage.idempotencyKey ? String(latestMessage.idempotencyKey) : '';

    if (!refSet.has(latestMessageId) && (!latestIdempotencyKey || !refSet.has(latestIdempotencyKey))) {
      return;
    }

    await this.updateReadByPreview(latestMessageId);
  }

  private static async updateReadByPreview(messageReference: string): Promise<void> {
    const message = await MessageModel.findOne(this.getMessageLookupQuery(messageReference))
      .select('_id senderId isDeleted')
      .lean();

    if (!message || message.isDeleted) {
      return;
    }

    const readStatuses = await MessageStatusModel.find({
      messageId: String(message._id),
      status: 'read',
      userId: { $ne: String(message.senderId) },
    })
      .select('userId updatedAt')
      .lean();

    if (readStatuses.length === 0) {
      await MessageModel.updateOne({ _id: message._id }, { $set: { readByPreview: [] } });
      return;
    }

    const latestReadByUser = new Map<string, Date>();
    readStatuses.forEach((status: any) => {
      const targetUserId = String(status.userId);
      const targetUpdatedAt = new Date(status.updatedAt || Date.now());
      const existing = latestReadByUser.get(targetUserId);
      if (!existing || existing.getTime() < targetUpdatedAt.getTime()) {
        latestReadByUser.set(targetUserId, targetUpdatedAt);
      }
    });

    const sortedReaders = Array.from(latestReadByUser.entries())
      .sort((a, b) => b[1].getTime() - a[1].getTime())
      .slice(0, 3);

    const readerIds = sortedReaders.map(([readerId]) => readerId);
    const users = readerIds.length > 0
      ? await UserModel.find({ _id: { $in: readerIds } }).select('displayName avatarUrl').lean()
      : [];

    const userById = new Map<string, { displayName: string; avatarUrl?: string }>();
    users.forEach((user: any) => {
      userById.set(String(user._id), {
        displayName: user.displayName || 'Nguoi dung',
        avatarUrl: user.avatarUrl,
      });
    });

    const readByPreview = sortedReaders.map(([readerId, readAt]) => {
      const profile = userById.get(readerId);
      return {
        userId: readerId,
        displayName: profile?.displayName || 'Nguoi dung',
        avatarUrl: profile?.avatarUrl,
        readAt,
      };
    });

    await MessageModel.updateOne({ _id: message._id }, { $set: { readByPreview } });
  }

}
