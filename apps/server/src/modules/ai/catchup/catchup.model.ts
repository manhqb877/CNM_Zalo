import { Schema, model, type Document } from 'mongoose';

export type AiCatchupDigestTrigger = 'manual' | 'auto_suggested';
export type AiCatchupDigestStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type AiCatchupMode = 'unread' | 'since_last_digest' | 'recent';

export interface AiCatchupSummary {
  title: string;
  overview: string;
  bullets: string[];
  mentionedUserIds: string[];
  sourceMessageRefs: string[];
}

export interface AiCatchupFutureSignals {
  decisions: string[];
  questionsForUser: string[];
  actionItems: Array<{ text: string; sourceMessageRefs: string[] }>;
  suggestedReplies: string[];
}

export interface IAiCatchupDigest extends Document {
  userId: string;
  conversationId: string;
  cacheKey: string;
  fromMessageRef: string;
  toMessageRef: string;
  messageRefs: string[];
  messageCount: number;
  omittedOlderCount: number;
  catchupMode?: AiCatchupMode;
  trigger: AiCatchupDigestTrigger;
  status: AiCatchupDigestStatus;
  summary?: AiCatchupSummary;
  futureSignals?: AiCatchupFutureSignals;
  inputHash: string;
  error?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const summarySchema = new Schema<AiCatchupSummary>(
  {
    title: { type: String, required: true, maxlength: 160 },
    overview: { type: String, required: true, maxlength: 1200 },
    bullets: [{ type: String, maxlength: 500 }],
    mentionedUserIds: [{ type: String }],
    sourceMessageRefs: [{ type: String }],
  },
  { _id: false },
);

const futureSignalsSchema = new Schema<AiCatchupFutureSignals>(
  {
    decisions: [{ type: String, maxlength: 500 }],
    questionsForUser: [{ type: String, maxlength: 500 }],
    actionItems: [
      {
        text: { type: String, required: true, maxlength: 500 },
        sourceMessageRefs: [{ type: String }],
      },
    ],
    suggestedReplies: [{ type: String, maxlength: 300 }],
  },
  { _id: false },
);

const catchupDigestSchema = new Schema<IAiCatchupDigest>(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    cacheKey: { type: String, required: true },
    fromMessageRef: { type: String, required: true },
    toMessageRef: { type: String, required: true },
    messageRefs: [{ type: String, required: true }],
    messageCount: { type: Number, required: true, min: 0 },
    omittedOlderCount: { type: Number, default: 0, min: 0 },
    catchupMode: { type: String, enum: ['unread', 'since_last_digest', 'recent'] },
    trigger: { type: String, enum: ['manual', 'auto_suggested'], default: 'manual' },
    status: { type: String, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued' },
    summary: { type: summarySchema },
    futureSignals: { type: futureSignalsSchema },
    inputHash: { type: String, required: true },
    error: { type: String },
    generatedAt: { type: Date },
  },
  { timestamps: true },
);

catchupDigestSchema.add({ model: { type: String } } as Record<string, unknown>);
catchupDigestSchema.index({ cacheKey: 1 }, { unique: true });
catchupDigestSchema.index({ userId: 1, conversationId: 1, createdAt: -1 });
catchupDigestSchema.index({ status: 1, updatedAt: 1 });

export const AiCatchupDigestModel = model<IAiCatchupDigest>('AiCatchupDigest', catchupDigestSchema);
