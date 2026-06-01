import { Schema, model, type Document } from 'mongoose';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'sticker' | `file/${string}` | 'system-recall' | 'call_history';
export type MessageStatus = 'sent' | 'delivered' | 'read';
export type DeleteType = 'unsend' | 'recall';

export interface IReplyTo {
  messageRef: string;
  messageId?: string;
  senderId?: string;
  senderDisplayName?: string;
  contentPreview?: string;
  type?: string;
  isDeleted?: boolean;
}

export interface IReadByPreviewItem {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  readAt: Date;
}

export interface ICallHistory {
  callSessionId: string;
  callType: 'audio' | 'video';
  status: 'ended' | 'missed' | 'rejected' | 'cancelled';
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  callerId: string;
  participantIds: string[];
}

export interface IMessage extends Document {
  conversationId: string;
  senderId: string;
  content?: string;
  type: MessageType;
  mediaUrl?: string;
  callHistory?: ICallHistory;
  replyTo?: IReplyTo;
  idempotencyKey: string;
  
    // Deletion fields
  isDeleted: boolean;
  deletedAt?: Date;
  deletedBy?: string;
  deleteType?: DeleteType;
  deletedFor?: string[];
  
  // Chat Reactions
  reactions?: Array<{ type: string; userId: string }>;
  moderationWarning?: boolean;
  readByPreview?: IReadByPreviewItem[];

  createdAt: Date;
}

const reactionSchema = new Schema(
  {
    type: { type: String, required: true },
    userId: { type: String, required: true },
  },
  { _id: false },
);

const replyToSchema = new Schema<IReplyTo>(
  {
    messageRef: { type: String, required: true },
    messageId: { type: String },
    senderId: { type: String },
    senderDisplayName: { type: String },
    contentPreview: { type: String },
    type: { type: String },
    isDeleted: { type: Boolean, default: false },
  },
  { _id: false },
);

const readByPreviewSchema = new Schema<IReadByPreviewItem>(
  {
    userId: { type: String, required: true },
    displayName: { type: String, required: true },
    avatarUrl: { type: String },
    readAt: { type: Date, required: true },
  },
  { _id: false },
);

const callHistorySchema = new Schema<ICallHistory>(
  {
    callSessionId: { type: String, required: true },
    callType: { type: String, enum: ['audio', 'video'], required: true },
    status: { type: String, enum: ['ended', 'missed', 'rejected', 'cancelled'], required: true },
    startedAt: { type: Date },
    endedAt: { type: Date },
    durationSeconds: { type: Number },
    callerId: { type: String, required: true },
    participantIds: [{ type: String, required: true }],
  },
  { _id: false },
);

const messageSchema = new Schema<IMessage>(
  {
    conversationId: { type: String, required: true },
    senderId: { type: String, required: true },
    content: { type: String, required: false },
    type: {
      type: String,
      validate: {
        validator: (v: string) => /^(text|image|video|audio|sticker|system-recall|call_history|file\/.+)$/.test(v),
        message: 'Invalid message type. Must be: text, image, video, audio, sticker, call_history, system-recall, or file/<filename>'
      },
      default: 'text',
    },
    mediaUrl: { type: String },
    callHistory: { type: callHistorySchema },
    replyTo: { type: replyToSchema },
    idempotencyKey: { type: String, required: true, unique: true },
    
    // Chat Reactions
    reactions: { type: [reactionSchema], default: [] },
    moderationWarning: { type: Boolean, default: false },
    readByPreview: { type: [readByPreviewSchema], default: [] },
    
    // Deletion fields
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
    deletedBy: { type: String },
    deleteType: { type: String, enum: ['unsend', 'recall'] },
    deletedFor: [{ type: String }],
  },
  { timestamps: true },
);

messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ isDeleted: 1 });

export const MessageModel = model<IMessage>('Message', messageSchema);
