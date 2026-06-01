import { type Server, type Socket } from 'socket.io';
import { MessageReactionsService } from '../modules/messages/message-reaction.service';
import { ConversationMemberModel } from '../modules/conversations/conversation-member.model';
import { BadRequestError } from '../shared/errors';
import { logger } from '../shared/logger';
import { REACTION_CONTRACT_VERSION } from '../modules/messages/message-reaction.types';

interface AuthSocket extends Socket {
  userId: string;
}

interface ReactionUpsertPayload {
  requestId: string;
  conversationId: string;
  messageRef: string;
  emoji: string;
  delta: number;
  actionSource: string;
  idempotencyKey: string;
}

interface ReactionRemoveAllMinePayload {
  requestId: string;
  conversationId: string;
  messageRef: string;
  idempotencyKey: string;
}

function parseReactionUpsertPayload(payload: unknown): ReactionUpsertPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid reaction_upsert payload', 'VALIDATION_ERROR');
  }

  const data = payload as Record<string, unknown>;
  const requestId = data['requestId'];
  const conversationId = data['conversationId'];
  const messageRef = data['messageRef'];
  const emoji = data['emoji'];
  const delta = data['delta'];
  const actionSource = data['actionSource'];
  const idempotencyKey = data['idempotencyKey'];

  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new BadRequestError('requestId is required', 'VALIDATION_ERROR');
  }

  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    throw new BadRequestError('conversationId is required', 'VALIDATION_ERROR');
  }

  if (typeof messageRef !== 'string' || messageRef.length === 0) {
    throw new BadRequestError('messageRef is required', 'VALIDATION_ERROR');
  }

  if (typeof emoji !== 'string' || emoji.length === 0) {
    throw new BadRequestError('emoji is required', 'VALIDATION_ERROR');
  }

  if (typeof delta !== 'number' || !Number.isFinite(delta)) {
    throw new BadRequestError('delta must be a number', 'VALIDATION_ERROR');
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw new BadRequestError('idempotencyKey is required', 'VALIDATION_ERROR');
  }

  if (typeof actionSource !== 'string') {
    throw new BadRequestError('actionSource is required', 'VALIDATION_ERROR');
  }

  return {
    requestId,
    conversationId,
    messageRef,
    emoji,
    delta,
    actionSource,
    idempotencyKey,
  };
}

function parseReactionRemoveAllMinePayload(payload: unknown): ReactionRemoveAllMinePayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid reaction_remove_all_mine payload', 'VALIDATION_ERROR');
  }

  const data = payload as Record<string, unknown>;
  const requestId = data['requestId'];
  const conversationId = data['conversationId'];
  const messageRef = data['messageRef'];
  const idempotencyKey = data['idempotencyKey'];

  if (typeof requestId !== 'string' || requestId.length === 0) {
    throw new BadRequestError('requestId is required', 'VALIDATION_ERROR');
  }

  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    throw new BadRequestError('conversationId is required', 'VALIDATION_ERROR');
  }

  if (typeof messageRef !== 'string' || messageRef.length === 0) {
    throw new BadRequestError('messageRef is required', 'VALIDATION_ERROR');
  }

  if (typeof idempotencyKey !== 'string' || idempotencyKey.length === 0) {
    throw new BadRequestError('idempotencyKey is required', 'VALIDATION_ERROR');
  }

  return { requestId, conversationId, messageRef, idempotencyKey };
}

function buildReactionAckPayload(input: {
  requestId: string;
  conversationId: string;
  messageRef: string;
  messageId: string | null;
  userId: string;
  action: 'upsert' | 'remove_all_mine';
}): Record<string, unknown> {
  return {
    requestId: input.requestId,
    accepted: true,
    conversationId: input.conversationId,
    messageRef: input.messageRef,
    messageId: input.messageId,
    userId: input.userId,
    action: input.action,
    optimistic: true,
    serverTs: new Date().toISOString(),
    contractVersion: REACTION_CONTRACT_VERSION,
  };
}

function emitReactionError(
  socket: Socket,
  context: { requestId?: string; conversationId?: string; messageRef?: string },
  code: string,
  message: string,
): void {
  socket.emit('reaction_error', {
    requestId: context.requestId ?? '',
    conversationId: context.conversationId ?? '',
    messageRef: context.messageRef ?? '',
    code,
    message,
    contractVersion: REACTION_CONTRACT_VERSION,
  });
}

async function handleReactionUpsert(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseReactionUpsertPayload(payload);

  const membership = await ConversationMemberModel.exists({
    conversationId: input.conversationId,
    userId,
  });

  if (!membership) {
    emitReactionError(socket, input, 'FORBIDDEN', 'Not allowed to react in this conversation');
    return;
  }

  const withinRateLimit = await MessageReactionsService.checkReactionRateLimit(userId, input.messageRef);
  if (!withinRateLimit) {
    emitReactionError(socket, input, 'RATE_LIMITED', 'Too many reaction updates. Please try again shortly.');
    return;
  }

  await socket.join(`conv:${input.conversationId}`);

  const resolvedMessage = await MessageReactionsService.resolveMessageByRef(input.messageRef);
  if (resolvedMessage && resolvedMessage.conversationId !== input.conversationId) {
    emitReactionError(socket, input, 'MESSAGE_NOT_FOUND', 'Message does not belong to this conversation');
    return;
  }

  socket.emit('reaction_ack', buildReactionAckPayload({
    requestId: input.requestId,
    conversationId: input.conversationId,
    messageRef: input.messageRef,
    messageId: resolvedMessage?._id?.toString() ?? null,
    userId,
    action: 'upsert',
  }));

  void (async () => {
    try {
      const cached = await MessageReactionsService.getCachedReactionUpdate(input.idempotencyKey);
      if (cached) {
        io.to(`conv:${input.conversationId}`).emit('reaction_updated', cached);
        return;
      }

      const targetMessage = resolvedMessage ?? await MessageReactionsService.resolveMessageByRef(input.messageRef);
      if (!targetMessage) {
        await MessageReactionsService.enqueuePendingReaction({
          requestId: input.requestId,
          userId,
          conversationId: input.conversationId,
          messageRef: input.messageRef,
          action: 'upsert',
          actionSource: 'picker-select' as const,
          emoji: input.emoji,
          delta: input.delta,
          idempotencyKey: input.idempotencyKey,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (targetMessage.conversationId !== input.conversationId) {
        emitReactionError(socket, input, 'MESSAGE_NOT_FOUND', 'Message does not belong to this conversation');
        return;
      }

      const result = await MessageReactionsService.applyUpsertReaction({
        messageId: targetMessage._id.toString(),
        conversationId: input.conversationId,
        userId,
        emoji: input.emoji,
        delta: input.delta,
      });

      const updatedPayload = MessageReactionsService.buildReactionUpdatedPayload({
        requestId: input.requestId,
        conversationId: input.conversationId,
        messageRef: input.messageRef,
        messageId: targetMessage._id.toString(),
        actor: {
          userId,
          action: 'upsert',
          actionSource: 'picker-select' as const,
          emoji: input.emoji,
          delta: input.delta,
        },
        summary: result.summary,
        userState: result.userState,
        updatedAt: result.updatedAt,
      });

      await MessageReactionsService.cacheReactionUpdate(input.idempotencyKey, updatedPayload);
      io.to(`conv:${input.conversationId}`).emit('reaction_updated', updatedPayload);
    } catch (error) {
      logger.error('reaction_upsert async flow error', error);
      emitReactionError(socket, input, 'REACTION_UPSERT_FAILED', 'Failed to update reaction');
    }
  })();
}

async function handleReactionRemoveAllMine(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseReactionRemoveAllMinePayload(payload);

  const membership = await ConversationMemberModel.exists({
    conversationId: input.conversationId,
    userId,
  });

  if (!membership) {
    emitReactionError(socket, input, 'FORBIDDEN', 'Not allowed to react in this conversation');
    return;
  }

  const withinRateLimit = await MessageReactionsService.checkReactionRateLimit(userId, input.messageRef);
  if (!withinRateLimit) {
    emitReactionError(socket, input, 'RATE_LIMITED', 'Too many reaction updates. Please try again shortly.');
    return;
  }

  await socket.join(`conv:${input.conversationId}`);

  const resolvedMessage = await MessageReactionsService.resolveMessageByRef(input.messageRef);
  if (resolvedMessage && resolvedMessage.conversationId !== input.conversationId) {
    emitReactionError(socket, input, 'MESSAGE_NOT_FOUND', 'Message does not belong to this conversation');
    return;
  }

  socket.emit('reaction_ack', buildReactionAckPayload({
    requestId: input.requestId,
    conversationId: input.conversationId,
    messageRef: input.messageRef,
    messageId: resolvedMessage?._id?.toString() ?? null,
    userId,
    action: 'remove_all_mine',
  }));

  void (async () => {
    try {
      const cached = await MessageReactionsService.getCachedReactionUpdate(input.idempotencyKey);
      if (cached) {
        io.to(`conv:${input.conversationId}`).emit('reaction_updated', cached);
        return;
      }

      const targetMessage = resolvedMessage ?? await MessageReactionsService.resolveMessageByRef(input.messageRef);
      if (!targetMessage) {
        await MessageReactionsService.enqueuePendingReaction({
          requestId: input.requestId,
          userId,
          conversationId: input.conversationId,
          messageRef: input.messageRef,
          action: 'remove_all_mine',
          actionSource: 'picker-select',
          idempotencyKey: input.idempotencyKey,
          createdAt: new Date().toISOString(),
        });
        return;
      }

      if (targetMessage.conversationId !== input.conversationId) {
        emitReactionError(socket, input, 'MESSAGE_NOT_FOUND', 'Message does not belong to this conversation');
        return;
      }

      const result = await MessageReactionsService.applyRemoveAllMine({
        messageId: targetMessage._id.toString(),
        conversationId: input.conversationId,
        userId,
      });

      const updatedPayload = MessageReactionsService.buildReactionUpdatedPayload({
        requestId: input.requestId,
        conversationId: input.conversationId,
        messageRef: input.messageRef,
        messageId: targetMessage._id.toString(),
        actor: {
          userId,
          action: 'remove_all_mine',
          actionSource: 'picker-select',
        },
        summary: result.summary,
        userState: result.userState,
        updatedAt: result.updatedAt,
      });

      await MessageReactionsService.cacheReactionUpdate(input.idempotencyKey, updatedPayload);
      io.to(`conv:${input.conversationId}`).emit('reaction_updated', updatedPayload);
    } catch (error) {
      logger.error('reaction_remove_all_mine async flow error', error);
      emitReactionError(socket, input, 'REACTION_REMOVE_FAILED', 'Failed to remove reactions');
    }
  })();
}

/**
 * ReactionController - Dang ky reaction events cho socket
 */
export function registerReactionController(io: Server, socket: AuthSocket): void {
  socket.on('reaction_upsert', async (payload: unknown) => {
    try {
      await handleReactionUpsert(io, socket, payload);
    } catch (err) {
      logger.error('reaction_upsert error', err);
      const reactionError = resolveReactionError(err, 'REACTION_UPSERT_FAILED', 'Failed to upsert reaction');
      emitReactionError(
        socket,
        extractReactionContext(payload),
        reactionError.code,
        reactionError.message,
      );
    }
  });

  socket.on('reaction_remove_all_mine', async (payload: unknown) => {
    try {
      await handleReactionRemoveAllMine(io, socket, payload);
    } catch (err) {
      logger.error('reaction_remove_all_mine error', err);
      const reactionError = resolveReactionError(err, 'REACTION_REMOVE_FAILED', 'Failed to remove reactions');
      emitReactionError(
        socket,
        extractReactionContext(payload),
        reactionError.code,
        reactionError.message,
      );
    }
  });
}

function extractReactionContext(payload: unknown): {
  requestId?: string;
  conversationId?: string;
  messageRef?: string;
} {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }

  const record = payload as Record<string, unknown>;
  return {
    requestId: typeof record['requestId'] === 'string' ? record['requestId'] : undefined,
    conversationId: typeof record['conversationId'] === 'string' ? record['conversationId'] : undefined,
    messageRef: typeof record['messageRef'] === 'string' ? record['messageRef'] : undefined,
  };
}

function resolveReactionError(
  err: unknown,
  fallbackCode: string,
  fallbackMessage: string,
): { code: string; message: string } {
  if (err instanceof BadRequestError) {
    return { code: err.code ?? 'VALIDATION_ERROR', message: err.message };
  }

  if (err instanceof Error) {
    return { code: fallbackCode, message: err.message || fallbackMessage };
  }

  return { code: fallbackCode, message: fallbackMessage };
}
