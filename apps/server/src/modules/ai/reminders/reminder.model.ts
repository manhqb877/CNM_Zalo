import { Schema, model, type Document } from 'mongoose';

export type AiReminderStatus = 'suggested' | 'accepted' | 'done' | 'dismissed';
export type AiReminderCreatedBy = 'ai_suggestion' | 'user';

export interface IAiReminder extends Document {
  userId: string;
  conversationId: string;
  digestId?: string;
  sourceMessageRefs: string[];
  title: string;
  description?: string;
  dueAt?: Date;
  status: AiReminderStatus;
  createdBy: AiReminderCreatedBy;
  createdAt: Date;
  updatedAt: Date;
}

const reminderSchema = new Schema<IAiReminder>(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    digestId: { type: String, index: true },
    sourceMessageRefs: [{ type: String }],
    title: { type: String, required: true, maxlength: 300 },
    description: { type: String, maxlength: 1000 },
    dueAt: { type: Date },
    status: {
      type: String,
      enum: ['suggested', 'accepted', 'done', 'dismissed'],
      default: 'accepted',
      index: true,
    },
    createdBy: {
      type: String,
      enum: ['ai_suggestion', 'user'],
      default: 'user',
    },
  },
  { timestamps: true },
);

reminderSchema.index({ userId: 1, conversationId: 1, status: 1 });
reminderSchema.index({ userId: 1, status: 1, dueAt: 1 });

export const AiReminderModel = model<IAiReminder>('AiReminder', reminderSchema);
