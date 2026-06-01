import { Schema, model, type Document } from 'mongoose';

export type AiItemType =
  | 'catchup_digest'
  | 'task'
  | 'search_result'
  | 'group_note';

export type AiItemStatus =
  | 'not_started'
  | 'queued'
  | 'processing'
  | 'ready'
  | 'failed';

export type AiCatchupMode = 'unread' | 'since_last_digest' | 'recent';

export interface IAiAssistantItem extends Document {
  userId: string;
  type: AiItemType;

  // Index fields
  conversationId?: string;
  refId?: string; // FK to detail table (AiCatchupDigest._id, AiTask._id, etc.)

  // Status & Preview
  status: AiItemStatus;
  title?: string;
  summarySnippet?: string;

  // Metadata (varies by type)
  metadata?: {
    unreadCount?: number;
    latestMessageAt?: string;
    lastDigestAt?: string;
    catchupMode?: AiCatchupMode;
    actionItemCount?: number;
    messageCount?: number;
    taskStatus?: 'suggested' | 'accepted' | 'done' | 'dismissed';
    dueAt?: string;
    searchQuery?: string;
    searchHash?: string;
    searchRank?: number;
    similarity?: number;
    messageId?: string;
    messageRef?: string;
    messageCreatedAt?: string;
    senderId?: string;
    senderName?: string;
    source?: 'semantic' | 'keyword';
    matchReason?: string;
    conversationName?: string;
    conversationType?: 'direct' | 'group';
    noteId?: string;
    pinned?: boolean;
    decisionCount?: number;
    openQuestionCount?: number;
  };

  // System
  trigger: 'manual' | 'auto';
  createdAt: Date;
  updatedAt: Date;
}

const assistantItemSchema = new Schema<IAiAssistantItem>(
  {
    userId: { type: String, required: true, index: true },
    type: {
      type: String,
      required: true,
      enum: ['catchup_digest', 'task', 'search_result', 'group_note'],
      index: true,
    },
    conversationId: { type: String, index: true },
    refId: { type: String },
    status: {
      type: String,
      required: true,
      enum: ['not_started', 'queued', 'processing', 'ready', 'failed'],
      default: 'not_started',
      index: true,
    },
    title: { type: String, maxlength: 80 },
    summarySnippet: { type: String, maxlength: 200 },
    metadata: {
      unreadCount: { type: Number },
      latestMessageAt: { type: String },
      lastDigestAt: { type: String },
      catchupMode: { type: String, enum: ['unread', 'since_last_digest', 'recent'] },
      actionItemCount: { type: Number },
      messageCount: { type: Number },
      taskStatus: { type: String, enum: ['suggested', 'accepted', 'done', 'dismissed'] },
      dueAt: { type: String },
      searchQuery: { type: String, maxlength: 300 },
      searchHash: { type: String, index: true },
      searchRank: { type: Number },
      similarity: { type: Number },
      messageId: { type: String },
      messageRef: { type: String },
      messageCreatedAt: { type: String },
      senderId: { type: String },
      senderName: { type: String, maxlength: 120 },
      source: { type: String, enum: ['semantic', 'keyword'] },
      matchReason: { type: String, maxlength: 200 },
      conversationName: { type: String, maxlength: 120 },
      conversationType: { type: String, enum: ['direct', 'group'] },
      noteId: { type: String },
      pinned: { type: Boolean },
      decisionCount: { type: Number },
      openQuestionCount: { type: Number },
    },
    trigger: { type: String, enum: ['manual', 'auto'], default: 'manual' },
  },
  { timestamps: true },
);

// Compound indexes
assistantItemSchema.index({ userId: 1, type: 1, status: 1, createdAt: -1 });
assistantItemSchema.index({ userId: 1, type: 1, conversationId: 1, createdAt: -1 });
assistantItemSchema.index({ userId: 1, type: 1, refId: 1 });

export const AiAssistantItemModel = model<IAiAssistantItem>('AiAssistantItem', assistantItemSchema);
