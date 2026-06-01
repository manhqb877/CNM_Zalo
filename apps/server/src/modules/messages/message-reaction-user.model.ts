import { Schema, model, type Document } from 'mongoose';
import { REACTION_EMOJIS } from './message-reaction.types';

export interface IMessageReactionUser extends Document {
  messageId: string;
  conversationId: string;
  userId: string;
  emojiCounts: Map<string, number>;
  totalCount: number;
  lastEmoji: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const messageReactionUserSchema = new Schema<IMessageReactionUser>(
  {
    messageId: { type: String, required: true },
    conversationId: { type: String, required: true },
    userId: { type: String, required: true },
    emojiCounts: { type: Map, of: Number, default: {} },
    totalCount: { type: Number, default: 0 },
    lastEmoji: { type: String, enum: REACTION_EMOJIS, default: null },
  },
  { timestamps: true },
);

messageReactionUserSchema.index({ messageId: 1, userId: 1 }, { unique: true });
messageReactionUserSchema.index({ conversationId: 1, messageId: 1 });

export const MessageReactionUserModel = model<IMessageReactionUser>('MessageReactionUser', messageReactionUserSchema);
