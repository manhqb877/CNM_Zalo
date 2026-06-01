import { createHash } from 'crypto';
import { Types } from 'mongoose';
import { getRedis } from '../../../infrastructure/redis';
import { KAFKA_TOPICS, produceMessage } from '../../../infrastructure/kafka';
import { logger } from '../../../shared/logger';
import { BadRequestError, ForbiddenError, NotFoundError, TooManyRequestsError } from '../../../shared/errors';
import { ConversationMemberModel, type IConversationMember } from '../../conversations/conversation-member.model';
import { ConversationModel } from '../../conversations/conversation.model';
import { MessageModel, type IMessage } from '../../messages/message.model';
import { MessageStatusModel } from '../../messages/message-status.model';
import { emitAiCatchupDigestUpdated } from '../../../socket/gateway';
import {
  AiCatchupDigestModel,
  type IAiCatchupDigest,
  type AiCatchupDigestStatus,
  type AiCatchupDigestTrigger,
} from './catchup.model';
import type { CreateCatchupDigestInput } from './catchup.schema';

const DEBOUNCE_SECONDS = parseInt(process.env['AI_CATCHUP_DEBOUNCE_SECONDS'] ?? '45', 10);
const MANUAL_DAILY_LIMIT = parseInt(process.env['AI_CATCHUP_MANUAL_DAILY_LIMIT'] ?? '10', 10);
const REGENERATE_DAILY_LIMIT = parseInt(process.env['AI_CATCHUP_REGENERATE_DAILY_LIMIT'] ?? '3', 10);
const SNAPSHOT_LOOKBACK_LIMIT = 300;

type LeanMessage = Pick<
  IMessage,
  '_id' | 'conversationId' | 'senderId' | 'content' | 'type' | 'idempotencyKey' | 'createdAt'
>;

export interface AiCatchupDigestResponse {
  _id: string;
  userId: string;
  conversationId: string;
  cacheKey: string;
  fromMessageRef: string;
  toMessageRef: string;
  messageRefs: string[];
  messageCount: number;
  omittedOlderCount: number;
  trigger: AiCatchupDigestTrigger;
  status: AiCatchupDigestStatus;
  summary?: IAiCatchupDigest['summary'];
  futureSignals?: IAiCatchupDigest['futureSignals'];
  model?: string;
  inputHash: string;
  error?: string;
  generatedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface SnapshotResult {
  messageRefs: string[];
  fromMessageRef: string;
  toMessageRef: string;
  inputHash: string;
}

interface SerializedDigestUpdate {
  digestId: string;
  conversationId: string;
  status: AiCatchupDigestStatus;
  summary?: IAiCatchupDigest['summary'];
  error?: string;
  updatedAt: string;
}

function hashParts(parts: string[]): string {
  return createHash('sha256').update(parts.join('\u001f')).digest('hex');
}

function getMessageRef(message: Pick<IMessage, '_id' | 'idempotencyKey'>): string {
  return message.idempotencyKey || String(message._id);
}

function getDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeUnreadCounts(unreadCounts: unknown): Record<string, number> {
  if (!unreadCounts) return {};
  if (unreadCounts instanceof Map) {
    return Object.fromEntries(unreadCounts.entries());
  }
  return unreadCounts as Record<string, number>;
}

function getUnreadCount(unreadCounts: unknown, userId: string): number {
  const value = normalizeUnreadCounts(unreadCounts)[userId];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

function buildSingleMessageRefQuery(ref: string): Record<string, unknown> {
  if (Types.ObjectId.isValid(ref)) {
    return {
      $or: [
        { _id: new Types.ObjectId(ref) },
        { idempotencyKey: ref },
      ],
    };
  }

  return { idempotencyKey: ref };
}

function buildMessageRefsQuery(refs: string[]): Record<string, unknown>[] {
  const objectIds = refs
    .filter((ref) => Types.ObjectId.isValid(ref))
    .map((ref) => new Types.ObjectId(ref));

  const clauses: Record<string, unknown>[] = [{ idempotencyKey: { $in: refs } }];
  if (objectIds.length > 0) {
    clauses.push({ _id: { $in: objectIds } });
  }

  return clauses;
}

function serializeDigest(digest: IAiCatchupDigest): AiCatchupDigestResponse {
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

function serializeDigestUpdate(digest: IAiCatchupDigest): SerializedDigestUpdate {
  return {
    digestId: String(digest._id),
    conversationId: digest.conversationId,
    status: digest.status,
    summary: digest.summary,
    error: digest.error,
    updatedAt: digest.updatedAt.toISOString(),
  };
}

async function assertMembership(conversationId: string, userId: string): Promise<IConversationMember> {
  const member = await ConversationMemberModel.findOne({ conversationId, userId });
  if (!member) {
    throw new ForbiddenError('Not allowed to use AI Catch-up for this conversation');
  }

  if (member.aiPreferences?.catchupEnabled === false) {
    throw new ForbiddenError('AI Catch-up is disabled for this conversation');
  }

  return member;
}

async function getToBoundaryMessage(
  conversationId: string,
  userId: string,
  toMessageRef?: string,
): Promise<LeanMessage | null> {
  const visibleFilter = {
    conversationId,
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [userId] },
  };

  if (toMessageRef) {
    return MessageModel.findOne({
      ...visibleFilter,
      ...buildSingleMessageRefQuery(toMessageRef),
    })
      .select('_id conversationId senderId content type idempotencyKey createdAt')
      .lean<LeanMessage>();
  }

  return MessageModel.findOne(visibleFilter)
    .sort({ createdAt: -1, _id: -1 })
    .select('_id conversationId senderId content type idempotencyKey createdAt')
    .lean<LeanMessage>();
}

async function findExplicitUnreadMessages(
  conversationId: string,
  userId: string,
  boundaryCreatedAt?: Date,
): Promise<LeanMessage[]> {
  const baseFilter: Record<string, unknown> = {
    conversationId,
    senderId: { $ne: userId },
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [userId] },
  };

  if (boundaryCreatedAt) {
    baseFilter['createdAt'] = { $lte: boundaryCreatedAt };
  }

  const recentMessages = await MessageModel.find(baseFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(SNAPSHOT_LOOKBACK_LIMIT)
    .select('_id conversationId senderId content type idempotencyKey createdAt')
    .lean<LeanMessage[]>();

  if (recentMessages.length === 0) {
    return [];
  }

  const messageIds = recentMessages.map((message) => String(message._id));
  const idempotencyKeys = recentMessages.map((message) => message.idempotencyKey).filter(Boolean);

  const statuses = await MessageStatusModel.find({
    userId,
    $or: [
      { messageId: { $in: messageIds } },
      { idempotencyKey: { $in: idempotencyKeys } },
    ],
  })
    .select('messageId idempotencyKey status')
    .lean();

  const statusByRef = new Map<string, string>();
  statuses.forEach((status) => {
    if (status.messageId) statusByRef.set(String(status.messageId), status.status);
    if (status.idempotencyKey) statusByRef.set(String(status.idempotencyKey), status.status);
  });

  return recentMessages
    .filter((message) => {
      const idStatus = statusByRef.get(String(message._id));
      const idemStatus = message.idempotencyKey ? statusByRef.get(message.idempotencyKey) : undefined;
      return idStatus !== 'read' && idemStatus !== 'read' && (idStatus !== undefined || idemStatus !== undefined);
    })
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function findLatestUnreadFallbackMessages(
  conversationId: string,
  userId: string,
  count: number,
  boundaryCreatedAt?: Date,
): Promise<LeanMessage[]> {
  if (count <= 0) {
    return [];
  }

  const baseFilter: Record<string, unknown> = {
    conversationId,
    senderId: { $ne: userId },
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [userId] },
  };

  if (boundaryCreatedAt) {
    baseFilter['createdAt'] = { $lte: boundaryCreatedAt };
  }

  const messages = await MessageModel.find(baseFilter)
    .sort({ createdAt: -1, _id: -1 })
    .limit(Math.min(count, SNAPSHOT_LOOKBACK_LIMIT))
    .select('_id conversationId senderId content type idempotencyKey createdAt')
    .lean<LeanMessage[]>();

  return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

async function createUnreadSnapshot(
  conversationId: string,
  userId: string,
  member: IConversationMember,
  input: CreateCatchupDigestInput,
): Promise<SnapshotResult> {
  const conversation = await ConversationModel.findById(conversationId).select('unreadCounts').lean();
  if (!conversation) {
    throw new NotFoundError('Conversation not found');
  }

  const boundaryMessage = await getToBoundaryMessage(conversationId, userId, input.toMessageRef);
  if (!boundaryMessage) {
    throw new BadRequestError('No visible messages to summarize');
  }

  const hintCount = typeof input.unreadCountHint === 'number' && input.unreadCountHint > 0
    ? input.unreadCountHint
    : 0;
  const storedUnreadCount = Math.max(
    hintCount,
    getUnreadCount(conversation.unreadCounts, userId),
    typeof member.unreadCount === 'number' ? member.unreadCount : 0,
  );

  const explicitUnread = await findExplicitUnreadMessages(
    conversationId,
    userId,
    new Date(boundaryMessage.createdAt),
  );

  const shouldUseFallback = storedUnreadCount > explicitUnread.length;
  const selectedMessages = shouldUseFallback
    ? await findLatestUnreadFallbackMessages(
        conversationId,
        userId,
        storedUnreadCount,
        new Date(boundaryMessage.createdAt),
      )
    : explicitUnread;

  if (selectedMessages.length === 0) {
    throw new BadRequestError('No unread messages available for AI Catch-up');
  }

  const messageRefs = selectedMessages.map(getMessageRef);
  const fromMessageRef = messageRefs[0];
  const toMessageRef = messageRefs[messageRefs.length - 1];

  if (!fromMessageRef || !toMessageRef) {
    throw new BadRequestError('Unable to create unread message snapshot');
  }

  return {
    messageRefs,
    fromMessageRef,
    toMessageRef,
    inputHash: hashParts(messageRefs),
  };
}

async function checkDailyLimit(userId: string, keySuffix: string, limit: number): Promise<void> {
  const redis = getRedis();
  const key = `ai:catchup:rate:${userId}:${keySuffix}:${getDateKey()}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, 24 * 60 * 60);
  }

  if (count > limit) {
    throw new TooManyRequestsError('AI Catch-up daily limit exceeded');
  }
}

async function checkDebounce(userId: string, conversationId: string): Promise<void> {
  const redis = getRedis();
  const key = `ai:catchup:debounce:${userId}:${conversationId}`;
  const result = await redis.set(key, '1', 'EX', DEBOUNCE_SECONDS, 'NX');
  if (result !== 'OK') {
    throw new TooManyRequestsError('AI Catch-up request is already queued recently');
  }
}

async function publishDigestJob(digest: IAiCatchupDigest): Promise<IAiCatchupDigest> {
  try {
    await produceMessage(KAFKA_TOPICS.AI_CATCHUP_JOBS, String(digest._id), {
      digestId: String(digest._id),
      userId: digest.userId,
      conversationId: digest.conversationId,
      requestedAt: new Date().toISOString(),
    });
    emitAiCatchupDigestUpdated(digest.userId, serializeDigestUpdate(digest));
    return digest;
  } catch (err) {
    logger.error('[AI Catch-up] Failed to publish Kafka job', {
      digestId: String(digest._id),
      err: String(err),
    });
    digest.status = 'failed';
    digest.error = 'AI worker queue is unavailable';
    await digest.save();
    emitAiCatchupDigestUpdated(digest.userId, serializeDigestUpdate(digest));
    return digest;
  }
}

export class AiCatchupService {
  static async createDigest(
    userId: string,
    conversationId: string,
    input: CreateCatchupDigestInput,
  ): Promise<AiCatchupDigestResponse> {
    const member = await assertMembership(conversationId, userId);
    const snapshot = await createUnreadSnapshot(conversationId, userId, member, input);
    const cacheKey = hashParts([userId, conversationId, snapshot.fromMessageRef, snapshot.toMessageRef]);

    const existing = await AiCatchupDigestModel.findOne({
      cacheKey,
      status: { $in: ['queued', 'processing', 'ready'] },
    });

    if (existing) {
      return serializeDigest(existing);
    }

    await checkDailyLimit(userId, input.trigger === 'manual' ? 'manual' : 'auto', MANUAL_DAILY_LIMIT);
    await checkDebounce(userId, conversationId);

    const failedExisting = await AiCatchupDigestModel.findOne({ cacheKey });
    if (failedExisting) {
      failedExisting.status = 'queued';
      failedExisting.trigger = input.trigger;
      failedExisting.error = undefined;
      failedExisting.summary = undefined;
      failedExisting.futureSignals = undefined;
      failedExisting.set('model', undefined);
      failedExisting.generatedAt = undefined;
      failedExisting.messageRefs = snapshot.messageRefs;
      failedExisting.messageCount = snapshot.messageRefs.length;
      failedExisting.omittedOlderCount = 0;
      failedExisting.inputHash = snapshot.inputHash;
      await failedExisting.save();
      const queued = await publishDigestJob(failedExisting);
      return serializeDigest(queued);
    }

    const digest = await AiCatchupDigestModel.create({
      userId,
      conversationId,
      cacheKey,
      fromMessageRef: snapshot.fromMessageRef,
      toMessageRef: snapshot.toMessageRef,
      messageRefs: snapshot.messageRefs,
      messageCount: snapshot.messageRefs.length,
      omittedOlderCount: 0,
      trigger: input.trigger,
      status: 'queued',
      inputHash: snapshot.inputHash,
    });

    const queued = await publishDigestJob(digest);
    return serializeDigest(queued);
  }

  static async getLatestDigest(userId: string, conversationId: string): Promise<AiCatchupDigestResponse | null> {
    await assertMembership(conversationId, userId);
    const digest = await AiCatchupDigestModel.findOne({ userId, conversationId }).sort({ createdAt: -1 });
    return digest ? serializeDigest(digest) : null;
  }

  static async getDigestById(userId: string, digestId: string): Promise<AiCatchupDigestResponse> {
    const digest = await AiCatchupDigestModel.findById(digestId);
    if (!digest || digest.userId !== userId) {
      throw new NotFoundError('AI Catch-up digest not found');
    }

    return serializeDigest(digest);
  }

  static async regenerateDigest(userId: string, digestId: string): Promise<AiCatchupDigestResponse> {
    const digest = await AiCatchupDigestModel.findById(digestId);
    if (!digest || digest.userId !== userId) {
      throw new NotFoundError('AI Catch-up digest not found');
    }

    await assertMembership(digest.conversationId, userId);
    await checkDailyLimit(userId, `regenerate:${digestId}`, REGENERATE_DAILY_LIMIT);

    digest.status = 'queued';
    digest.trigger = 'manual';
    digest.error = undefined;
    digest.summary = undefined;
    digest.futureSignals = undefined;
    digest.set('model', undefined);
    digest.generatedAt = undefined;
    await digest.save();

    const queued = await publishDigestJob(digest);
    return serializeDigest(queued);
  }

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
      throw new ForbiddenError('Not allowed to update AI Catch-up settings for this conversation');
    }

    return { catchupEnabled: member.aiPreferences?.catchupEnabled !== false };
  }

  static async markDigestProcessing(digest: IAiCatchupDigest): Promise<IAiCatchupDigest> {
    digest.status = 'processing';
    digest.error = undefined;
    await digest.save();
    emitAiCatchupDigestUpdated(digest.userId, serializeDigestUpdate(digest));
    return digest;
  }

  static async markDigestReady(digest: IAiCatchupDigest): Promise<IAiCatchupDigest> {
    await digest.save();
    emitAiCatchupDigestUpdated(digest.userId, serializeDigestUpdate(digest));
    return digest;
  }

  static async markDigestFailed(digest: IAiCatchupDigest, error: string): Promise<void> {
    digest.status = 'failed';
    digest.error = error.slice(0, 1000);
    await digest.save();
    emitAiCatchupDigestUpdated(digest.userId, serializeDigestUpdate(digest));
  }
}
