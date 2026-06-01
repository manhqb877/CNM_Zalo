// Kiểu dữ liệu dùng chung cho server, web và mobile

// Kiểu dữ liệu User
export interface User {
  _id: string;
  username?: string;
  email?: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

// Kiểu dữ liệu Friendship
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

export interface Friendship {
  _id: string;
  userId: string;
  friendId: string;
  status: FriendshipStatus;
  createdAt: string;
}

// Kiểu dữ liệu Conversation
export type ConversationType = 'direct' | 'group';

export interface Conversation {
  _id: string;
  type: ConversationType;
  name?: string;
  avatarUrl?: string;
  members: string[];
  lastMessage?: {
    content: string;
    senderId: string;
    sentAt: string;
  };
  unreadCount: number;
  updatedAt: string;
}

// Kiểu dữ liệu Message
export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'sticker' | `file/${string}` | 'system-recall' | 'call_history' | 'call' | 'system';
export type MessageStatus = 'sent' | 'delivered' | 'read';

export interface MessageReactionSummary {
  totalCount: number;
  emojiCounts: Record<string, number>;
}

export interface MessageReactionUserState {
  lastEmoji: string | null;
  totalCount: number;
  emojiCounts: Record<string, number>;
}

export interface MessageReplyTo {
  messageRef: string;
  messageId?: string;
  senderId?: string;
  senderDisplayName?: string;
  contentPreview?: string;
  type?: string;
  isDeleted?: boolean;
}

export interface MessageReadParticipant {
  userId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface MessageReadParticipantWithTime extends MessageReadParticipant {
  readAt: string;
}

export interface SenderInMessage {
  senderId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface CallHistory {
  callSessionId: string;
  callType: 'audio' | 'video';
  status: 'ended' | 'missed' | 'rejected' | 'cancelled';
  startedAt?: string | Date;
  endedAt?: string | Date;
  durationSeconds?: number;
  callerId: string;
  participantIds: string[];
}

export interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  sender?: SenderInMessage;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  callHistory?: CallHistory;
  moderationWarning?: boolean;
  replyTo?: MessageReplyTo;
  idempotencyKey: string;
  status: MessageStatus;
  createdAt: string;
  reactionSummary?: MessageReactionSummary;
  reactionUserState?: MessageReactionUserState;
  readBy?: MessageReadParticipantWithTime[];
  readByPreview?: MessageReadParticipantWithTime[];
  sentTo?: MessageReadParticipant[];
}

// Payload cho Socket.IO events

// Client gửi lên Server
export interface SendMessagePayload {
  conversationId: string;
  content: string;
  type: MessageType;
  idempotencyKey: string;
  mediaUrl?: string;
  replyToMessageRef?: string;
  replyToMessageId?: string;
  replyToPreview?: string;
  replyToSenderId?: string;
  replyToSenderDisplayName?: string;
  replyToType?: string;
}

export interface MessageReadPayload {
  conversationId: string;
  messageIds: string[];
}

export interface TypingPayload {
  conversationId: string;
}

// Server gửi xuống Client
export interface ReceiveMessagePayload {
  messageId: string;
  conversationId: string;
  idempotencyKey: string;
  senderId: string;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  callHistory?: CallHistory;
  moderationWarning?: boolean;
  replyTo?: MessageReplyTo;
  createdAt: string;
}

export interface StatusUpdatePayload {
  messageId?: string;
  messageIds?: string[];
  idempotencyKeys?: string[];
  conversationId?: string;
  status: MessageStatus;
  userId: string;
  updatedAt?: string;
  reader?: MessageReadParticipantWithTime;
}

export interface TypingIndicatorPayload {
  userId: string;
  conversationId: string;
  isTyping: boolean;
}

export type AiCatchupDigestStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type AiCatchupDigestTrigger = 'manual' | 'auto_suggested';
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

export interface AiCatchupDigest {
  _id: string;
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
  model?: string;
  inputHash: string;
  error?: string;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiCatchupDigestUpdatedPayload {
  digestId: string;
  conversationId: string;
  status: AiCatchupDigestStatus;
  summary?: AiCatchupSummary;
  error?: string;
  updatedAt: string;
}

// ─── AI Reminders ──────────────────────────────────────────────────────────────
export type AiReminderStatus = 'suggested' | 'accepted' | 'done' | 'dismissed';
export type AiReminderCreatedBy = 'ai_suggestion' | 'user';

export interface AiReminder {
  _id: string;
  userId: string;
  conversationId: string;
  digestId?: string;
  sourceMessageRefs: string[];
  title: string;
  description?: string;
  dueAt?: string;
  status: AiReminderStatus;
  createdBy: AiReminderCreatedBy;
  createdAt: string;
  updatedAt: string;
}

export interface AiReminderUpdatedPayload extends Omit<AiReminder, 'status'> {
  status: AiReminderStatus | 'deleted';
}

// ─── AI Assistant Box ────────────────────────────────────────────────────────────
export type AiItemType = 'catchup_digest' | 'task' | 'search_result' | 'group_note';
export type AiItemStatus = 'not_started' | 'queued' | 'processing' | 'ready' | 'failed';

export interface AiAssistantItemMetadata {
  unreadCount?: number;
  latestMessageAt?: string;
  lastDigestAt?: string;
  catchupMode?: AiCatchupMode;
  actionItemCount?: number;
  messageCount?: number;
  taskStatus?: AiReminderStatus;
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
  conversationType?: ConversationType;
  noteId?: string;
  pinned?: boolean;
  decisionCount?: number;
  openQuestionCount?: number;
  deleted?: boolean;
}

export interface AiAssistantItem {
  _id: string;
  userId: string;
  type: AiItemType;
  conversationId?: string;
  refId?: string;
  status: AiItemStatus;
  title?: string;
  summarySnippet?: string;
  metadata?: AiAssistantItemMetadata;
  trigger: 'manual' | 'auto';
  createdAt: string;
  updatedAt: string;
}

export interface AiAssistantItemPayload {
  itemId: string;
  type: AiItemType;
  conversationId?: string;
  status: AiItemStatus;
  title?: string;
  summarySnippet?: string;
  metadata?: AiAssistantItemMetadata;
  detail?: unknown;
  error?: string;
  updatedAt: string;
}

export interface AiAssistantSearchResult {
  itemId?: string;
  conversationId: string;
  conversationName: string;
  conversationAvatarUrl?: string | null;
  conversationType?: ConversationType;
  messageId: string;
  messageRef: string;
  senderId: string;
  senderName: string;
  snippet: string;
  messageSnippet: string;
  createdAt: string;
  timestamp: string;
  score: number;
  similarity?: number;
  source?: 'semantic' | 'keyword';
  matchReason?: string;
}

export interface AiAssistantSearchPerson {
  senderId: string;
  senderName: string;
  conversationIds: string[];
  conversationNames: string[];
  count: number;
  score: number;
  reason: string;
  evidenceMessageRefs: string[];
}

export interface AiGroupNoteEvidenceItem {
  text: string;
  sourceMessageRefs: string[];
}

export interface AiGroupNote {
  _id: string;
  userId: string;
  conversationId: string;
  conversationName?: string;
  conversationAvatarUrl?: string | null;
  conversationType?: ConversationType;
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
  status: AiItemStatus;
  model?: string;
  error?: string;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserOnlinePayload {
  userId: string;
  online: boolean;
  lastSeen?: string;
}

export interface FriendRequestPayload {
  requestId: string;
  fromUserId: string;
  createdAt: string;
}

export interface GroupUpdatedPayload {
  groupId: string;
  type: 'member_added' | 'member_removed' | 'name_changed' | 'avatar_changed' | 'disbanded';
  data: Record<string, unknown>;
}

// Kiểu dữ liệu Sticker
export interface ISticker {
  stickerId: string;
  mediaUrl: string;
  alt?: string;
  category?: string;
}

export interface IStickerPack {
  _id?: string;
  packId: string;
  packName: string;
  packDescription?: string;
  stickers: ISticker[];
  icon?: string;
  order: number;
  createdAt?: string;
  updatedAt?: string;
}

// ─── AI Provider abstraction ──────────────────────────────────────────────────
export type AIProviderType = 'gemini' | 'openrouter';

export interface AIProviderResult {
  text: string;
  modelId: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  readonly type: AIProviderType;
  readonly modelId: string;
  generateJson(prompt: string, repairRaw?: string): Promise<AIProviderResult>;
}

// ─── Wrapper Response chuẩn cho REST API ─────────────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
}
