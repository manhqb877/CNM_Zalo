import { isValidObjectId } from 'mongoose';
import { getRedis } from '../../infrastructure/redis';
import { BadRequestError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { MessageModel, type IMessage } from './message.model';
import { MessageReactionSummaryModel } from './message-reaction-summary.model';
import { MessageReactionUserModel } from './message-reaction-user.model';
import { UserModel } from '../users/user.model';
import {
  REACTION_ACTION_SOURCES,
  REACTION_CONTRACT_VERSION,
  REACTION_EMOJIS,
  type ReactionAction,
  type ReactionActionSource,
  type ReactionEmoji,
} from './message-reaction.types';

export interface ReactionSummaryState {
  totalCount: number;
  emojiCounts: Record<string, number>;
}

export interface MessageReactionSummaryMap {
  [messageId: string]: ReactionSummaryState;
}

export interface ReactionDetailsTab {
  emoji: string;
  count: number;
}

export interface ReactionDetailsRow {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  lastEmoji: string | null;
  totalCount: number;
  emojiCounts: Record<string, number>;
}

export interface ReactionSummaryByMessageRef {
  messageId: string;
  conversationId: string;
  summary: ReactionSummaryState;
}

export interface ReactionDetailsByMessageRef {
  messageId: string;
  conversationId: string;
  tabs: ReactionDetailsTab[];
  rows: ReactionDetailsRow[];
}

export interface ReactionUserState {
  userId: string;
  lastEmoji: string | null;
  totalCount: number;
  emojiCounts: Record<string, number>;
}

export interface ReactionApplyResult {
  messageId: string;
  conversationId: string;
  summary: ReactionSummaryState;
  userState: ReactionUserState;
  updatedAt: string;
}

export interface ReactionUpdatedPayload {
  requestId: string;
  conversationId: string;
  messageRef: string;
  messageId: string;
  summary: ReactionSummaryState;
  actor: {
    userId: string;
    action: ReactionAction;
    actionSource: ReactionActionSource;
    emoji?: string;
    delta?: number;
  };
  userState: ReactionUserState;
  updatedAt: string;
  contractVersion: string;
}

export interface PendingReactionCommand {
  requestId: string;
  userId: string;
  conversationId: string;
  messageRef: string;
  action: ReactionAction;
  actionSource?: ReactionActionSource;
  emoji?: string;
  delta?: number;
  idempotencyKey: string;
  createdAt: string;
}

type ReactionUpdatedBroadcaster = (conversationId: string, payload: ReactionUpdatedPayload) => void;

export class MessageReactionsService {
  private static readonly REACTION_CMD_TTL_SECONDS = 300;
  private static readonly PENDING_TTL_SECONDS = 300;
  private static readonly MAX_DELTA = 20;
  private static readonly RATE_WINDOW_SECONDS = 10;
  private static readonly RATE_LIMIT_PER_WINDOW = 30;

  private static reactionUpdatedBroadcaster: ReactionUpdatedBroadcaster | null = null;

  static setReactionUpdatedBroadcaster(broadcaster: ReactionUpdatedBroadcaster): void {
    this.reactionUpdatedBroadcaster = broadcaster;
  }

  static async checkReactionRateLimit(userId: string, messageRef: string): Promise<boolean> {
    const redis = getRedis();
    const key = `reaction_rate:${userId}:${messageRef}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, this.RATE_WINDOW_SECONDS);
    }
    return count <= this.RATE_LIMIT_PER_WINDOW;
  }

  static async getSummariesByMessageIds(messageIds: string[]): Promise<MessageReactionSummaryMap> {
    const uniqueIds = Array.from(new Set(messageIds.filter((id) => typeof id === 'string' && id.length > 0)));
    if (uniqueIds.length === 0) {
      return {};
    }

    const summaries = await MessageReactionSummaryModel.find({
      messageId: { $in: uniqueIds },
    })
      .select('messageId emojiCounts totalCount')
      .lean();

    const result: MessageReactionSummaryMap = {};
    for (const summary of summaries) {
      const messageId = String(summary.messageId);
      result[messageId] = {
        totalCount: typeof summary.totalCount === 'number' ? summary.totalCount : 0,
        emojiCounts: this.normalizeEmojiCounts(summary.emojiCounts),
      };
    }

    return result;
  }

  static async resolveMessageByRef(messageRef: string): Promise<IMessage | null> {
    if (isValidObjectId(messageRef)) {
      const byId = await MessageModel.findById(messageRef).lean();
      if (byId) {
        return byId as unknown as IMessage;
      }
    }

    const byIdempotencyKey = await MessageModel.findOne({ idempotencyKey: messageRef }).lean();
    if (!byIdempotencyKey) {
      return null;
    }

    return byIdempotencyKey as unknown as IMessage;
  }

  static async getSummaryByMessageRef(messageRef: string): Promise<ReactionSummaryByMessageRef | null> {
    const message = await this.resolveMessageByRef(messageRef);
    if (!message) {
      return null;
    }

    const messageId = message._id.toString();
    const summaryDoc = await MessageReactionSummaryModel.findOne({ messageId })
      .select('emojiCounts totalCount')
      .lean();

    return {
      messageId,
      conversationId: message.conversationId,
      summary: {
        totalCount: typeof summaryDoc?.totalCount === 'number' ? summaryDoc.totalCount : 0,
        emojiCounts: this.normalizeEmojiCounts(summaryDoc?.emojiCounts),
      },
    };
  }

  static async getDetailsByMessageRef(messageRef: string): Promise<ReactionDetailsByMessageRef | null> {
    const message = await this.resolveMessageByRef(messageRef);
    if (!message) {
      return null;
    }

    const messageId = message._id.toString();
    const [summaryDoc, userDocs] = await Promise.all([
      MessageReactionSummaryModel.findOne({ messageId }).select('emojiCounts totalCount').lean(),
      MessageReactionUserModel.find({ messageId }).select('userId lastEmoji totalCount emojiCounts').lean(),
    ]);

    const summaryCounts = this.normalizeEmojiCounts(summaryDoc?.emojiCounts);
    const summaryTotalCount = typeof summaryDoc?.totalCount === 'number'
      ? summaryDoc.totalCount
      : this.sumCounts(summaryCounts);

    const reactorIds = userDocs
      .map((doc) => String(doc.userId))
      .filter((value): value is string => value.length > 0);

    const users = await UserModel.find({ _id: { $in: reactorIds } })
      .select('_id displayName avatarUrl')
      .lean();

    const userMap = new Map<string, { displayName: string; avatarUrl?: string }>();
    for (const user of users) {
      userMap.set(String(user._id), {
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
      });
    }

    const rows: ReactionDetailsRow[] = userDocs
      .map((doc) => {
        const userId = String(doc.userId);
        const profile = userMap.get(userId);
        return {
          userId,
          displayName: profile?.displayName ?? 'Unknown user',
          avatarUrl: profile?.avatarUrl,
          lastEmoji: typeof doc.lastEmoji === 'string' ? doc.lastEmoji : null,
          totalCount: typeof doc.totalCount === 'number' ? doc.totalCount : 0,
          emojiCounts: this.normalizeEmojiCounts(doc.emojiCounts),
        };
      })
      .sort((a, b) => b.totalCount - a.totalCount);

    const tabs: ReactionDetailsTab[] = [
      { emoji: 'ALL', count: summaryTotalCount },
      ...Object.entries(summaryCounts)
        .map(([emoji, count]) => ({ emoji, count }))
        .sort((a, b) => b.count - a.count),
    ];

    return {
      messageId,
      conversationId: message.conversationId,
      tabs,
      rows,
    };
  }

  static async getCachedReactionUpdate(idempotencyKey: string): Promise<ReactionUpdatedPayload | null> {
    const redis = getRedis();
    const raw = await redis.get(this.buildCommandKey(idempotencyKey));
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as ReactionUpdatedPayload;
      if (!parsed?.messageId || !parsed?.conversationId || !parsed?.requestId) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  static async cacheReactionUpdate(idempotencyKey: string, payload: ReactionUpdatedPayload): Promise<void> {
    const redis = getRedis();
    await redis.setex(
      this.buildCommandKey(idempotencyKey),
      this.REACTION_CMD_TTL_SECONDS,
      JSON.stringify(payload),
    );
  }

  static async enqueuePendingReaction(command: PendingReactionCommand): Promise<void> {
    const redis = getRedis();
    const key = this.buildPendingKey(command.messageRef);
    await redis.rpush(key, JSON.stringify(command));
    await redis.expire(key, this.PENDING_TTL_SECONDS);
  }

  static async applyPendingReactionsForMessage(params: {
    messageId: string;
    conversationId: string;
    messageRefs: string[];
  }): Promise<void> {
    const pendingCommands = await this.drainPendingCommands(params.messageRefs);
    if (pendingCommands.length === 0) {
      return;
    }

    for (const command of pendingCommands) {
      try {
        if (command.conversationId !== params.conversationId) {
          logger.warn(
            `[ReactionPending] Skip command due to conversation mismatch: ${command.idempotencyKey}`,
          );
          continue;
        }

        const cached = await this.getCachedReactionUpdate(command.idempotencyKey);
        if (cached) {
          this.emitReactionUpdated(command.conversationId, cached);
          continue;
        }

        if (command.action === 'upsert') {
          if (!command.emoji || typeof command.delta !== 'number') {
            logger.warn(`[ReactionPending] Invalid upsert command: ${command.idempotencyKey}`);
            continue;
          }

          const result = await this.applyUpsertReaction({
            messageId: params.messageId,
            conversationId: params.conversationId,
            userId: command.userId,
            emoji: command.emoji,
            delta: command.delta,
          });

          const payload = this.buildReactionUpdatedPayload({
            requestId: command.requestId,
            conversationId: params.conversationId,
            messageRef: command.messageRef,
            messageId: params.messageId,
            actor: {
              userId: command.userId,
              action: 'upsert',
              actionSource: command.actionSource ?? 'picker-select',
              emoji: command.emoji,
              delta: command.delta,
            },
            summary: result.summary,
            userState: result.userState,
            updatedAt: result.updatedAt,
          });

          await this.cacheReactionUpdate(command.idempotencyKey, payload);
          this.emitReactionUpdated(params.conversationId, payload);
          continue;
        }

        const result = await this.applyRemoveAllMine({
          messageId: params.messageId,
          conversationId: params.conversationId,
          userId: command.userId,
        });

        const payload = this.buildReactionUpdatedPayload({
          requestId: command.requestId,
          conversationId: params.conversationId,
          messageRef: command.messageRef,
          messageId: params.messageId,
          actor: {
            userId: command.userId,
            action: 'remove_all_mine',
            actionSource: command.actionSource ?? 'picker-select',
          },
          summary: result.summary,
          userState: result.userState,
          updatedAt: result.updatedAt,
        });

        await this.cacheReactionUpdate(command.idempotencyKey, payload);
        this.emitReactionUpdated(params.conversationId, payload);
      } catch (error) {
        logger.error(`[ReactionPending] Failed to apply command ${command.idempotencyKey}`, error);
      }
    }
  }

  static async applyUpsertReaction(input: {
    messageId: string;
    conversationId: string;
    userId: string;
    emoji: string;
    delta: number;
  }): Promise<ReactionApplyResult> {
    const emoji = this.ensureReactionEmoji(input.emoji);
    const delta = this.ensureDelta(input.delta);

    // Lay document hien tai de tinh emojiCounts moi (khong lock de tranh doi)
    const currentUserDoc = await MessageReactionUserModel.findOne({
      messageId: input.messageId,
      userId: input.userId,
    }).lean();

    const userCounts = this.normalizeEmojiCounts(currentUserDoc?.emojiCounts);
    this.applyDelta(userCounts, emoji, delta);

    // Su dung upsert de tranh loi duplicate key khi nhieu request chay dong thoi
    const persistedUser = await MessageReactionUserModel.findOneAndUpdate(
      { messageId: input.messageId, userId: input.userId },
      {
        $set: {
          conversationId: input.conversationId,
          lastEmoji: emoji,
          emojiCounts: new Map<string, number>(Object.entries(userCounts)),
        },
        $inc: { totalCount: delta },
      },
      { upsert: true, new: true, runValidators: true },
    );

    const summaryDoc = await MessageReactionSummaryModel.findOne({ messageId: input.messageId }).lean();
    const summaryCounts = this.normalizeEmojiCounts(summaryDoc?.emojiCounts);
    this.applyDelta(summaryCounts, emoji, delta);

    const persistedSummary = await MessageReactionSummaryModel.findOneAndUpdate(
      { messageId: input.messageId },
      {
        $set: {
          conversationId: input.conversationId,
          emojiCounts: new Map<string, number>(Object.entries(summaryCounts)),
        },
        $inc: { totalCount: delta },
      },
      { upsert: true, new: true, runValidators: true },
    );

    return {
      messageId: input.messageId,
      conversationId: input.conversationId,
      summary: {
        totalCount: persistedSummary.totalCount,
        emojiCounts: summaryCounts,
      },
      userState: {
        userId: input.userId,
        lastEmoji: emoji,
        totalCount: persistedUser.totalCount,
        emojiCounts: userCounts,
      },
      updatedAt: persistedSummary.updatedAt.toISOString(),
    };
  }

  static async applyRemoveAllMine(input: {
    messageId: string;
    conversationId: string;
    userId: string;
  }): Promise<ReactionApplyResult> {
    const userDoc = await MessageReactionUserModel.findOne({
      messageId: input.messageId,
      userId: input.userId,
    });

    const previousUserCounts = this.normalizeEmojiCounts(userDoc?.emojiCounts);
    const summaryDoc = await MessageReactionSummaryModel.findOne({ messageId: input.messageId });
    const summaryCounts = this.normalizeEmojiCounts(summaryDoc?.emojiCounts);

    for (const [emoji, count] of Object.entries(previousUserCounts)) {
      this.applyDelta(summaryCounts, emoji, -count);
    }

    const persistedSummary = summaryDoc ?? new MessageReactionSummaryModel({
      messageId: input.messageId,
      conversationId: input.conversationId,
    });

    persistedSummary.conversationId = input.conversationId;
    persistedSummary.emojiCounts = new Map<string, number>(Object.entries(summaryCounts));
    persistedSummary.totalCount = this.sumCounts(summaryCounts);
    await persistedSummary.save();

    if (userDoc) {
      userDoc.conversationId = input.conversationId;
      userDoc.emojiCounts = new Map<string, number>();
      userDoc.totalCount = 0;
      userDoc.lastEmoji = null;
      await userDoc.save();
    }

    return {
      messageId: input.messageId,
      conversationId: input.conversationId,
      summary: {
        totalCount: persistedSummary.totalCount,
        emojiCounts: summaryCounts,
      },
      userState: {
        userId: input.userId,
        lastEmoji: null,
        totalCount: 0,
        emojiCounts: {},
      },
      updatedAt: persistedSummary.updatedAt.toISOString(),
    };
  }

  static buildReactionUpdatedPayload(input: {
    requestId: string;
    conversationId: string;
    messageRef: string;
    messageId: string;
    actor: {
      userId: string;
      action: ReactionAction;
      actionSource: ReactionActionSource;
      emoji?: string;
      delta?: number;
    };
    summary: ReactionSummaryState;
    userState: ReactionUserState;
    updatedAt?: string;
  }): ReactionUpdatedPayload {
    return {
      requestId: input.requestId,
      conversationId: input.conversationId,
      messageRef: input.messageRef,
      messageId: input.messageId,
      summary: input.summary,
      actor: input.actor,
      userState: input.userState,
      updatedAt: input.updatedAt ?? new Date().toISOString(),
      contractVersion: REACTION_CONTRACT_VERSION,
    };
  }

  static ensureReactionActionSource(actionSource: string): ReactionActionSource {
    if ((REACTION_ACTION_SOURCES as readonly string[]).includes(actionSource)) {
      return actionSource as ReactionActionSource;
    }

    throw new BadRequestError('Invalid actionSource', 'VALIDATION_ERROR');
  }

  private static emitReactionUpdated(conversationId: string, payload: ReactionUpdatedPayload): void {
    if (!this.reactionUpdatedBroadcaster) {
      logger.warn('[MessageReactionsService] reaction broadcaster not initialized');
      return;
    }
    this.reactionUpdatedBroadcaster(conversationId, payload);
  }

  private static ensureReactionEmoji(emoji: string): ReactionEmoji {
    if ((REACTION_EMOJIS as readonly string[]).includes(emoji)) {
      return emoji as ReactionEmoji;
    }

    throw new BadRequestError('Unsupported emoji', 'VALIDATION_ERROR');
  }

  private static ensureDelta(delta: number): number {
    if (!Number.isFinite(delta) || delta <= 0 || delta > this.MAX_DELTA) {
      throw new BadRequestError(`delta must be between 1 and ${this.MAX_DELTA}`, 'VALIDATION_ERROR');
    }
    return Math.floor(delta);
  }

  private static normalizeEmojiCounts(raw: unknown): Record<string, number> {
    const normalized: Record<string, number> = {};

    const applyEntry = (emoji: string, value: unknown): void => {
      if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) {
        return;
      }

      const count = Number(value);
      if (!Number.isFinite(count) || count <= 0) {
        return;
      }

      normalized[emoji] = Math.floor(count);
    };

    if (raw instanceof Map) {
      for (const [emoji, count] of raw.entries()) {
        applyEntry(emoji, count);
      }
      return normalized;
    }

    if (typeof raw === 'object' && raw !== null) {
      for (const [emoji, count] of Object.entries(raw as Record<string, unknown>)) {
        applyEntry(emoji, count);
      }
    }

    return normalized;
  }

  private static applyDelta(counts: Record<string, number>, emoji: string, delta: number): void {
    const nextValue = (counts[emoji] ?? 0) + delta;
    if (nextValue <= 0) {
      delete counts[emoji];
      return;
    }
    counts[emoji] = nextValue;
  }

  private static sumCounts(counts: Record<string, number>): number {
    return Object.values(counts).reduce((sum, count) => sum + count, 0);
  }

  private static buildCommandKey(idempotencyKey: string): string {
    return `reaction_cmd:${idempotencyKey}`;
  }

  private static buildPendingKey(messageRef: string): string {
    return `pending_reaction:${messageRef}`;
  }

  private static async drainPendingCommands(messageRefs: string[]): Promise<PendingReactionCommand[]> {
    const redis = getRedis();
    const refs = Array.from(new Set(messageRefs.filter((value): value is string => typeof value === 'string' && value.length > 0)));
    const parsedCommands: PendingReactionCommand[] = [];

    for (const ref of refs) {
      const key = this.buildPendingKey(ref);
      const rawItems = await redis.lrange(key, 0, -1);
      await redis.del(key);

      for (const raw of rawItems) {
        const command = this.parsePendingCommand(raw);
        if (command) {
          parsedCommands.push(command);
        }
      }
    }

    return parsedCommands;
  }

  private static parsePendingCommand(raw: string): PendingReactionCommand | null {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (
        typeof parsed['requestId'] !== 'string'
        || typeof parsed['userId'] !== 'string'
        || typeof parsed['conversationId'] !== 'string'
        || typeof parsed['messageRef'] !== 'string'
        || typeof parsed['idempotencyKey'] !== 'string'
        || typeof parsed['createdAt'] !== 'string'
      ) {
        return null;
      }

      const action = parsed['action'];
      if (action !== 'upsert' && action !== 'remove_all_mine') {
        return null;
      }

      const actionSource = typeof parsed['actionSource'] === 'string'
        ? parsed['actionSource']
        : undefined;

      const command: PendingReactionCommand = {
        requestId: parsed['requestId'],
        userId: parsed['userId'],
        conversationId: parsed['conversationId'],
        messageRef: parsed['messageRef'],
        action,
        actionSource: actionSource && (REACTION_ACTION_SOURCES as readonly string[]).includes(actionSource)
          ? (actionSource as ReactionActionSource)
          : undefined,
        emoji: typeof parsed['emoji'] === 'string' ? parsed['emoji'] : undefined,
        delta: typeof parsed['delta'] === 'number' ? parsed['delta'] : undefined,
        idempotencyKey: parsed['idempotencyKey'],
        createdAt: parsed['createdAt'],
      };

      return command;
    } catch {
      return null;
    }
  }
}
