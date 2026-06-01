import { Schema, model, type Document } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export type ModerationLabel = 'safe' | 'warning' | 'blocked';
export type ModerationAction = 'pass' | 'flag' | 'block' | 'mute_user';
export type ModerationSource = 'gemini' | 'keyword_filter' | 'manual';
export type ContentType = 'text' | 'image' | 'video' | 'audio' | 'file';

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IModerationLog {
  messageId: string;           // MongoDB ObjectId string ref to messages collection
  conversationId: string;
  senderId: string;
  contentType: ContentType;
  contentText?: string;        // text content (truncated to 2000 chars for storage)
  mediaUrl?: string;           // for image/video moderation

  // Classification result
  label: ModerationLabel;
  confidence: number;          // 0.0 – 1.0
  reason?: string;             // short explanation from AI or keyword match

  // Action taken
  action: ModerationAction;
  source: ModerationSource;

  // Timestamps
  createdAt: Date;
  reviewedAt?: Date;           // when admin manually reviewed
  reviewedBy?: string;         // admin userId
}

export interface IModerationLogDocument extends IModerationLog, Document {}

// ─── Schema ───────────────────────────────────────────────────────────────────

const ModerationLogSchema = new Schema<IModerationLogDocument>(
  {
    messageId:     { type: String, required: true, index: true },
    conversationId:{ type: String, required: true, index: true },
    senderId:      { type: String, required: true, index: true },
    contentType:   { type: String, enum: ['text','image','video','audio','file'], required: true },
    contentText:   { type: String, maxlength: 2000 },
    mediaUrl:      { type: String },

    label:         { type: String, enum: ['safe','warning','blocked'], required: true },
    confidence:    { type: Number, min: 0, max: 1, required: true },
    reason:        { type: String },

    action:        { type: String, enum: ['pass','flag','block','mute_user'], required: true },
    source:        { type: String, enum: ['gemini','keyword_filter','manual'], required: true },

    reviewedAt:    { type: Date },
    reviewedBy:    { type: String },
  },
  {
    timestamps: { createdAt: 'createdAt', updatedAt: false },
    collection: 'moderation_logs',
  },
);

// Compound index for admin query: list flagged/blocked by conversation
ModerationLogSchema.index({ label: 1, createdAt: -1 });
ModerationLogSchema.index({ senderId: 1, createdAt: -1 });

// Auto-expire safe logs after 7 days to keep collection lean (configurable)
ModerationLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 3600, partialFilterExpression: { label: 'safe' } },
);

export const ModerationLogModel = model<IModerationLogDocument>('ModerationLog', ModerationLogSchema);
