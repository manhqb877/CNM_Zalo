import { Schema, model, type Document } from 'mongoose';

export type ConversationType = 'direct' | 'group';

export interface IConversation extends Document {
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  createdBy?: string;
  adminIds: string[];
  memberApprovalEnabled?: boolean;
  category?: 'frontend'|'backend'|'devops'|'ai-ml'|'mobile'|'career'|'general'|'other';
  tags?: string[];
  description?: string;
  rules?: string;
  isPublic?: boolean;
  memberCount?: number;
  lastMessage?: {
    content: string;
    senderId: string;
    sentAt: Date;
  };
  activeCall?: {
    callSessionId: string;
    type: 'audio' | 'video';
    status: 'ringing' | 'connecting' | 'connected';
    startedAt?: Date;
    initiatedBy: string;
  };
  unreadCounts: Map<string, number>;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: { type: String, enum: ['direct', 'group'], required: true },
    name: { type: String },
    avatarUrl: { type: String },
    createdBy: { type: String },
    adminIds: [{ type: String }],
    memberApprovalEnabled: { type: Boolean, default: false },
    category: {
      type: String,
      enum: ['frontend','backend','devops','ai-ml','mobile','career','general','other'],
      default: 'general'
    },
    tags: [{ type: String }],
    description: { type: String, maxlength: 1000 },
    rules: { type: String, maxlength: 2000 },
    isPublic: { type: Boolean, default: false },
    memberCount: { type: Number, default: 0 },
    lastMessage: {
      content: { type: String },
      senderId: { type: String },
      sentAt: { type: Date },
    },
    activeCall: {
      callSessionId: { type: String },
      type: { type: String, enum: ['audio', 'video'] },
      status: { type: String, enum: ['ringing', 'connecting', 'connected'] },
      startedAt: { type: Date },
      initiatedBy: { type: String },
    },
    unreadCounts: { type: Map, of: Number, default: {} },
  },
  { timestamps: true },
);

conversationSchema.index({ 'unreadCounts': 1 });
conversationSchema.index({ 'lastMessage.sentAt': -1 });
conversationSchema.index({ updatedAt: -1 });

export const ConversationModel = model<IConversation>('Conversation', conversationSchema);
