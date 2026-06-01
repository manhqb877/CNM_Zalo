import { Schema, model, type Document } from 'mongoose';

export interface IMessageReactionSummary extends Document {
  messageId: string;
  conversationId: string;
  emojiCounts: Map<string, number>;
  totalCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const messageReactionSummarySchema = new Schema<IMessageReactionSummary>(
  {
    messageId: { type: String, required: true, unique: true },
    conversationId: { type: String, required: true },
    emojiCounts: { type: Map, of: Number, default: {} },
    totalCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

messageReactionSummarySchema.index({ conversationId: 1, updatedAt: -1 });

export const MessageReactionSummaryModel = model<IMessageReactionSummary>(
  'MessageReactionSummary',
  messageReactionSummarySchema,
);
