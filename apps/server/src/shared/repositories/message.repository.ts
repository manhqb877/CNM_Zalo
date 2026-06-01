import { type IMessage, MessageModel } from '../../modules/messages/message.model';
import { BaseRepository } from '../../shared/repositories/base.repository';
import type { FilterQuery } from 'mongoose';
import type { Document } from 'mongoose';

/**
 * MessageRepository - Tầng truy xuất dữ liệu cho Message
 * Service không được gọi trực tiếp MessageModel, phải đi qua Repository này.
 */
export class MessageRepository extends BaseRepository<IMessage & Document> {
  constructor() {
    super(MessageModel as any);
  }

  /**
   * Tìm message theo conversationId với cursor pagination
   */
  async findByConversation(
    conversationId: string,
    cursor?: { createdAt: Date; messageId: string },
    limit: number = 20,
  ): Promise<(IMessage & Document)[]> {
    let query: FilterQuery<IMessage & Document> = { conversationId };

    if (cursor) {
      query = {
        ...query,
        $or: [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor.messageId } },
        ],
      };
    }

    return this.model
      .find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean() as unknown as (IMessage & Document)[];
  }

  /**
   * Tìm message bằng idempotencyKey (để check duplicate)
   */
  async findByIdempotencyKey(idempotencyKey: string): Promise<(IMessage & Document) | null> {
    return this.model.findOne({ idempotencyKey }).lean() as unknown as (IMessage & Document) | null;
  }

  /**
   * Tìm message bằng real _id HOẶC idempotencyKey (dùng cho realtime flows)
   */
  async findByReference(reference: string): Promise<(IMessage & Document) | null> {
    return this.model.findOne({
      $or: [{ _id: reference }, { idempotencyKey: reference }],
    }).lean() as unknown as (IMessage & Document) | null;
  }

  /**
   * Tìm các messages chưa được đọc trong conversation
   */
  async findUnreadForUser(conversationId: string, excludeSenderId: string): Promise<Array<{ _id: string; idempotencyKey: string }>> {
    return this.model
      .find({ conversationId, senderId: { $ne: excludeSenderId } })
      .select('_id idempotencyKey')
      .lean() as unknown as Array<{ _id: string; idempotencyKey: string }>;
  }

  /**
   * Soft delete: đánh dấu message là đã xóa
   */
  async softDeleteForUser(messageId: string, userId: string): Promise<boolean> {
    return this.updateOne(
      { _id: messageId },
      { $addToSet: { deletedFor: userId } },
    );
  }

  /**
   * Recall message (delete everywhere)
   */
  async recallMessage(messageId: string): Promise<boolean> {
    return this.updateOne(
      { _id: messageId },
      { isDeleted: true, deleteType: 'recall', content: '[Tin nhắn đã được thu hồi]', mediaUrl: undefined },
    );
  }
}

/** Singleton instance để inject vào container */
export const messageRepository = new MessageRepository();
