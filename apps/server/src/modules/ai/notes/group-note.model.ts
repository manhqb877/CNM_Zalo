import { Schema, model, type Document } from 'mongoose';

export type AiGroupNoteStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface AiGroupNoteEvidenceItem {
  text: string;
  sourceMessageRefs: string[];
}

export interface IAiGroupNote extends Document {
  userId: string;
  conversationId: string;
  title?: string;
  content?: string;
  decisions: AiGroupNoteEvidenceItem[];
  openQuestions: AiGroupNoteEvidenceItem[];
  actionItems: AiGroupNoteEvidenceItem[];
  sourceMessageRefs: string[];
  fromMessageRef: string;
  toMessageRef: string;
  messageRefs: string[];
  messageCount: number;
  pinned: boolean;
  status: AiGroupNoteStatus;
  error?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const evidenceItemSchema = new Schema<AiGroupNoteEvidenceItem>(
  {
    text: { type: String, required: true, maxlength: 700 },
    sourceMessageRefs: [{ type: String, required: true }],
  },
  { _id: false },
);

const groupNoteSchema = new Schema<IAiGroupNote>(
  {
    userId: { type: String, required: true, index: true },
    conversationId: { type: String, required: true, index: true },
    title: { type: String, maxlength: 160 },
    content: { type: String, maxlength: 4000 },
    decisions: { type: [evidenceItemSchema], default: [] },
    openQuestions: { type: [evidenceItemSchema], default: [] },
    actionItems: { type: [evidenceItemSchema], default: [] },
    sourceMessageRefs: [{ type: String }],
    fromMessageRef: { type: String, required: true },
    toMessageRef: { type: String, required: true },
    messageRefs: [{ type: String, required: true }],
    messageCount: { type: Number, required: true, min: 0 },
    pinned: { type: Boolean, default: false, index: true },
    status: { type: String, enum: ['queued', 'processing', 'ready', 'failed'], default: 'queued', index: true },
    error: { type: String },
    generatedAt: { type: Date },
  },
  { timestamps: true },
);

groupNoteSchema.add({ model: { type: String } } as Record<string, unknown>);
groupNoteSchema.index({ userId: 1, conversationId: 1, pinned: -1, createdAt: -1 });
groupNoteSchema.index({ status: 1, updatedAt: 1 });

export const AiGroupNoteModel = model<IAiGroupNote>('AiGroupNote', groupNoteSchema);
