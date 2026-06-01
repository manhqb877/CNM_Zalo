import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { getRedis } from '../../../infrastructure/redis';
import { KAFKA_TOPICS, produceMessage } from '../../../infrastructure/kafka';
import { isNeonAvailable } from '../../../infrastructure/neon';
import { AI_MODELS, getModel, isAIEnabled } from '../../../infrastructure/gemini';
import { logger } from '../../../shared/logger';
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '../../../shared/errors';
import { ConversationMemberModel } from '../../conversations/conversation-member.model';
import { MessageModel } from '../../messages/message.model';
import { MessageStatusModel } from '../../messages/message-status.model';
import { ConversationModel } from '../../conversations/conversation.model';
import { UserModel } from '../../users/user.model';
import { emitAiAssistantItemUpdated } from '../../../socket/gateway';
import {
  AiAssistantItemModel,
  type IAiAssistantItem,
  type AiItemType,
  type AiItemStatus,
} from './assistant.model';
import {
  AiCatchupDigestModel,
  type IAiCatchupDigest,
  type AiCatchupMode,
} from '../catchup/catchup.model';
import {
  AiGroupNoteModel,
  type IAiGroupNote,
  type AiGroupNoteEvidenceItem,
} from '../notes/group-note.model';
import { embedText } from '../embeddings/embedding.service';
import {
  countMessageEmbeddings,
  searchSimilarMessagesInConversations,
} from '../embeddings/neon-vector.service';
import type {
  AssistantNotesQueryInput,
  AssistantSearchQueryInput,
  CreateCatchupDigestInput,
  CreateGroupNoteInput,
  UpdateGroupNoteInput,
} from './assistant.schema';

// Reuse logic from catchup service for snapshot creation
const DEBOUNCE_SECONDS = parseInt(process.env['AI_CATCHUP_DEBOUNCE_SECONDS'] ?? '45', 10);
const SNAPSHOT_LOOKBACK_LIMIT = 300;
const RECENT_SNAPSHOT_LIMIT = Math.min(
  50,
  Math.max(20, parseInt(process.env['AI_CATCHUP_RECENT_LIMIT'] ?? '30', 10)),
);
const staleAssistantJobSeconds = parseInt(process.env['AI_ASSISTANT_STALE_JOB_SECONDS'] ?? '180', 10);
const STALE_ASSISTANT_JOB_MS = (
  Number.isFinite(staleAssistantJobSeconds)
    ? Math.max(30, staleAssistantJobSeconds)
    : 180
) * 1000;
const SEARCH_KEYWORD_SCAN_LIMIT = Math.max(
  200,
  parseInt(process.env['AI_SEARCH_KEYWORD_SCAN_LIMIT'] ?? '1500', 10),
);
const SEARCH_BACKFILL_LIMIT = Math.max(
  50,
  parseInt(process.env['AI_SEARCH_BACKFILL_LIMIT'] ?? '500', 10),
);
const SEARCH_SYNTHESIS_CANDIDATE_LIMIT = Math.max(
  12,
  parseInt(process.env['AI_SEARCH_SYNTHESIS_CANDIDATE_LIMIT'] ?? '30', 10),
);
const SEARCH_SYNTHESIS_TIMEOUT_MS = Math.max(
  3000,
  parseInt(process.env['AI_SEARCH_SYNTHESIS_TIMEOUT_MS'] ?? '9000', 10),
);
const GROUP_NOTE_RECENT_LIMIT = Math.min(
  100,
  Math.max(50, parseInt(process.env['AI_GROUP_NOTE_RECENT_LIMIT'] ?? '80', 10)),
);

type CatchupMember = {
  conversationId: string;
  userId: string;
  unreadCount?: number;
  lastVisibleMessageRef?: string;
  aiPreferences?: {
    catchupEnabled?: boolean;
    smartSearchEnabled?: boolean;
  };
};

type CatchupConversation = {
  _id: unknown;
  type?: 'direct' | 'group';
  name?: string;
  avatarUrl?: string;
  unreadCounts?: unknown;
  lastMessage?: {
    sentAt?: Date | string | null;
  };
  updatedAt?: Date | string;
};

type CatchupUser = {
  _id: unknown;
  displayName?: string;
  avatarUrl?: string;
};

type SearchConversationMeta = {
  conversationId: string;
  name: string;
  avatarUrl: string | null;
  type: 'direct' | 'group';
};

type SearchMessage = {
  _id: unknown;
  conversationId: string;
  senderId: string;
  content?: string;
  type: string;
  idempotencyKey?: string;
  createdAt: Date;
};

type SearchResult = {
  itemId?: string;
  conversationId: string;
  conversationName: string;
  conversationAvatarUrl?: string | null;
  conversationType?: 'direct' | 'group';
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
  source: 'semantic' | 'keyword';
  matchReason?: string;
};

type SearchMode = 'semantic' | 'hybrid' | 'keyword_fallback' | 'saved';

type SearchPerson = {
  senderId: string;
  senderName: string;
  conversationIds: string[];
  conversationNames: string[];
  count: number;
  score: number;
  reason: string;
  evidenceMessageRefs: string[];
};

type SearchSynthesis = {
  mode: SearchMode;
  answer?: string;
  people: SearchPerson[];
  results: SearchResult[];
};

type GroupNoteSnapshot = {
  messageRefs: string[];
  fromMessageRef: string;
  toMessageRef: string;
  messageCount: number;
};

type CatchupMessageRef = {
  _id: unknown;
  idempotencyKey?: string;
  createdAt: Date;
};

type CatchupSnapshot = {
  mode: AiCatchupMode;
  messageRefs: string[];
  fromMessageRef: string;
  toMessageRef: string;
  messageCount: number;
  omittedOlderCount: number;
};

// ─── Serializers ───────────────────────────────────────────────────────────────

function serializeItem(item: IAiAssistantItem): Record<string, unknown> {
  return {
    _id: String(item._id),
    userId: item.userId,
    type: item.type,
    conversationId: item.conversationId,
    refId: item.refId,
    status: item.status,
    title: item.title,
    summarySnippet: item.summarySnippet,
    metadata: item.metadata,
    trigger: item.trigger,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

// ─── Rate limit / Debounce ────────────────────────────────────────────────────

async function checkDebounce(userId: string, conversationId: string): Promise<void> {
  const redis = getRedis();
  const key = `ai:assistant:debounce:${userId}:${conversationId}`;
  const result = await redis.set(key, '1', 'EX', DEBOUNCE_SECONDS, 'NX');
  if (result !== 'OK') {
    throw new TooManyRequestsError('AI request is already queued recently');
  }
}

// ─── Membership check ────────────────────────────────────────────────────────

async function assertMembership(conversationId: string, userId: string): Promise<void> {
  const member = await ConversationMemberModel.findOne({ conversationId, userId });
  if (!member) {
    throw new ForbiddenError('Not allowed to use AI Assistant for this conversation');
  }
  if (member.aiPreferences?.catchupEnabled === false) {
    throw new ForbiddenError('AI Catch-up is disabled for this conversation');
  }
}

async function assertSearchMembership(conversationId: string, userId: string): Promise<void> {
  const member = await ConversationMemberModel.findOne({ conversationId, userId })
    .select('aiPreferences')
    .lean<CatchupMember | null>();
  if (!member) {
    throw new ForbiddenError('Not allowed to search this conversation');
  }
  if (member.aiPreferences?.smartSearchEnabled === false) {
    throw new ForbiddenError('AI Smart Search is disabled for this conversation');
  }
}

// ─── Conversation metadata helpers ─────────────────────────────────────────────

function getMessageRef(message: { _id: unknown; idempotencyKey?: string }): string {
  return message.idempotencyKey || String(message._id);
}

function hashParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

function normalizeSearchQuery(query: string): string {
  return query.replace(/\s+/g, ' ').trim();
}

function normalizeVietnameseText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const SEARCH_STOP_WORDS = new Set([
  'ai',
  'la',
  'là',
  'nguoi',
  'người',
  'toi',
  'tôi',
  'minh',
  'mình',
  'ban',
  'bạn',
  'co',
  'có',
  'khong',
  'không',
  'cua',
  'của',
  'cho',
  've',
  'về',
  'hom',
  'hôm',
  'qua',
  'nay',
  'nao',
  'nào',
  'gi',
  'gì',
]);

function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeVietnameseText(query);
  return Array.from(new Set(
    normalized
      .split(' ')
      .map((term) => term.trim())
      .filter((term) => term.length >= 2 && !SEARCH_STOP_WORDS.has(term)),
  ));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSearchSnippet(text: string, query: string): string {
  const compactText = text.replace(/\s+/g, ' ').trim();
  if (compactText.length <= 220) return compactText;

  const lowerText = compactText.toLowerCase();
  const terms = normalizeSearchQuery(query).toLowerCase().split(' ').filter(Boolean);
  const firstHit = terms
    .map((term) => lowerText.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? -1;
  const start = firstHit > 70 ? Math.max(0, firstHit - 70) : 0;
  const end = Math.min(compactText.length, start + 220);
  const prefix = start > 0 ? '...' : '';
  const suffix = end < compactText.length ? '...' : '';
  return `${prefix}${compactText.slice(start, end)}${suffix}`;
}

function toSearchMessageRef(message: SearchMessage): string {
  return message.idempotencyKey || String(message._id);
}

function scoreKeywordMatch(messageText: string, query: string, terms: string[]): number {
  const normalizedText = normalizeVietnameseText(messageText);
  const normalizedQuery = normalizeVietnameseText(query);
  if (!normalizedText || terms.length === 0) return 0;

  const matchedTerms = terms.filter((term) => normalizedText.includes(term));
  if (matchedTerms.length === 0) return 0;

  let score = matchedTerms.length / terms.length;
  if (normalizedQuery && normalizedText.includes(normalizedQuery)) {
    score += 0.5;
  }
  if (terms.includes('da') && terms.includes('bong') && normalizedText.includes('da bong')) {
    score += 0.35;
  }
  if (terms.includes('ru') && normalizedText.includes('ru')) {
    score += 0.2;
  }
  return Math.min(1, Math.round(score * 1000) / 1000);
}

function buildSearchAnswer(results: SearchResult[], query: string): string | undefined {
  if (results.length === 0) return undefined;

  const normalizedQuery = normalizeVietnameseText(query);
  const people = buildSearchPeople(results, query);
  const topPerson = people[0];

  if ((normalizedQuery.includes('ai') || normalizedQuery.includes('nguoi')) && topPerson) {
    const topResult = results.find((result) => topPerson.evidenceMessageRefs.includes(result.messageRef));
    const text = normalizeVietnameseText(topResult?.messageSnippet ?? topResult?.snippet ?? '');
    if (text.includes('da bong')) {
      return `Có vẻ ${topPerson.senderName} từng rủ hoặc nhắc bạn đi đá bóng.`;
    }
    if (normalizedQuery.includes('loi') && normalizedQuery.includes('code')) {
      return `${topPerson.senderName} là người liên quan nhất đến các tin về lỗi code.`;
    }
    return `Có vẻ ${topPerson.senderName} là người liên quan nhất theo các tin nhắn tìm được.`;
  }

  if (
    normalizedQuery.includes('hom nao') ||
    normalizedQuery.includes('khi nao') ||
    normalizedQuery.includes('ngay nao') ||
    normalizedQuery.includes('thoi gian') ||
    normalizedQuery.includes('nop bao cao')
  ) {
    const firstTime = extractVietnameseTimeHint(results[0]?.messageSnippet ?? results[0]?.snippet ?? '');
    if (firstTime) return `Mốc thời gian tìm thấy: ${firstTime}.`;
  }

  return 'Mình tìm thấy các tin nhắn liên quan bên dưới.';
}

function extractVietnameseTimeHint(text: string): string | undefined {
  const compact = text.replace(/\s+/g, ' ').trim();
  const patterns = [
    /\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)\b/i,
    /\b(\d{1,2}h(?:\d{1,2})?)\b/i,
    /\b(hôm nay|ngày mai|mai|chiều mai|sáng mai|tối mai|hôm qua|tuần sau|thứ\s+[2-7]|chủ nhật)\b/i,
  ];
  for (const pattern of patterns) {
    const match = compact.match(pattern);
    if (match?.[1]) return match[1];
  }
  return undefined;
}

function buildSearchPeople(results: SearchResult[], query: string): SearchPerson[] {
  const normalizedQuery = normalizeVietnameseText(query);
  const bySender = new Map<string, SearchPerson>();

  results.forEach((result) => {
    const existing = bySender.get(result.senderId) ?? {
      senderId: result.senderId,
      senderName: result.senderName,
      conversationIds: [],
      conversationNames: [],
      count: 0,
      score: 0,
      reason: '',
      evidenceMessageRefs: [],
    };

    existing.count += 1;
    existing.score = Math.max(existing.score, result.score);
    if (!existing.conversationIds.includes(result.conversationId)) {
      existing.conversationIds.push(result.conversationId);
    }
    if (!existing.conversationNames.includes(result.conversationName)) {
      existing.conversationNames.push(result.conversationName);
    }
    if (!existing.evidenceMessageRefs.includes(result.messageRef)) {
      existing.evidenceMessageRefs.push(result.messageRef);
    }
    bySender.set(result.senderId, existing);
  });

  return Array.from(bySender.values())
    .map((person) => ({
      ...person,
      score: Math.min(1, Math.round((person.score + Math.min(0.25, person.count * 0.04)) * 1000) / 1000),
      evidenceMessageRefs: person.evidenceMessageRefs.slice(0, 5),
      reason: normalizedQuery.includes('loi code')
        ? `${person.count} tin nhắn liên quan đến lỗi/code.`
        : `${person.count} tin nhắn liên quan đến câu hỏi.`,
    }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.count - a.count;
    })
    .slice(0, 5);
}

function searchTimeout<T>(promise: Promise<T>, ms: number, reason: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(reason)), ms)),
  ]);
}

function extractJsonObject(raw: string): string | null {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

function normalizeUnreadCounts(unreadCounts: unknown): Record<string, number> {
  if (!unreadCounts) return {};
  if (unreadCounts instanceof Map) return Object.fromEntries(unreadCounts.entries());
  return unreadCounts as Record<string, number>;
}

function getUnreadCount(unreadCounts: unknown, userId: string): number {
  const value = normalizeUnreadCounts(unreadCounts)[userId];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function getMemberUnreadOverride(member?: CatchupMember): number {
  if (
    !member?.lastVisibleMessageRef
    || typeof member.unreadCount !== 'number'
    || !Number.isFinite(member.unreadCount)
  ) {
    return 0;
  }

  return Math.max(0, member.unreadCount);
}

function getDateTime(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.length > 0) {
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : 0;
  }
  return 0;
}

function toIsoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) {
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

function buildMessageRefsQuery(refs: string[]): Record<string, unknown>[] {
  const objectIds = refs
    .filter((ref) => Types.ObjectId.isValid(ref))
    .map((ref) => new Types.ObjectId(ref));

  const clauses: Record<string, unknown>[] = [{ idempotencyKey: { $in: refs } }];
  if (objectIds.length > 0) clauses.push({ _id: { $in: objectIds } });
  return clauses;
}

function getDigestTimestamp(digest?: IAiCatchupDigest | null): string | null {
  const generatedAt = digest?.generatedAt;
  if (generatedAt instanceof Date) return generatedAt.toISOString();
  if (digest?.updatedAt instanceof Date) return digest.updatedAt.toISOString();
  if (digest?.createdAt instanceof Date) return digest.createdAt.toISOString();
  return null;
}

function visibleMessageFilter(conversationId: string, userId: string): Record<string, unknown> {
  return {
    conversationId,
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [userId] },
  };
}

function visibleMessageFilterForSearch(conversationIds: string[], userId: string): Record<string, unknown> {
  return {
    conversationId: { $in: conversationIds },
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [userId] },
    type: { $nin: ['system-recall', 'system'] },
  };
}

async function findMessageByRef(
  conversationId: string,
  ref: string,
): Promise<CatchupMessageRef | null> {
  const clauses = buildMessageRefsQuery([ref]);
  return MessageModel.findOne({
    conversationId,
    $or: clauses,
  })
    .select('_id idempotencyKey createdAt')
    .lean<CatchupMessageRef | null>();
}

function afterMessageQuery(message: CatchupMessageRef): Record<string, unknown> {
  const objectId = Types.ObjectId.isValid(String(message._id))
    ? new Types.ObjectId(String(message._id))
    : message._id;

  return {
    $or: [
      { createdAt: { $gt: message.createdAt } },
      { createdAt: message.createdAt, _id: { $gt: objectId } },
    ],
  };
}

async function hasMessagesAfterDigest(
  conversationId: string,
  userId: string,
  digest?: IAiCatchupDigest | null,
): Promise<boolean> {
  if (!digest?.toMessageRef) return false;

  const boundary = await findMessageByRef(conversationId, digest.toMessageRef);
  if (!boundary) {
    return false;
  }

  const nextMessage = await MessageModel.exists({
    ...visibleMessageFilter(conversationId, userId),
    ...afterMessageQuery(boundary),
  });

  return Boolean(nextMessage);
}

// ─── Service Methods ──────────────────────────────────────────────────────────

export class AiAssistantService {
  /**
   * Tạo catchup digest cho một conversation.
   * 1. Tạo/verify AiAssistantItem (index)
   * 2. Tạo AiCatchupDigest (detail)
   * 3. Update AiAssistantItem.refId
   * 4. Publish Kafka job
   */
  static async createCatchupDigest(
    userId: string,
    input: CreateCatchupDigestInput,
  ): Promise<Record<string, unknown>> {
    const { conversationId } = input;
    await assertMembership(conversationId, userId);

    // ── Check existing digest (cache hit) ──────────────────────────────────────
    const runningItem = await AiAssistantItemModel.findOne({
      userId,
      type: 'catchup_digest',
      conversationId,
      status: { $in: ['queued', 'processing'] },
    }).sort({ createdAt: -1 });

    if (runningItem) {
      const reconciledRunningItem = await this._reconcileAssistantItem(runningItem);
      if (reconciledRunningItem.status === 'queued' || reconciledRunningItem.status === 'processing') {
        const detail = reconciledRunningItem.refId
          ? await AiCatchupDigestModel.findById(reconciledRunningItem.refId)
          : null;
        return {
          item: serializeItem(reconciledRunningItem),
          detail: detail ? this._serializeDigest(detail) : null,
        };
      }
    }


    // ── Create snapshot from messages (reuse from catchup service) ─────────────
    const latestReadyItem = await AiAssistantItemModel.findOne({
      userId,
      type: 'catchup_digest',
      conversationId,
      status: 'ready',
    }).sort({ createdAt: -1 });
    const latestReadyDetail = latestReadyItem?.refId
      ? await AiCatchupDigestModel.findById(latestReadyItem.refId)
      : await AiCatchupDigestModel.findOne({
        userId,
        conversationId,
        status: 'ready',
      }).sort({ createdAt: -1 });

    const { mode, messageRefs, fromMessageRef, toMessageRef, messageCount, omittedOlderCount } =
      await this._createCatchupSnapshot(userId, conversationId, input, latestReadyDetail);

    if (mode === 'recent' && latestReadyItem && latestReadyDetail) {
      return { item: serializeItem(latestReadyItem), detail: this._serializeDigest(latestReadyDetail) };
    }

    const cacheKey = hashParts([userId, conversationId, mode, fromMessageRef, toMessageRef]);

    const cachedDigest = await AiCatchupDigestModel.findOne({
      cacheKey,
      status: { $in: ['queued', 'processing', 'ready'] },
    }).sort({ createdAt: -1 });

    if (cachedDigest) {
      const cachedItem = await AiAssistantItemModel.findOne({
        userId,
        type: 'catchup_digest',
        conversationId,
        refId: String(cachedDigest._id),
      }).sort({ createdAt: -1 });

      if (cachedItem) {
        return { item: serializeItem(cachedItem), detail: this._serializeDigest(cachedDigest) };
      }

      const item = await AiAssistantItemModel.create({
        userId,
        type: 'catchup_digest',
        conversationId,
        refId: String(cachedDigest._id),
        status: cachedDigest.status,
        title: cachedDigest.summary?.title ?? 'Tóm tắt hội thoại',
        summarySnippet: cachedDigest.summary?.overview?.slice(0, 200),
        metadata: {
          unreadCount: cachedDigest.messageCount,
          messageCount: cachedDigest.messageCount,
          catchupMode: cachedDigest.catchupMode ?? mode,
          lastDigestAt: getDigestTimestamp(cachedDigest) ?? undefined,
        },
        trigger: input.trigger ?? 'manual',
      });
      return { item: serializeItem(item), detail: this._serializeDigest(cachedDigest) };
    }

    await checkDebounce(userId, conversationId);

    // Check failed digest for regeneration
    const failedItem = await AiAssistantItemModel.findOne({
      userId,
      type: 'catchup_digest',
      conversationId,
      status: 'failed',
    }).sort({ createdAt: -1 });

    if (failedItem) {
      // Regenerate: update existing item + detail
      return this._regenerateItem(userId, failedItem, {
        messageRefs,
        fromMessageRef,
        toMessageRef,
        messageCount,
        omittedOlderCount,
        cacheKey,
        mode,
        trigger: input.trigger,
      });
    }

    // ── Create new AiAssistantItem + AiCatchupDigest ────────────────────────
    const digest = await AiCatchupDigestModel.create({
      userId,
      conversationId,
      cacheKey,
      fromMessageRef,
      toMessageRef,
      messageRefs,
      messageCount,
      omittedOlderCount,
      catchupMode: mode,
      trigger: input.trigger ?? 'manual',
      status: 'queued',
      inputHash: hashParts([mode, ...messageRefs]),
    });

    const conv = await AiAssistantItemModel.findOne({ userId, type: 'catchup_digest', conversationId });
    const title = conv?.title || 'Tóm tắt hội thoại';

    const item = await AiAssistantItemModel.create({
      userId,
      type: 'catchup_digest',
      conversationId,
      refId: String(digest._id),
      status: 'queued',
      title,
      metadata: {
        unreadCount: messageCount,
        messageCount,
        catchupMode: mode,
        latestMessageAt: new Date().toISOString(),
        lastDigestAt: getDigestTimestamp(latestReadyDetail) ?? undefined,
      },
      trigger: input.trigger ?? 'manual',
    });

    // Publish Kafka job
    await this._publishJob(item, digest);

    return { item: serializeItem(item), detail: this._serializeDigest(digest) };
  }

  /**
   * Lấy danh sách conversations có tin chưa đọc cho AI Box.
   * Gộp với AI item đã có (nếu có) để UI hiển thị đúng trạng thái.
   */
  static async getUnreadConversations(
    userId: string,
    options: { limit?: number; skip?: number } = {},
  ): Promise<{ conversations: Array<Record<string, unknown>>; total: number }> {
    const limit = options.limit ?? 20;
    const skip = options.skip ?? 0;

    // Lấy tất cả conversation members của user, có unread
    const memberships = await ConversationMemberModel.find({ userId })
      .select('conversationId userId unreadCount lastVisibleMessageRef aiPreferences')
      .lean<CatchupMember[]>();

    const enabledMemberships = memberships.filter((member) => member.aiPreferences?.catchupEnabled !== false);

    if (enabledMemberships.length === 0) {
      return { conversations: [], total: 0 };
    }

    // Lấy conversationIds
    const memberByConversationId = new Map(
      enabledMemberships.map((member) => [String(member.conversationId), member]),
    );
    const conversationIds = Array.from(memberByConversationId.keys());

    const unreadConversationDocs = await ConversationModel.find({
      _id: { $in: conversationIds },
    })
      .select('_id type name avatarUrl unreadCounts lastMessage updatedAt')
      .lean<CatchupConversation[]>();

    const sortedUnreadConversations = unreadConversationDocs
      .map((conversation) => {
        const conversationId = String(conversation._id);
        const member = memberByConversationId.get(conversationId);
        const unreadCount = Math.max(
          getUnreadCount(conversation.unreadCounts, userId),
          getMemberUnreadOverride(member),
        );
        const latestMessageAt = conversation.lastMessage?.sentAt ?? conversation.updatedAt;

        return {
          conversation,
          conversationId,
          unreadCount,
          latestMessageAt,
          sortAt: getDateTime(latestMessageAt),
        };
      })
      .filter((entry) => entry.sortAt > 0)
      .sort((a, b) => {
        if (b.unreadCount !== a.unreadCount) return b.unreadCount - a.unreadCount;
        return b.sortAt - a.sortAt;
      });

    const total = sortedUnreadConversations.length;
    const pageConversations = sortedUnreadConversations.slice(skip, skip + limit);

    if (pageConversations.length === 0) {
      return { conversations: [], total };
    }

    const pageConversationIds = pageConversations.map((entry) => entry.conversationId);

    // Lấy AI items đã có cho các conversations này
    const [aiItemDocs, pageMembers] = await Promise.all([
      AiAssistantItemModel.find({
        userId,
        type: 'catchup_digest',
        conversationId: { $in: pageConversationIds },
      }).sort({ createdAt: -1 }),
      ConversationMemberModel.find({ conversationId: { $in: pageConversationIds } })
        .select('conversationId userId')
        .lean<CatchupMember[]>(),
    ]);
    const aiItems = await Promise.all(
      aiItemDocs.map((item) => this._reconcileAssistantItem(item)),
    );

    const membersByConversationId = new Map<string, CatchupMember[]>();
    pageMembers.forEach((member) => {
      const conversationId = String(member.conversationId);
      const existing = membersByConversationId.get(conversationId) ?? [];
      existing.push(member);
      membersByConversationId.set(conversationId, existing);
    });

    const directPeerIds = Array.from(new Set(
      pageConversations
        .filter((entry) => entry.conversation.type !== 'group')
        .flatMap((entry) => membersByConversationId.get(entry.conversationId) ?? [])
        .map((member) => String(member.userId))
        .filter((memberUserId) => memberUserId !== userId),
    ));

    const users = directPeerIds.length > 0
      ? await UserModel.find({ _id: { $in: directPeerIds } })
        .select('displayName avatarUrl')
        .lean<CatchupUser[]>()
      : [];

    const userById = new Map(users.map((user) => [String(user._id), user]));

    // Map AI item theo conversationId
    const aiItemByConv = new Map<string, typeof aiItems[0]>();
    aiItems.forEach((item) => {
      if (item.conversationId) {
        const existing = aiItemByConv.get(item.conversationId);
        if (!existing || item.createdAt > existing.createdAt) {
          aiItemByConv.set(item.conversationId, item);
        }
      }
    });

    const digestIds = Array.from(new Set(
      aiItems
        .map((item) => item.refId)
        .filter((refId): refId is string => typeof refId === 'string' && refId.length > 0),
    ));
    const digestDocs = digestIds.length > 0
      ? await AiCatchupDigestModel.find({ _id: { $in: digestIds } }).lean<IAiCatchupDigest[]>()
      : [];
    const digestById = new Map(digestDocs.map((digest) => [String(digest._id), digest]));

    const conversations = await Promise.all(
      pageConversations.map(async (entry) => {
        const aiItem = aiItemByConv.get(entry.conversationId);
        const digest = aiItem?.refId ? digestById.get(String(aiItem.refId)) : null;
        const lastDigestAt = getDigestTimestamp(digest);
        const hasNewAfterDigest = entry.unreadCount === 0
          ? await hasMessagesAfterDigest(entry.conversationId, userId, digest)
          : false;
        const catchupMode: AiCatchupMode = entry.unreadCount > 0
          ? 'unread'
          : hasNewAfterDigest
            ? 'since_last_digest'
            : 'recent';
        const conversationMembers = membersByConversationId.get(entry.conversationId) ?? [];
        const peerMember = conversationMembers.find((member) => String(member.userId) !== userId);
        const peerUser = peerMember ? userById.get(String(peerMember.userId)) : undefined;
        const isGroup = entry.conversation.type === 'group';

        return {
          conversationId: entry.conversationId,
          name: isGroup
            ? entry.conversation.name ?? 'Nhóm'
            : peerUser?.displayName ?? entry.conversation.name ?? 'Cuộc trò chuyện',
          avatarUrl: isGroup
            ? entry.conversation.avatarUrl ?? null
            : peerUser?.avatarUrl ?? entry.conversation.avatarUrl ?? null,
          type: isGroup ? 'group' : 'direct',
          unreadCount: entry.unreadCount,
          updatedAt: toIsoString(entry.latestMessageAt),
          // AI state: not_started nếu chưa có digest, ngược lại lấy từ AI item
          aiStatus: aiItem ? aiItem.status : 'not_started',
          aiItemId: aiItem ? String(aiItem._id) : null,
          aiItemRefId: aiItem?.refId ?? null,
          aiTitle: aiItem?.title ?? null,
          aiSummarySnippet: aiItem?.summarySnippet ?? null,
          aiMetadata: {
            ...(aiItem?.metadata ?? {}),
            unreadCount: entry.unreadCount,
            latestMessageAt: toIsoString(entry.latestMessageAt),
            lastDigestAt: lastDigestAt ?? undefined,
            catchupMode,
          },
        };
      }),
    );
    return { conversations, total };
  }

  /**
   * Lấy danh sách items cho AI Box feed.
   * Chỉ load index, không load detail.
   */
  static async getItemList(
    userId: string,
    options: {
      type?: AiItemType;
      conversationId?: string;
      limit?: number;
      skip?: number;
    },
  ): Promise<{ items: Record<string, unknown>[]; total: number }> {
    const query: Record<string, unknown> = { userId };
    if (options.type) query.type = options.type;
    if (options.conversationId) query.conversationId = options.conversationId;

    const [items, total] = await Promise.all([
      AiAssistantItemModel.find(query)
        .sort({ updatedAt: -1 })
        .skip(options.skip ?? 0)
        .limit(options.limit ?? 10)
        .lean(),
      AiAssistantItemModel.countDocuments(query),
    ]);

    return { items: items.map((item) => serializeItem(item as unknown as IAiAssistantItem)), total };
  }

  /**
   * Lấy digest mới nhất của một conversation (item + detail merged).
   */
  static async getCatchupLatest(
    userId: string,
    conversationId: string,
  ): Promise<{ item: Record<string, unknown>; detail: Record<string, unknown> } | null> {
    await assertMembership(conversationId, userId);

    const item = await AiAssistantItemModel.findOne({
      userId,
      type: 'catchup_digest',
      conversationId,
    }).sort({ createdAt: -1 });

    if (!item) return null;

    const detail = item.refId
      ? await AiCatchupDigestModel.findById(item.refId)
      : null;

    return { item: serializeItem(item as unknown as IAiAssistantItem), detail: detail ? this._serializeDigest(detail) : null as unknown as Record<string, unknown> };
  }

  /**
   * Regenerate digest cho một conversation.
   */
  static async regenerateCatchup(
    userId: string,
    conversationId: string,
  ): Promise<Record<string, unknown>> {
    await assertMembership(conversationId, userId);

    const existingItem = await AiAssistantItemModel.findOne({
      userId,
      type: 'catchup_digest',
      conversationId,
    }).sort({ createdAt: -1 });

    if (!existingItem) {
      throw new NotFoundError('No digest found to regenerate');
    }

    const detail = existingItem.refId
      ? await AiCatchupDigestModel.findById(existingItem.refId)
      : null;
    const snapshot = await this._createCatchupSnapshot(userId, conversationId, {}, detail);
    const cacheKey = hashParts([userId, conversationId, snapshot.mode, snapshot.fromMessageRef, snapshot.toMessageRef]);

    const updated = await this._regenerateItem(userId, existingItem, {
      messageRefs: snapshot.messageRefs,
      fromMessageRef: snapshot.fromMessageRef,
      toMessageRef: snapshot.toMessageRef,
      messageCount: snapshot.messageCount,
      omittedOlderCount: snapshot.omittedOlderCount,
      cacheKey,
      mode: snapshot.mode,
      trigger: 'manual',
    });

    return updated;
  }

  static async listGroupNotes(
    userId: string,
    input: AssistantNotesQueryInput,
  ): Promise<{ notes: Record<string, unknown>[]; total: number }> {
    let conversationIds: string[];
    if (input.conversationId) {
      await assertMembership(input.conversationId, userId);
      conversationIds = [input.conversationId];
    } else {
      conversationIds = await this._loadMemberConversationIds(userId);
    }

    if (conversationIds.length === 0) {
      return { notes: [], total: 0 };
    }

    const query: Record<string, unknown> = {
      userId,
      conversationId: { $in: conversationIds },
    };
    if (input.status !== 'all') query.status = input.status;

    const [notes, total, metas] = await Promise.all([
      AiGroupNoteModel.find(query)
        .sort({ pinned: -1, createdAt: -1 })
        .skip(input.skip)
        .limit(input.limit),
      AiGroupNoteModel.countDocuments(query),
      this._loadConversationMetas(userId, conversationIds),
    ]);

    return {
      notes: notes.map((note) => this._serializeGroupNote(note, metas.get(note.conversationId))),
      total,
    };
  }

  static async createGroupNote(
    userId: string,
    conversationId: string,
    input: CreateGroupNoteInput,
  ): Promise<{ item: Record<string, unknown>; detail: Record<string, unknown> }> {
    await assertMembership(conversationId, userId);

    const runningItem = await AiAssistantItemModel.findOne({
      userId,
      type: 'group_note',
      conversationId,
      status: { $in: ['queued', 'processing'] },
    }).sort({ createdAt: -1 });

    if (runningItem?.refId) {
      const runningNote = await AiGroupNoteModel.findById(runningItem.refId);
      if (runningNote) {
        return {
          item: serializeItem(runningItem),
          detail: this._serializeGroupNote(runningNote),
        };
      }
    }

    const snapshot = await this._createGroupNoteSnapshot(userId, conversationId, input);
    const cachedNote = await AiGroupNoteModel.findOne({
      userId,
      conversationId,
      fromMessageRef: snapshot.fromMessageRef,
      toMessageRef: snapshot.toMessageRef,
      status: { $in: ['queued', 'processing', 'ready'] },
    }).sort({ createdAt: -1 });

    if (cachedNote) {
      const cachedItem = await AiAssistantItemModel.findOneAndUpdate(
        {
          userId,
          type: 'group_note',
          refId: String(cachedNote._id),
        },
        {
          $setOnInsert: {
            userId,
            type: 'group_note',
            conversationId,
            refId: String(cachedNote._id),
            status: cachedNote.status,
            title: cachedNote.title ?? 'Ghi chú nhóm',
            summarySnippet: cachedNote.content?.slice(0, 200),
            metadata: {
              noteId: String(cachedNote._id),
              messageCount: cachedNote.messageCount,
              pinned: cachedNote.pinned,
              decisionCount: cachedNote.decisions.length,
              openQuestionCount: cachedNote.openQuestions.length,
            },
            trigger: 'manual',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      return {
        item: serializeItem(cachedItem),
        detail: this._serializeGroupNote(cachedNote),
      };
    }

    const note = await AiGroupNoteModel.create({
      userId,
      conversationId,
      ...snapshot,
      sourceMessageRefs: [],
      decisions: [],
      openQuestions: [],
      actionItems: [],
      pinned: false,
      status: 'queued',
    });

    const item = await AiAssistantItemModel.create({
      userId,
      type: 'group_note',
      conversationId,
      refId: String(note._id),
      status: 'queued',
      title: 'Đang tạo ghi chú',
      metadata: {
        noteId: String(note._id),
        messageCount: note.messageCount,
        pinned: false,
        decisionCount: 0,
        openQuestionCount: 0,
      },
      trigger: 'manual',
    });

    await this._publishGroupNoteJob(item, note);

    return {
      item: serializeItem(item),
      detail: this._serializeGroupNote(note),
    };
  }

  static async getGroupNoteDetail(
    userId: string,
    noteId: string,
  ): Promise<{ item: Record<string, unknown> | null; detail: Record<string, unknown> }> {
    const note = await AiGroupNoteModel.findOne({ _id: noteId, userId });
    if (!note) throw new NotFoundError('Group note not found');
    await assertMembership(note.conversationId, userId);

    const item = await AiAssistantItemModel.findOne({
      userId,
      type: 'group_note',
      refId: String(note._id),
    }).sort({ createdAt: -1 });

    return {
      item: item ? serializeItem(item) : null,
      detail: this._serializeGroupNote(note),
    };
  }

  static async updateGroupNote(
    userId: string,
    noteId: string,
    input: UpdateGroupNoteInput,
  ): Promise<Record<string, unknown>> {
    const note = await AiGroupNoteModel.findOne({ _id: noteId, userId });
    if (!note) throw new NotFoundError('Group note not found');
    await assertMembership(note.conversationId, userId);

    if (typeof input.pinned === 'boolean') note.pinned = input.pinned;
    if (input.title) note.title = input.title;
    if (input.content) note.content = input.content;
    await note.save();

    await this.updateItemWithGroupNote(String(note._id), note);
    return this._serializeGroupNote(note);
  }

  static async deleteGroupNote(userId: string, noteId: string): Promise<void> {
    const note = await AiGroupNoteModel.findOne({ _id: noteId, userId });
    if (!note) return;
    await assertMembership(note.conversationId, userId);

    await Promise.all([
      AiGroupNoteModel.deleteOne({ _id: note._id }),
      AiAssistantItemModel.deleteMany({ userId, type: 'group_note', refId: String(note._id) }),
    ]);

    emitAiAssistantItemUpdated(userId, {
      itemId: String(note._id),
      type: 'group_note',
      conversationId: note.conversationId,
      status: 'ready',
      metadata: { noteId: String(note._id), deleted: true },
      updatedAt: new Date().toISOString(),
    });
  }

  static async regenerateGroupNote(
    userId: string,
    noteId: string,
  ): Promise<{ item: Record<string, unknown>; detail: Record<string, unknown> }> {
    const existing = await AiGroupNoteModel.findOne({ _id: noteId, userId });
    if (!existing) throw new NotFoundError('Group note not found');
    await assertMembership(existing.conversationId, userId);

    const snapshot = await this._createGroupNoteSnapshot(userId, existing.conversationId, { fromLatestNote: false });
    existing.status = 'queued';
    existing.error = undefined;
    existing.decisions = [];
    existing.openQuestions = [];
    existing.actionItems = [];
    existing.sourceMessageRefs = [];
    existing.messageRefs = snapshot.messageRefs;
    existing.fromMessageRef = snapshot.fromMessageRef;
    existing.toMessageRef = snapshot.toMessageRef;
    existing.messageCount = snapshot.messageCount;
    await existing.save();

    const item = await AiAssistantItemModel.findOneAndUpdate(
      { userId, type: 'group_note', refId: String(existing._id) },
      {
        $set: {
          userId,
          type: 'group_note',
          conversationId: existing.conversationId,
          refId: String(existing._id),
          status: 'queued',
          title: existing.title ?? 'Đang tạo lại ghi chú',
          summarySnippet: '',
          metadata: {
            noteId: String(existing._id),
            messageCount: existing.messageCount,
            pinned: existing.pinned,
            decisionCount: 0,
            openQuestionCount: 0,
          },
          trigger: 'manual',
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this._publishGroupNoteJob(item, existing);

    return {
      item: serializeItem(item),
      detail: this._serializeGroupNote(existing),
    };
  }

  /**
   * Semantic search for messages visible to the current user.
   */
  static async searchMessages(
    userId: string,
    input: AssistantSearchQueryInput,
  ): Promise<{ query: string; mode: SearchMode; answer?: string; people: SearchPerson[]; results: SearchResult[]; total: number }> {
    const query = normalizeSearchQuery(input.q ?? '');
    const limit = input.limit ?? 20;

    if (!query) {
      return this._loadLatestSavedSearch(userId, {
        conversationId: input.conversationId,
        limit,
      });
    }

    const conversationIds = input.conversationId
      ? [input.conversationId]
      : await this._loadSearchConversationIds(userId);

    if (input.conversationId) {
      await assertSearchMembership(input.conversationId, userId);
    }

    if (conversationIds.length === 0) {
      return { query, mode: 'semantic', people: [], results: [], total: 0 };
    }

    const metas = await this._loadConversationMetas(userId, conversationIds);
    const semanticResults = await this._searchSemanticMessages(
      userId,
      query,
      conversationIds,
      metas,
      Math.max(limit, SEARCH_SYNTHESIS_CANDIDATE_LIMIT),
    );
    const keywordResults = await this._searchKeywordMessages(
      userId,
      query,
      conversationIds,
      metas,
      Math.max(limit, SEARCH_SYNTHESIS_CANDIDATE_LIMIT),
    );
    const mode: SearchMode = semanticResults.length > 0
      ? (keywordResults.length > 0 ? 'hybrid' : 'semantic')
      : 'keyword_fallback';
    const mergedResults = this._mergeSearchResults(semanticResults, keywordResults)
      .slice(0, Math.max(limit, SEARCH_SYNTHESIS_CANDIDATE_LIMIT));

    if (semanticResults.length === 0) {
      void this._enqueueSearchBackfill(userId, conversationIds).catch((err) => {
        logger.debug('[AI Search] Backfill enqueue failed', { err: String(err) });
      });
    }

    const synthesis = await this._synthesizeSearchResults(query, mergedResults, mode, limit);
    const savedResults = await this._saveSearchResultItems(userId, query, synthesis.results, input.conversationId);

    return {
      query,
      mode: synthesis.mode,
      answer: synthesis.answer,
      people: synthesis.people,
      results: savedResults,
      total: savedResults.length,
    };
  }

  /**
   * Cập nhật settings cho một conversation.
   */
  static async updateSettings(
    userId: string,
    conversationId: string,
    catchupEnabled: boolean,
  ): Promise<{ catchupEnabled: boolean }> {
    const member = await ConversationMemberModel.findOneAndUpdate(
      { conversationId, userId },
      { $set: { 'aiPreferences.catchupEnabled': catchupEnabled } },
      { new: true },
    ).select('aiPreferences');

    if (!member) {
      throw new ForbiddenError('Not allowed to update settings for this conversation');
    }

    return { catchupEnabled: member.aiPreferences?.catchupEnabled !== false };
  }

  // ── Worker helpers ──────────────────────────────────────────────────────────

  static async updateItemStatus(
    itemId: string,
    status: AiItemStatus,
    extra?: Partial<IAiAssistantItem>,
  ): Promise<IAiAssistantItem | null> {
    return AiAssistantItemModel.findByIdAndUpdate(
      itemId,
      { $set: { status, ...extra } },
      { new: true },
    );
  }

  static async updateItemWithDetail(
    itemId: string,
    detail: IAiCatchupDigest,
    extra?: Partial<IAiAssistantItem>,
  ): Promise<IAiAssistantItem | null> {
    const title = detail.summary?.title ?? 'Tóm tắt hội thoại';
    const summarySnippet = detail.summary?.overview?.slice(0, 200);

    return AiAssistantItemModel.findByIdAndUpdate(
      itemId,
      {
        $set: {
          status: detail.status,
          title,
          summarySnippet,
          refId: String(detail._id),
          metadata: {
            messageCount: detail.messageCount,
            unreadCount: detail.messageCount,
            latestMessageAt: detail.generatedAt?.toISOString() ?? new Date().toISOString(),
            lastDigestAt: detail.generatedAt?.toISOString() ?? detail.updatedAt?.toISOString(),
            catchupMode: detail.catchupMode,
            actionItemCount: detail.futureSignals?.actionItems?.length ?? 0,
          },
          ...extra,
        },
      },
      { new: true },
    );
  }

  static async updateItemWithGroupNote(
    itemIdOrNoteId: string,
    note: IAiGroupNote,
    extra?: Partial<IAiAssistantItem>,
  ): Promise<IAiAssistantItem | null> {
    const title = note.title ?? 'Ghi chú nhóm';
    const summarySnippet = note.content?.slice(0, 200);

    return AiAssistantItemModel.findOneAndUpdate(
      {
        $or: [
          { _id: Types.ObjectId.isValid(itemIdOrNoteId) ? new Types.ObjectId(itemIdOrNoteId) : itemIdOrNoteId },
          { refId: String(note._id), type: 'group_note' },
        ],
      },
      {
        $set: {
          status: note.status,
          title,
          summarySnippet,
          refId: String(note._id),
          conversationId: note.conversationId,
          metadata: {
            noteId: String(note._id),
            messageCount: note.messageCount,
            pinned: note.pinned,
            decisionCount: note.decisions.length,
            openQuestionCount: note.openQuestions.length,
            latestMessageAt: note.generatedAt?.toISOString() ?? note.updatedAt?.toISOString(),
          },
          ...extra,
        },
      },
      { new: true },
    );
  }

  static emitSocket(userId: string, payload: Record<string, unknown>): void {
    emitAiAssistantItemUpdated(userId, payload);
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private static async _loadSearchConversationIds(userId: string): Promise<string[]> {
    const memberships = await ConversationMemberModel.find({ userId })
      .select('conversationId aiPreferences')
      .lean<CatchupMember[]>();

    return memberships
      .filter((member) => member.aiPreferences?.smartSearchEnabled !== false)
      .map((member) => String(member.conversationId))
      .filter(Boolean)
      .slice(0, 200);
  }

  private static async _loadMemberConversationIds(userId: string): Promise<string[]> {
    const memberships = await ConversationMemberModel.find({ userId })
      .select('conversationId')
      .lean<CatchupMember[]>();

    return memberships
      .map((member) => String(member.conversationId))
      .filter(Boolean)
      .slice(0, 200);
  }

  private static async _loadConversationMetas(
    userId: string,
    conversationIds: string[],
  ): Promise<Map<string, SearchConversationMeta>> {
    if (conversationIds.length === 0) return new Map();

    const [conversationDocs, memberDocs] = await Promise.all([
      ConversationModel.find({ _id: { $in: conversationIds } })
        .select('_id type name avatarUrl')
        .lean<CatchupConversation[]>(),
      ConversationMemberModel.find({ conversationId: { $in: conversationIds } })
        .select('conversationId userId')
        .lean<CatchupMember[]>(),
    ]);

    const membersByConversationId = new Map<string, CatchupMember[]>();
    memberDocs.forEach((member) => {
      const conversationId = String(member.conversationId);
      const existing = membersByConversationId.get(conversationId) ?? [];
      existing.push(member);
      membersByConversationId.set(conversationId, existing);
    });

    const directPeerIds = Array.from(new Set(
      conversationDocs
        .filter((conversation) => conversation.type !== 'group')
        .flatMap((conversation) => membersByConversationId.get(String(conversation._id)) ?? [])
        .map((member) => String(member.userId))
        .filter((memberUserId) => memberUserId !== userId),
    ));

    const users = directPeerIds.length > 0
      ? await UserModel.find({ _id: { $in: directPeerIds } })
        .select('displayName avatarUrl')
        .lean<CatchupUser[]>()
      : [];
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const metas = new Map<string, SearchConversationMeta>();

    conversationDocs.forEach((conversation) => {
      const conversationId = String(conversation._id);
      const isGroup = conversation.type === 'group';
      const peerMember = (membersByConversationId.get(conversationId) ?? [])
        .find((member) => String(member.userId) !== userId);
      const peerUser = peerMember ? userById.get(String(peerMember.userId)) : undefined;

      metas.set(conversationId, {
        conversationId,
        name: isGroup
          ? conversation.name ?? 'Group'
          : peerUser?.displayName ?? conversation.name ?? 'Conversation',
        avatarUrl: isGroup
          ? conversation.avatarUrl ?? null
          : peerUser?.avatarUrl ?? conversation.avatarUrl ?? null,
        type: isGroup ? 'group' : 'direct',
      });
    });

    return metas;
  }

  private static async _loadSenderNames(userIds: string[]): Promise<Map<string, string>> {
    const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
    if (uniqueUserIds.length === 0) return new Map();

    const users = await UserModel.find({ _id: { $in: uniqueUserIds } })
      .select('displayName username')
      .lean<Array<{ _id: unknown; displayName?: string; username?: string }>>();

    return new Map(users.map((user) => [
      String(user._id),
      user.displayName || user.username || 'Người dùng',
    ]));
  }

  private static _toSearchResult(params: {
    message: SearchMessage;
    meta?: SearchConversationMeta;
    senderName?: string;
    query: string;
    score: number;
    source: 'semantic' | 'keyword';
    similarity?: number;
  }): SearchResult {
    const { message, meta, senderName, query, score, source, similarity } = params;
    const text = typeof message.content === 'string' ? message.content : '';
    const createdAt = message.createdAt.toISOString();
    const normalizedScore = Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));

    return {
      conversationId: message.conversationId,
      conversationName: meta?.name ?? 'Conversation',
      conversationAvatarUrl: meta?.avatarUrl ?? null,
      conversationType: meta?.type,
      messageId: String(message._id),
      messageRef: toSearchMessageRef(message),
      senderId: String(message.senderId),
      senderName: senderName ?? 'Người dùng',
      snippet: buildSearchSnippet(text, query),
      messageSnippet: buildSearchSnippet(text, query),
      createdAt,
      timestamp: createdAt,
      score: normalizedScore,
      similarity,
      source,
    };
  }

  private static async _searchSemanticMessages(
    userId: string,
    query: string,
    conversationIds: string[],
    metas: Map<string, SearchConversationMeta>,
    limit: number,
  ): Promise<SearchResult[]> {
    if (!isNeonAvailable()) {
      return [];
    }

    try {
      const embeddingCount = await countMessageEmbeddings(conversationIds);
      if (embeddingCount === 0) {
        return [];
      }

      const queryEmbedding = await embedText(query, 'RETRIEVAL_QUERY');
      const vectorRows = await searchSimilarMessagesInConversations({
        queryEmbedding,
        conversationIds,
        topK: Math.max(limit * 3, limit),
        minSimilarity: 0.25,
      });

      if (vectorRows.length === 0) {
        return [];
      }

      const messageRefs = vectorRows.map((row) => String(row.messageId));
      const messages = await this._loadVisibleMessagesByRefs(userId, conversationIds, messageRefs);
      const messageByRef = new Map<string, SearchMessage>();
      messages.forEach((message) => {
        messageByRef.set(String(message._id), message);
        if (message.idempotencyKey) messageByRef.set(message.idempotencyKey, message);
      });

      const senderNames = await this._loadSenderNames(messages.map((message) => String(message.senderId)));
      const seenMessages = new Set<string>();

      return vectorRows
        .map((row) => {
          const message = messageByRef.get(String(row.messageId));
          if (!message) return null;

          const messageId = String(message._id);
          if (seenMessages.has(messageId)) return null;
          seenMessages.add(messageId);

          const similarity = Math.round(Number(row.similarity) * 1000) / 1000;
          return this._toSearchResult({
            message,
            meta: metas.get(message.conversationId),
            senderName: senderNames.get(String(message.senderId)),
            query,
            score: similarity,
            similarity,
            source: 'semantic',
          });
        })
        .filter((result): result is SearchResult => Boolean(result));
    } catch (err) {
      logger.warn('[AI Search] Semantic search failed; falling back to keyword search', {
        err: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  }

  private static async _searchKeywordMessages(
    userId: string,
    query: string,
    conversationIds: string[],
    metas: Map<string, SearchConversationMeta>,
    limit: number,
  ): Promise<SearchResult[]> {
    const terms = tokenizeSearchQuery(query);
    if (terms.length === 0) return [];

    const regexTerms = terms
      .filter((term) => term.length >= 3)
      .slice(0, 6)
      .map((term) => new RegExp(escapeRegExp(term), 'i'));

    const mongoQuery: Record<string, unknown> = {
      ...visibleMessageFilterForSearch(conversationIds, userId),
      content: { $type: 'string', $ne: '' },
    };

    if (regexTerms.length > 0) {
      mongoQuery.$or = regexTerms.map((regex) => ({ content: regex }));
    }

    const strictCandidates = await MessageModel.find(mongoQuery)
      .sort({ createdAt: -1, _id: -1 })
      .limit(SEARCH_KEYWORD_SCAN_LIMIT)
      .select('_id conversationId senderId content type idempotencyKey createdAt')
      .lean<SearchMessage[]>();

    const needsNormalizedScan = strictCandidates.length < limit;
    const normalizedCandidates = needsNormalizedScan
      ? await MessageModel.find({
        ...visibleMessageFilterForSearch(conversationIds, userId),
        content: { $type: 'string', $ne: '' },
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(SEARCH_KEYWORD_SCAN_LIMIT)
        .select('_id conversationId senderId content type idempotencyKey createdAt')
        .lean<SearchMessage[]>()
      : [];

    const byId = new Map<string, SearchMessage>();
    [...strictCandidates, ...normalizedCandidates].forEach((message) => {
      byId.set(String(message._id), message);
    });

    const scored = Array.from(byId.values())
      .map((message) => ({
        message,
        score: scoreKeywordMatch(message.content ?? '', query, terms),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return getDateTime(b.message.createdAt) - getDateTime(a.message.createdAt);
      })
      .slice(0, Math.max(limit * 2, limit));

    const senderNames = await this._loadSenderNames(scored.map((entry) => String(entry.message.senderId)));

    return scored.map((entry) => this._toSearchResult({
      message: entry.message,
      meta: metas.get(entry.message.conversationId),
      senderName: senderNames.get(String(entry.message.senderId)),
      query,
      score: entry.score,
      source: 'keyword',
    }));
  }

  private static _mergeSearchResults(
    semanticResults: SearchResult[],
    keywordResults: SearchResult[],
  ): SearchResult[] {
    const byMessageId = new Map<string, SearchResult>();

    [...semanticResults, ...keywordResults].forEach((result) => {
      const existing = byMessageId.get(result.messageId);
      if (!existing || result.score > existing.score || existing.source === 'keyword') {
        byMessageId.set(result.messageId, {
          ...existing,
          ...result,
          score: Math.max(existing?.score ?? 0, result.score),
          source: existing?.source === 'semantic' || result.source === 'semantic' ? 'semantic' : 'keyword',
          similarity: existing?.similarity ?? result.similarity,
        });
      }
    });

    return Array.from(byMessageId.values())
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return getDateTime(b.createdAt) - getDateTime(a.createdAt);
      });
  }

  private static async _synthesizeSearchResults(
    query: string,
    candidates: SearchResult[],
    mode: SearchMode,
    limit: number,
  ): Promise<SearchSynthesis> {
    const deduped = this._dedupeSearchResults(candidates);
    if (deduped.length === 0) {
      return { mode, people: [], results: [] };
    }

    const heuristic = this._buildHeuristicSynthesis(query, deduped, mode, limit);
    if (!isAIEnabled()) {
      return heuristic;
    }

    try {
      const aiSynthesis = await this._runAiSearchSynthesis(query, deduped, mode, limit);
      if (!aiSynthesis) return heuristic;
      return aiSynthesis;
    } catch (err) {
      logger.warn('[AI Search] AI synthesis failed; using heuristic synthesis', {
        err: err instanceof Error ? err.message : String(err),
      });
      return heuristic;
    }
  }

  private static _dedupeSearchResults(results: SearchResult[]): SearchResult[] {
    const byKey = new Map<string, SearchResult>();

    results.forEach((result) => {
      const normalizedSnippet = normalizeVietnameseText(result.messageSnippet || result.snippet).slice(0, 160);
      const key = result.messageRef || result.messageId || `${result.conversationId}:${result.senderId}:${normalizedSnippet}`;
      const existing = byKey.get(key);
      if (!existing || result.score > existing.score || result.source === 'semantic') {
        byKey.set(key, result);
      }
    });

    return Array.from(byKey.values());
  }

  private static _buildHeuristicSynthesis(
    query: string,
    candidates: SearchResult[],
    mode: SearchMode,
    limit: number,
  ): SearchSynthesis {
    const results = candidates.slice(0, limit).map((result) => ({
      ...result,
      matchReason: result.matchReason ?? this._inferMatchReason(query, result),
    }));
    const people = buildSearchPeople(results, query);

    return {
      mode,
      answer: buildSearchAnswer(results, query),
      people,
      results,
    };
  }

  private static _inferMatchReason(query: string, result: SearchResult): string {
    const normalizedQuery = normalizeVietnameseText(query);
    const normalizedText = normalizeVietnameseText(result.messageSnippet || result.snippet);

    if (normalizedText.includes('da bong')) {
      if (normalizedText.includes('ru')) return 'Tin nhắn có nội dung rủ hoặc nhắc đi đá bóng.';
      return 'Tin nhắn nhắc đến đá bóng.';
    }
    if (normalizedQuery.includes('loi') && normalizedQuery.includes('code')) {
      return 'Tin nhắn liên quan đến lỗi/code.';
    }
    if (normalizedQuery.includes('bao cao') || normalizedQuery.includes('nop')) {
      const timeHint = extractVietnameseTimeHint(result.messageSnippet || result.snippet);
      return timeHint ? `Tin nhắn có mốc thời gian: ${timeHint}.` : 'Tin nhắn liên quan đến báo cáo/nộp việc.';
    }
    if (result.source === 'semantic') return 'Semantic match với ý định tìm kiếm.';
    return 'Keyword fallback match với truy vấn.';
  }

  private static async _runAiSearchSynthesis(
    query: string,
    candidates: SearchResult[],
    mode: SearchMode,
    limit: number,
  ): Promise<SearchSynthesis | null> {
    const shortlist = candidates.slice(0, SEARCH_SYNTHESIS_CANDIDATE_LIMIT);
    const candidatePayload = shortlist.map((result, index) => ({
      id: index + 1,
      messageRef: result.messageRef,
      messageId: result.messageId,
      senderId: result.senderId,
      senderName: result.senderName,
      conversationId: result.conversationId,
      conversationName: result.conversationName,
      createdAt: result.createdAt,
      score: result.score,
      source: result.source,
      text: (result.messageSnippet || result.snippet).slice(0, 500),
    }));

    const prompt = `Bạn là AI Semantic Search cho ứng dụng chat Zync.
Nhiệm vụ: hiểu intent query tiếng Việt, chọn bằng chứng từ candidate messages, trả lời ngắn có nguồn.

Quy tắc bắt buộc:
- Chỉ dùng candidate messages bên dưới. Không bịa tên người, thời gian, sự kiện nếu không có evidence.
- Nếu query hỏi "ai", answer phải nêu tên người cụ thể khi có evidence.
- Nếu query hỏi nhóm người như "ai hay nói về lỗi code", gom người liên quan nhất trong people[] với count/reason/evidence.
- Nếu query hỏi thời gian như "hôm nào nộp báo cáo", chỉ trả thời gian khi source có mốc thời gian.
- Dedupe nội dung trùng nhau. Chọn evidence tốt nhất, tối đa ${limit} kết quả.
- Trả JSON thuần, không markdown.

Query: ${JSON.stringify(query)}
Retrieval mode: ${mode}
Candidates:
${JSON.stringify(candidatePayload, null, 2)}

JSON schema:
{
  "answer": "câu trả lời ngắn bằng tiếng Việt, hoặc rỗng nếu không đủ evidence",
  "people": [
    {
      "senderId": "id từ candidate",
      "senderName": "tên từ candidate",
      "count": 2,
      "reason": "vì sao liên quan, dựa trên evidence",
      "evidenceMessageRefs": ["messageRef"]
    }
  ],
  "evidence": [
    {
      "messageRef": "messageRef từ candidate",
      "matchReason": "vì sao tin nhắn này là nguồn phù hợp",
      "score": 0.87
    }
  ]
}`;

    const model = getModel(AI_MODELS.FALLBACK);
    const result = await searchTimeout(
      model.generateContent(prompt),
      SEARCH_SYNTHESIS_TIMEOUT_MS,
      'AI search synthesis timeout',
    );
    const raw = result.response.text();
    const json = extractJsonObject(raw);
    if (!json) return null;

    const parsed = JSON.parse(json) as {
      answer?: unknown;
      people?: Array<{
        senderId?: unknown;
        senderName?: unknown;
        count?: unknown;
        reason?: unknown;
        evidenceMessageRefs?: unknown;
      }>;
      evidence?: Array<{
        messageRef?: unknown;
        matchReason?: unknown;
        score?: unknown;
      }>;
    };

    const byRef = new Map(shortlist.map((result) => [result.messageRef, result]));
    const evidenceRefs = Array.isArray(parsed.evidence)
      ? parsed.evidence
        .map((entry) => String(entry.messageRef ?? ''))
        .filter((ref) => byRef.has(ref))
      : [];

    if (evidenceRefs.length === 0) {
      return null;
    }

    const evidenceMeta = new Map<string, { matchReason?: string; score?: number }>();
    parsed.evidence?.forEach((entry) => {
      const ref = String(entry.messageRef ?? '');
      if (!byRef.has(ref)) return;
      evidenceMeta.set(ref, {
        matchReason: typeof entry.matchReason === 'string' ? entry.matchReason.slice(0, 180) : undefined,
        score: typeof entry.score === 'number' && Number.isFinite(entry.score) ? entry.score : undefined,
      });
    });

    const results: SearchResult[] = [];
    for (const ref of evidenceRefs) {
      const result = byRef.get(ref);
      if (!result) continue;
      const meta = evidenceMeta.get(ref);
      results.push({
        ...result,
        score: Math.max(result.score, Math.min(1, Math.max(0, meta?.score ?? 0))),
        matchReason: meta?.matchReason ?? this._inferMatchReason(query, result),
      });
      if (results.length >= limit) break;
    }

    if (results.length === 0) return null;

    const heuristicPeople = buildSearchPeople(results, query);
    const people = Array.isArray(parsed.people)
      ? parsed.people
        .map((entry) => {
          const senderId = String(entry.senderId ?? '');
          const evidenceMessageRefs = Array.isArray(entry.evidenceMessageRefs)
            ? entry.evidenceMessageRefs.map((ref) => String(ref)).filter((ref) => byRef.has(ref))
            : [];
          const matched = heuristicPeople.find((person) => person.senderId === senderId)
            ?? heuristicPeople.find((person) => person.evidenceMessageRefs.some((ref) => evidenceMessageRefs.includes(ref)));
          if (!matched || evidenceMessageRefs.length === 0) return null;
          return {
            ...matched,
            count: typeof entry.count === 'number' && Number.isFinite(entry.count)
              ? Math.max(1, Math.round(entry.count))
              : matched.count,
            reason: typeof entry.reason === 'string' && entry.reason.trim()
              ? entry.reason.slice(0, 180)
              : matched.reason,
            evidenceMessageRefs: evidenceMessageRefs.slice(0, 5),
          };
        })
        .filter((person): person is SearchPerson => Boolean(person))
        .slice(0, 5)
      : heuristicPeople;

    return {
      mode,
      answer: typeof parsed.answer === 'string' && parsed.answer.trim()
        ? parsed.answer.trim().slice(0, 240)
        : buildSearchAnswer(results, query),
      people: people.length > 0 ? people : heuristicPeople,
      results,
    };
  }

  private static async _loadVisibleMessagesByRefs(
    userId: string,
    conversationIds: string[],
    refs: string[],
  ): Promise<SearchMessage[]> {
    if (refs.length === 0) return [];

    const objectIds = refs
      .filter((ref) => Types.ObjectId.isValid(ref))
      .map((ref) => new Types.ObjectId(ref));
    const refClauses: Record<string, unknown>[] = [{ idempotencyKey: { $in: refs } }];
    if (objectIds.length > 0) refClauses.push({ _id: { $in: objectIds } });

    return MessageModel.find({
      ...visibleMessageFilterForSearch(conversationIds, userId),
      $or: refClauses,
    })
      .select('_id conversationId senderId content type idempotencyKey createdAt')
      .lean<SearchMessage[]>();
  }

  private static async _enqueueSearchBackfill(
    userId: string,
    conversationIds: string[],
  ): Promise<void> {
    const messages = await MessageModel.find({
      ...visibleMessageFilterForSearch(conversationIds, userId),
      content: { $type: 'string', $ne: '' },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(SEARCH_BACKFILL_LIMIT)
      .select('_id conversationId content type')
      .lean<Array<{ _id: unknown; conversationId: string; content?: string; type: string }>>();

    await Promise.all(messages.map((message) => produceMessage(
      KAFKA_TOPICS.MESSAGE_EMBEDDINGS,
      String(message._id),
      {
        messageId: String(message._id),
        conversationId: message.conversationId,
        contentText: message.content?.trim() ?? '',
        type: message.type,
        requestedAt: new Date().toISOString(),
        reason: 'ai-search-backfill',
      },
    ).catch((err) => {
      logger.debug('[AI Search] Failed to enqueue message embedding backfill', {
        messageId: String(message._id),
        err: err instanceof Error ? err.message : String(err),
      });
    })));
  }

  private static _serializeSearchItem(item: IAiAssistantItem): SearchResult {
    const metadata = item.metadata ?? {};
    const createdAt = metadata.messageCreatedAt ?? item.updatedAt.toISOString();
    const score = typeof metadata.similarity === 'number' ? metadata.similarity : 0;
    return {
      itemId: String(item._id),
      conversationId: item.conversationId ?? '',
      conversationName: String(metadata.conversationName ?? item.title ?? 'Conversation'),
      conversationAvatarUrl: null,
      conversationType: metadata.conversationType,
      messageId: String(metadata.messageId ?? item.refId ?? ''),
      messageRef: String(metadata.messageRef ?? item.refId ?? ''),
      senderId: String(metadata.senderId ?? ''),
      senderName: String(metadata.senderName ?? 'Người dùng'),
      snippet: item.summarySnippet ?? '',
      messageSnippet: item.summarySnippet ?? '',
      createdAt,
      timestamp: createdAt,
      score,
      similarity: metadata.similarity,
      source: metadata.source ?? 'keyword',
      matchReason: metadata.matchReason,
    };
  }

  private static async _loadLatestSavedSearch(
    userId: string,
    options: { conversationId?: string; limit?: number },
  ): Promise<{ query: string; mode: SearchMode; answer?: string; people: SearchPerson[]; results: SearchResult[]; total: number }> {
    if (options.conversationId) {
      await assertSearchMembership(options.conversationId, userId);
    }

    const query: Record<string, unknown> = { userId, type: 'search_result' };
    if (options.conversationId) query.conversationId = options.conversationId;

    const latest = await AiAssistantItemModel.findOne(query)
      .sort({ updatedAt: -1 });

    if (!latest?.metadata?.searchHash) {
      return { query: '', mode: 'saved', people: [], results: [], total: 0 };
    }

    const items = await AiAssistantItemModel.find({
      userId,
      type: 'search_result',
      'metadata.searchHash': latest.metadata.searchHash,
      ...(options.conversationId ? { conversationId: options.conversationId } : {}),
    })
      .sort({ 'metadata.searchRank': 1, updatedAt: -1 })
      .limit(options.limit ?? 20);

    const results = items.map((item) => this._serializeSearchItem(item));
    return {
      query: latest.metadata.searchQuery ?? '',
      mode: 'saved',
      answer: buildSearchAnswer(results, latest.metadata.searchQuery ?? ''),
      people: buildSearchPeople(results, latest.metadata.searchQuery ?? ''),
      results,
      total: results.length,
    };
  }

  private static async _saveSearchResultItems(
    userId: string,
    query: string,
    results: SearchResult[],
    scopeConversationId?: string,
  ): Promise<SearchResult[]> {
    if (results.length === 0) {
      return [];
    }

    const searchHash = hashParts([userId, scopeConversationId ?? 'all', query.toLowerCase()]);
    const messageIds = results
      .map((result) => String(result.messageId ?? ''))
      .filter(Boolean);

    await AiAssistantItemModel.deleteMany({
      userId,
      type: 'search_result',
      'metadata.searchHash': searchHash,
      refId: { $nin: messageIds },
    });

    const savedItems = await Promise.all(results.map((result, index) => {
      const conversationId = result.conversationId;
      const messageId = result.messageId;
      const messageRef = result.messageRef || messageId;
      const snippet = result.snippet.slice(0, 200);
      const conversationName = result.conversationName;
      const timestamp = result.createdAt || result.timestamp || new Date().toISOString();
      const similarity = result.similarity ?? result.score;

      return AiAssistantItemModel.findOneAndUpdate(
        {
          userId,
          type: 'search_result',
          refId: messageId,
          'metadata.searchHash': searchHash,
        },
        {
          $set: {
            userId,
            type: 'search_result',
            conversationId,
            refId: messageId,
            status: 'ready',
            title: conversationName.slice(0, 80),
            summarySnippet: snippet,
            metadata: {
              searchQuery: query,
              searchHash,
              searchRank: index,
              similarity,
              messageId,
              messageRef,
              messageCreatedAt: timestamp,
              senderId: result.senderId,
              senderName: result.senderName,
              source: result.source,
              matchReason: result.matchReason,
              conversationName,
              conversationType: result.conversationType,
            },
            trigger: 'manual',
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    }));

    return savedItems
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((a, b) => (a.metadata?.searchRank ?? 0) - (b.metadata?.searchRank ?? 0))
      .map((item) => this._serializeSearchItem(item as IAiAssistantItem));
  }

  private static async _reconcileAssistantItem(item: IAiAssistantItem): Promise<IAiAssistantItem> {
    if (item.status !== 'queued' && item.status !== 'processing') {
      return item;
    }

    const updatedAtTime = getDateTime(item.updatedAt);
    const isStale = updatedAtTime === 0 || Date.now() - updatedAtTime > STALE_ASSISTANT_JOB_MS;
    const digest = item.refId
      ? await AiCatchupDigestModel.findById(item.refId)
      : null;

    if (digest?.status === 'ready' && digest.summary) {
      return await this.updateItemWithDetail(String(item._id), digest) ?? item;
    }

    if (digest?.status === 'processing' && item.status !== 'processing') {
      return await this.updateItemStatus(String(item._id), 'processing', { title: item.title }) ?? item;
    }

    if (digest?.status === 'failed') {
      return await this.updateItemStatus(String(item._id), 'failed', {
        title: digest.summary?.title ?? item.title,
      }) ?? item;
    }

    if (!isStale) {
      return item;
    }

    logger.warn('[AI Assistant] Marking stale job as failed', {
      itemId: String(item._id),
      digestId: item.refId,
      status: item.status,
      updatedAt: item.updatedAt?.toISOString(),
    });

    if (digest && (digest.status === 'queued' || digest.status === 'processing')) {
      digest.status = 'failed';
      digest.error = 'AI Assistant job timed out before completion';
      await digest.save();
    }

    return await this.updateItemStatus(String(item._id), 'failed', { title: item.title }) ?? item;
  }

  private static _serializeDigest(digest: IAiCatchupDigest): Record<string, unknown> {
    return {
      _id: String(digest._id),
      userId: digest.userId,
      conversationId: digest.conversationId,
      cacheKey: digest.cacheKey,
      fromMessageRef: digest.fromMessageRef,
      toMessageRef: digest.toMessageRef,
      messageRefs: digest.messageRefs,
      messageCount: digest.messageCount,
      omittedOlderCount: digest.omittedOlderCount,
      catchupMode: digest.catchupMode,
      trigger: digest.trigger,
      status: digest.status,
      summary: digest.summary,
      futureSignals: digest.futureSignals,
      model: digest.get('model') as string | undefined,
      inputHash: digest.inputHash,
      error: digest.error,
      generatedAt: digest.generatedAt?.toISOString(),
      createdAt: digest.createdAt.toISOString(),
      updatedAt: digest.updatedAt.toISOString(),
    };
  }

  private static _serializeGroupNote(
    note: IAiGroupNote,
    meta?: SearchConversationMeta,
  ): Record<string, unknown> {
    return {
      _id: String(note._id),
      userId: note.userId,
      conversationId: note.conversationId,
      conversationName: meta?.name,
      conversationAvatarUrl: meta?.avatarUrl,
      conversationType: meta?.type,
      title: note.title,
      content: note.content,
      decisions: note.decisions,
      openQuestions: note.openQuestions,
      actionItems: note.actionItems,
      sourceMessageRefs: note.sourceMessageRefs,
      fromMessageRef: note.fromMessageRef,
      toMessageRef: note.toMessageRef,
      messageRefs: note.messageRefs,
      messageCount: note.messageCount,
      pinned: note.pinned,
      status: note.status,
      model: note.get('model') as unknown as string | undefined,
      error: note.error,
      generatedAt: note.generatedAt?.toISOString(),
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  private static async _createGroupNoteSnapshot(
    userId: string,
    conversationId: string,
    input: { fromLatestNote?: boolean },
  ): Promise<GroupNoteSnapshot> {
    const baseFilter = visibleMessageFilterForSearch([conversationId], userId);
    const latestReadyNote = input.fromLatestNote !== false
      ? await AiGroupNoteModel.findOne({
        userId,
        conversationId,
        status: 'ready',
      }).sort({ createdAt: -1 })
      : null;

    let messages: CatchupMessageRef[] = [];
    if (latestReadyNote?.toMessageRef) {
      const boundary = await findMessageByRef(conversationId, latestReadyNote.toMessageRef);
      if (boundary) {
        messages = await MessageModel.find({
          ...baseFilter,
          ...afterMessageQuery(boundary),
          content: { $type: 'string', $ne: '' },
        })
          .sort({ createdAt: 1, _id: 1 })
          .limit(GROUP_NOTE_RECENT_LIMIT)
          .select('_id idempotencyKey createdAt')
          .lean<CatchupMessageRef[]>();
      }
    }

    if (messages.length === 0) {
      const recentMessages = await MessageModel.find({
        ...baseFilter,
        content: { $type: 'string', $ne: '' },
      })
        .sort({ createdAt: -1, _id: -1 })
        .limit(GROUP_NOTE_RECENT_LIMIT)
        .select('_id idempotencyKey createdAt')
        .lean<CatchupMessageRef[]>();
      messages = recentMessages.reverse();
    }

    if (messages.length === 0) throw new BadRequestError('No visible messages for group note');

    const messageRefs = messages.map(getMessageRef);
    return {
      messageRefs,
      fromMessageRef: messageRefs[0],
      toMessageRef: messageRefs[messageRefs.length - 1],
      messageCount: messageRefs.length,
    };
  }

  private static async _createCatchupSnapshot(
    userId: string,
    conversationId: string,
    _input: { unreadCountHint?: number; toMessageRef?: string },
    latestDigest?: IAiCatchupDigest | null,
  ): Promise<CatchupSnapshot> {
    const member = await ConversationMemberModel.findOne({ conversationId, userId });
    if (!member) throw new NotFoundError('Conversation not found');

    const conv = await ConversationModel.findById(conversationId).select('unreadCounts').lean();
    if (!conv) throw new NotFoundError('Conversation not found');

    const baseFilter = visibleMessageFilter(conversationId, userId);
    const unreadCount = Math.max(
      getUnreadCount(conv.unreadCounts, userId),
      getMemberUnreadOverride(member as unknown as CatchupMember),
    );

    const recentMessages = await MessageModel.find({
      ...baseFilter,
      senderId: { $ne: userId },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(SNAPSHOT_LOOKBACK_LIMIT)
      .select('_id idempotencyKey createdAt')
      .lean<CatchupMessageRef[]>();

    const messageIds = recentMessages.map((message) => String(message._id));
    const idempotencyKeys = recentMessages
      .map((message) => message.idempotencyKey)
      .filter(Boolean) as string[];
    const statuses = await MessageStatusModel.find({
      userId,
      $or: [
        { messageId: { $in: messageIds } },
        { idempotencyKey: { $in: idempotencyKeys } },
      ],
    }).select('messageId idempotencyKey status').lean();

    const readRefs = new Set<string>();
    statuses
      .filter((status) => status.status === 'read')
      .forEach((status) => {
        if (status.messageId) readRefs.add(String(status.messageId));
        if (status.idempotencyKey) readRefs.add(status.idempotencyKey);
      });

    const unreadMessages = recentMessages.filter(
      (message) => !readRefs.has(String(message._id)) && !readRefs.has(message.idempotencyKey ?? ''),
    );

    if (unreadMessages.length > 0) {
      const targetUnreadCount = unreadCount > 0
        ? Math.min(unreadCount, unreadMessages.length)
        : unreadMessages.length;
      const selected = unreadMessages
        .slice(0, targetUnreadCount)
        .reverse();
      const messageRefs = selected.map(getMessageRef);
      return {
        mode: 'unread',
        messageRefs,
        fromMessageRef: messageRefs[0],
        toMessageRef: messageRefs[messageRefs.length - 1],
        messageCount: messageRefs.length,
        omittedOlderCount: Math.max(0, unreadMessages.length - selected.length),
      };
    }

    if (latestDigest?.toMessageRef) {
      const boundary = await findMessageByRef(conversationId, latestDigest.toMessageRef);
      if (boundary) {
        const messagesAfterDigest = await MessageModel.find({
          ...baseFilter,
          ...afterMessageQuery(boundary),
        })
          .sort({ createdAt: 1, _id: 1 })
          .limit(SNAPSHOT_LOOKBACK_LIMIT)
          .select('_id idempotencyKey createdAt')
          .lean<CatchupMessageRef[]>();

        if (messagesAfterDigest.length > 0) {
          const messageRefs = messagesAfterDigest.map(getMessageRef);
          return {
            mode: 'since_last_digest',
            messageRefs,
            fromMessageRef: messageRefs[0],
            toMessageRef: messageRefs[messageRefs.length - 1],
            messageCount: messageRefs.length,
            omittedOlderCount: 0,
          };
        }
      }
    }

    const latestVisibleMessages = await MessageModel.find(baseFilter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(RECENT_SNAPSHOT_LIMIT)
      .select('_id idempotencyKey createdAt')
      .lean<CatchupMessageRef[]>();

    if (latestVisibleMessages.length === 0) throw new BadRequestError('No visible messages');

    const selected = latestVisibleMessages.reverse();
    const messageRefs = selected.map(getMessageRef);
    return {
      mode: 'recent',
      messageRefs,
      fromMessageRef: messageRefs[0],
      toMessageRef: messageRefs[messageRefs.length - 1],
      messageCount: messageRefs.length,
      omittedOlderCount: 0,
    };
  }

  private static async _regenerateItem(
    userId: string,
    item: IAiAssistantItem,
    snapshot: {
      messageRefs: string[];
      fromMessageRef: string;
      toMessageRef: string;
      messageCount: number;
      omittedOlderCount: number;
      cacheKey: string;
      mode: AiCatchupMode;
      trigger: string;
    },
  ): Promise<Record<string, unknown>> {
    item.status = 'queued';
    item.trigger = snapshot.trigger as 'manual' | 'auto';
    item.refId = undefined;
    await item.save();

    const digest = await AiCatchupDigestModel.create({
      userId,
      conversationId: item.conversationId,
      cacheKey: snapshot.cacheKey,
      fromMessageRef: snapshot.fromMessageRef,
      toMessageRef: snapshot.toMessageRef,
      messageRefs: snapshot.messageRefs,
      messageCount: snapshot.messageCount,
      omittedOlderCount: snapshot.omittedOlderCount,
      catchupMode: snapshot.mode,
      trigger: snapshot.trigger as 'manual' | 'auto_suggested',
      status: 'queued',
      inputHash: hashParts([snapshot.mode, ...snapshot.messageRefs]),
    });

    item.refId = String(digest._id);
    item.metadata = {
      ...(item.metadata ?? {}),
      messageCount: snapshot.messageCount,
      unreadCount: snapshot.messageCount,
      catchupMode: snapshot.mode,
    };
    await item.save();

    await this._publishJob(item, digest);

    return { item: serializeItem(item), detail: this._serializeDigest(digest) };
  }

  private static async _publishJob(item: IAiAssistantItem, digest: IAiCatchupDigest): Promise<void> {
    const topic = KAFKA_TOPICS.AI_CATCHUP_JOBS;
    try {
      await produceMessage(topic, String(item._id), {
        itemId: String(item._id),
        digestId: String(digest._id),
        userId: item.userId,
        conversationId: item.conversationId!,
        type: 'catchup_digest',
        requestedAt: new Date().toISOString(),
      });
      emitAiAssistantItemUpdated(item.userId, {
        itemId: String(item._id),
        type: item.type,
        conversationId: item.conversationId,
        status: 'queued',
        title: item.title,
        metadata: item.metadata,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('[AI Assistant] Failed to publish Kafka job', { err: String(err) });
      digest.status = 'failed';
      digest.error = 'Failed to queue job';
      await digest.save();
      item.status = 'failed';
      await item.save();
      emitAiAssistantItemUpdated(item.userId, {
        itemId: String(item._id),
        type: item.type,
        conversationId: item.conversationId,
        status: 'failed',
        title: item.title,
        metadata: item.metadata,
        error: 'Failed to queue job',
        updatedAt: new Date().toISOString(),
      });
    }
  }

  private static async _publishGroupNoteJob(item: IAiAssistantItem, note: IAiGroupNote): Promise<void> {
    const topic = KAFKA_TOPICS.AI_CATCHUP_JOBS;
    try {
      await produceMessage(topic, String(item._id), {
        itemId: String(item._id),
        noteId: String(note._id),
        userId: item.userId,
        conversationId: item.conversationId!,
        type: 'group_note',
        requestedAt: new Date().toISOString(),
      });
      emitAiAssistantItemUpdated(item.userId, {
        itemId: String(item._id),
        type: item.type,
        conversationId: item.conversationId,
        status: 'queued',
        title: item.title,
        metadata: item.metadata,
        detail: this._serializeGroupNote(note),
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('[AI Assistant] Failed to publish group note job', { err: String(err) });
      note.status = 'failed';
      note.error = 'Failed to queue job';
      await note.save();
      item.status = 'failed';
      await item.save();
      emitAiAssistantItemUpdated(item.userId, {
        itemId: String(item._id),
        type: item.type,
        conversationId: item.conversationId,
        status: 'failed',
        title: item.title,
        metadata: item.metadata,
        error: 'Failed to queue job',
        updatedAt: new Date().toISOString(),
      });
    }
  }
}
