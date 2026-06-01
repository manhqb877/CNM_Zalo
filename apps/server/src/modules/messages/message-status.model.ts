import { Schema, model, type Document } from 'mongoose';

export type MessageStatusValue = 'sent' | 'delivered' | 'read';

export interface IMessageStatus extends Document {
  messageId: string;
  idempotencyKey?: string; // Map temp → real ID
  userId: string;
  status: MessageStatusValue;
}

const messageStatusSchema = new Schema<IMessageStatus>(
  {
    messageId: { type: String, required: true },
    idempotencyKey: { type: String }, // Store for temp→real ID mapping
    userId: { type: String, required: true },
    status: { type: String, enum: ['sent', 'delivered', 'read'], required: true },
  },
  { timestamps: true },
);

messageStatusSchema.index({ messageId: 1, userId: 1 }, { unique: true });
messageStatusSchema.index({ idempotencyKey: 1, userId: 1 });
messageStatusSchema.index({ messageId: 1, status: 1 });

export const MessageStatusModel = model<IMessageStatus>('MessageStatus', messageStatusSchema);
