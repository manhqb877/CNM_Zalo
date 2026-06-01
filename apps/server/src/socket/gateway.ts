import { type Server as HttpServer } from 'http';
import { Server, type Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { createRedisDuplicate, getRedis, setTypingIndicator, removeTypingIndicator, setUserOnline, removeUserOnline, checkMessageRateLimit } from '../infrastructure/redis';
import { logger } from '../shared/logger';
import { MessagesService } from '../modules/messages/messages.service';
import { MessageModel } from '../modules/messages/message.model';
import { MessageStatusModel } from '../modules/messages/message-status.model';
import { produceMessage, KAFKA_TOPICS } from '../infrastructure/kafka';
import { ConversationMemberModel } from '../modules/conversations/conversation-member.model';
import { ConversationModel } from '../modules/conversations/conversation.model';
import { UserModel } from '../modules/users/user.model';
import { stickerService } from '../modules/stickers/sticker.service';
import { setKafkaInsertFailureCallback } from '../workers/message.worker';
import { produceNotificationEvent } from '../modules/notifications/notifications.service';
import { MessageType } from '../modules/messages/message.model';
import { MessageReactionsService } from '../modules/messages/message-reaction.service';
import { BadRequestError } from '../shared/errors';
import { CallsService } from '../modules/calls/calls.service';
import { recordReconnectOfferAttempt } from '../modules/calls/calls.metrics';
import {
  setPresenceOnline,
  setPresenceOffline,
  refreshPresenceOnline,
  getFriendIds,
  getBulkPresence,
} from '../modules/users/presence.service';
import { resolveActiveCallForConversation } from '../modules/conversations/conversations.service';
// Sub-controllers (Phase 1 Refactoring)
import { registerCallController } from './call.controller';
import { registerChatController, setChatKafkaFailureMode } from './chat.controller';
import { registerReactionController } from './reaction.controller';

// Rate limits: normal (300/500ms) vs fallback (200/500ms)

const HEARTBEAT_INTERVAL_MS = 30000;

let ioInstance: Server | null = null;
let kafkaFailureMode = false; // Track if Kafka batch insert is failing
const callTimeoutRegistry = new Map<string, NodeJS.Timeout>();

/** Broadcast presence change only to friends of the user */
async function broadcastPresenceChanged(
  io: Server,
  userId: string,
  online: boolean,
): Promise<void> {
  try {
    const friendIds = await getFriendIds(userId);
    for (const friendId of friendIds) {
      io.to(`user:${friendId}`).emit('presence_changed', {
        userId,
        status: online ? 'online' : 'offline',
        lastSeen: online ? null : new Date().toISOString(),
      });
    }
  } catch (err) {
    logger.error('[Presence] broadcast error', err);
  }
}

interface AuthSocket extends Socket {
  userId: string;
}

interface CallInvitePayload {
  targetUserId: string;
  conversationId?: string;
  callType: 'audio' | 'video';
}

interface CallGroupInvitePayload {
  conversationId: string;
  callType: 'audio' | 'video';
}

interface CallSessionPayload {
  sessionId: string;
  callToken: string;
}

interface CallRejectPayload {
  sessionId: string;
  reason?: 'rejected' | 'busy';
  callToken: string;
}

interface CallEndPayload {
  sessionId: string;
  reason?: string;
  callToken: string;
}

interface WebRtcSignalPayload {
  sessionId: string;
  toUserId: string;
  callToken: string;
  sdp?: unknown;
  candidate?: unknown;
}

export function getIO(): Server | null {
  return ioInstance;
}

export function setKafkaFailureMode(failed: boolean): void {
  if (failed !== kafkaFailureMode) {
    kafkaFailureMode = failed;
    setChatKafkaFailureMode(failed);
    logger.warn(`[Gateway] Kafka failure mode: ${failed ? 'ENABLED' : 'DISABLED'}`);
  }
}

export function emitNotification(
  userId: string,
  notification: Record<string, unknown>,
): void {
  ioInstance?.to(`user:${userId}`).emit('new_notification', notification);
}

export function emitAiCatchupDigestUpdated(
  userId: string,
  payload: unknown,
): void {
  ioInstance?.to(`user:${userId}`).emit('ai_catchup_digest_updated', payload);
}

export function emitAiReminderUpdated(
  userId: string,
  payload: unknown,
): void {
  ioInstance?.to(`user:${userId}`).emit('ai_reminder_updated', payload);
}

export function emitAiAssistantItemUpdated(
  userId: string,
  payload: unknown,
): void {
  ioInstance?.to(`user:${userId}`).emit('ai_assistant_item_updated', payload);
}

export function initSocketGateway(httpServer: HttpServer): Server {
  const configuredCorsOrigins = (process.env['CORS_ORIGINS'] ?? 'http://localhost:3001')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  const isLanMode = process.env['NODE_ENV'] !== 'production'
    && process.env['HOST'] === '0.0.0.0';
  const socketCorsOrigin = isLanMode ? true : configuredCorsOrigins;

  const io = new Server(httpServer, {
    cors: {
      origin: socketCorsOrigin,
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  ioInstance = io;

  MessageReactionsService.setReactionUpdatedBroadcaster((conversationId, payload) => {
    io.to(`conv:${conversationId}`).emit('reaction_updated', payload);
  });

  // Setup fallback callback for Kafka worker failures
  setKafkaInsertFailureCallback(async (failedMessages) => {
    try {
      // Enable fallback mode: reduce rate limit to 200/500ms
      setKafkaFailureMode(true);
      await MessagesService.fallbackBatchInsert(failedMessages);
      logger.info(`[Fallback] Successfully inserted ${failedMessages.length} messages via service`);
    } catch (err) {
      logger.error('[Fallback] Failed to insert messages', err);
    }
  });

  // Dùng Redis adapter để đồng bộ sự kiện giữa nhiều server instance
  const pubClient = getRedis();
  const subClient = createRedisDuplicate();
  io.adapter(createAdapter(pubClient, subClient));

  // Xác thực JWT trước khi cho phép kết nối socket
  io.use((socket, next) => {
    const token = (socket.handshake.auth as Record<string, string>)['token']
      ?? socket.handshake.headers['authorization']?.replace('Bearer ', '');

    if (!token) return next(new Error('Missing auth token'));

    try {
      const secret = process.env['JWT_SECRET'];
      if (!secret) throw new Error('JWT_SECRET not configured');
      const payload = jwt.verify(token, secret) as { sub: string };
      (socket as AuthSocket).userId = payload.sub;
      next();
    } catch {
      next(new Error('Invalid auth token'));
    }
  });

  // Xử lý kết nối socket mới
  io.on('connection', (socket) => {
    const { userId } = socket as AuthSocket;
    logger.debug(`Socket connected: ${userId}`);

    // Tham gia room cá nhân để nhận tin nhắn trực tiếp
    void socket.join(`user:${userId}`);

    // Đánh dấu user đang online trong Redis và broadcast cho bạn bè
    void (async () => {
      await setPresenceOnline(userId);
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        { $set: { isOnline: true } },
        { new: true },
      ).select('showOnlineStatus');

      if (updated?.showOnlineStatus !== false) {
        await broadcastPresenceChanged(io, userId, true);
      }
    })();

    // Heartbeat: client gui `heartbeat` moi 50s de giu online
    socket.on('heartbeat', async () => {
      await refreshPresenceOnline(userId);
    });

    socket.on('join_conversation', async (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) {
        return;
      }

      try {
        const member = await ConversationMemberModel.findOne({
          conversationId,
          userId,
        }).select('_id');

        if (!member) {
          socket.emit('error', { message: 'Not allowed to join this conversation' });
          return;
        }

        await socket.join(`conv:${conversationId}`);

        const conversation = await ConversationModel.findById(conversationId).select('activeCall').lean();
        const activeCall = await resolveActiveCallForConversation(
          conversationId,
          conversation?.activeCall as Parameters<typeof resolveActiveCallForConversation>[1],
        );
        socket.emit('conversation_active_call_updated', {
          conversationId,
          activeCall,
        });
      } catch (err) {
        logger.error('join_conversation error', err);
      }
    });

    socket.on('leave_conversation', async (payload: { conversationId?: string }) => {
      const conversationId = payload?.conversationId;
      if (!conversationId) {
        return;
      }

      try {
        await socket.leave(`conv:${conversationId}`);
      } catch (err) {
        logger.error('leave_conversation error', err);
      }
    });

    // ✅ Chat Events – delegated to ChatController sub-module
    registerChatController(io, socket as AuthSocket);

    // ✅ Reaction Events – delegated to ReactionController sub-module
    registerReactionController(io, socket as AuthSocket);

    // ✅ Call & WebRTC Events – delegated to CallController sub-module
    registerCallController(io, socket as AuthSocket);
    socket.on('typing_start', async (payload: unknown) => {
      try {
        if (typeof payload !== 'object' || payload === null) {
          socket.emit('error', { message: 'Invalid typing_start payload' });
          return;
        }

        const { conversationId } = payload as { conversationId?: string };
        if (!conversationId) {
          socket.emit('error', { message: 'Missing conversationId' });
          return;
        }

        const membership = await ConversationMemberModel.exists({ conversationId, userId });
        if (!membership) {
          socket.emit('error', { message: 'Not allowed to type in this conversation' });
          return;
        }

        await socket.join(`conv:${conversationId}`);
        await setTypingIndicator(conversationId, userId);
        socket.to(`conv:${conversationId}`).emit('typing_indicator', {
          userId,
          conversationId,
          isTyping: true,
        });
      } catch (err) {
        logger.error('typing_start error', err);
        socket.emit('error', { message: 'Failed to update typing status' });
      }
    });

    // Sự kiện dừng gõ phím
    socket.on('typing_stop', async (payload: unknown) => {
      try {
        if (typeof payload !== 'object' || payload === null) {
          socket.emit('error', { message: 'Invalid typing_stop payload' });
          return;
        }

        const { conversationId } = payload as { conversationId?: string };
        if (!conversationId) {
          socket.emit('error', { message: 'Missing conversationId' });
          return;
        }

        const membership = await ConversationMemberModel.exists({ conversationId, userId });
        if (!membership) {
          socket.emit('error', { message: 'Not allowed to type in this conversation' });
          return;
        }

        await socket.join(`conv:${conversationId}`);
        await removeTypingIndicator(conversationId, userId);
        socket.to(`conv:${conversationId}`).emit('typing_indicator', {
          userId,
          conversationId,
          isTyping: false,
        });
      } catch (err) {
        logger.error('typing_stop error', err);
        socket.emit('error', { message: 'Failed to update typing status' });
      }
    });

    socket.on('disconnect', async () => {
      logger.debug(`Socket disconnected: ${userId}`);
      await setPresenceOffline(userId);
      const updated = await UserModel.findByIdAndUpdate(
        userId,
        { $set: { isOnline: false, lastSeenAt: new Date() } },
        { new: true },
      ).select('showOnlineStatus');

      if (updated?.showOnlineStatus !== false) {
        await broadcastPresenceChanged(io, userId, false);
      }
    });
  });

  return io;
}

function registerCallTimeout(sessionId: string, task: () => Promise<void>): void {
  clearCallTimeout(sessionId);
  const timeoutMsRaw = Number.parseInt(process.env['CALL_RING_TIMEOUT_MS'] ?? '30000', 10);
  const timeoutMs = Number.isNaN(timeoutMsRaw) || timeoutMsRaw < 1000 ? 30_000 : timeoutMsRaw;
  const timeout = setTimeout(() => {
    callTimeoutRegistry.delete(sessionId);
    void task().catch((err) => {
      logger.error('call timeout handler error', err);
    });
  }, timeoutMs);
  callTimeoutRegistry.set(sessionId, timeout);
}

function clearCallTimeout(sessionId: string): void {
  const timeout = callTimeoutRegistry.get(sessionId);
  if (timeout) {
    clearTimeout(timeout);
    callTimeoutRegistry.delete(sessionId);
  }
}

function emitCallStatus(
  io: Server,
  participantIds: string[],
  payload: {
    sessionId: string;
    status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
    reason?: string | null;
  },
): void {
  for (const participantId of participantIds) {
    io.to(`user:${participantId}`).emit('call_status', payload);
  }
}

function parseCallInvitePayload(payload: unknown): CallInvitePayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid call_invite payload');
  }

  const data = payload as Record<string, unknown>;
  const targetUserId = data['targetUserId'];
  const conversationId = data['conversationId'];
  const callType = data['callType'];

  if (typeof targetUserId !== 'string' || targetUserId.length === 0) {
    throw new BadRequestError('targetUserId is required');
  }

  if (conversationId !== undefined && (typeof conversationId !== 'string' || conversationId.length === 0)) {
    throw new BadRequestError('conversationId must be a non-empty string');
  }
  if (callType !== undefined && callType !== 'audio' && callType !== 'video') {
    throw new BadRequestError('callType must be audio or video');
  }

  return {
    targetUserId,
    conversationId: typeof conversationId === 'string' ? conversationId : undefined,
    callType: callType === 'audio' ? 'audio' : 'video',
  };
}

function parseCallGroupInvitePayload(payload: unknown): CallGroupInvitePayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid call_group_invite payload');
  }

  const data = payload as Record<string, unknown>;
  const conversationId = data['conversationId'];
  const callType = data['callType'];
  if (typeof conversationId !== 'string' || conversationId.length === 0) {
    throw new BadRequestError('conversationId is required');
  }
  if (callType !== undefined && callType !== 'audio' && callType !== 'video') {
    throw new BadRequestError('callType must be audio or video');
  }

  return {
    conversationId,
    callType: callType === 'audio' ? 'audio' : 'video',
  };
}

function parseCallSessionPayload(payload: unknown): CallSessionPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid call payload');
  }

  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const callToken = data['callToken'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new BadRequestError('sessionId is required');
  }

  if (typeof callToken !== 'string' || callToken.length === 0) {
    throw new BadRequestError('callToken is required');
  }

  return {
    sessionId,
    callToken,
  };
}

function parseCallRejectPayload(payload: unknown): CallRejectPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid call_reject payload');
  }

  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const reason = data['reason'];
  const callToken = data['callToken'];

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new BadRequestError('sessionId is required');
  }

  if (reason !== undefined && reason !== 'rejected' && reason !== 'busy') {
    throw new BadRequestError('reason must be rejected or busy');
  }

  if (typeof callToken !== 'string' || callToken.length === 0) {
    throw new BadRequestError('callToken is required');
  }

  return {
    sessionId,
    reason: reason as 'rejected' | 'busy' | undefined,
    callToken,
  };
}

function parseCallEndPayload(payload: unknown): CallEndPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid call_end payload');
  }

  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const reason = data['reason'];
  const callToken = data['callToken'];

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new BadRequestError('sessionId is required');
  }

  if (reason !== undefined && (typeof reason !== 'string' || reason.length === 0)) {
    throw new BadRequestError('reason must be a non-empty string');
  }

  if (typeof callToken !== 'string' || callToken.length === 0) {
    throw new BadRequestError('callToken is required');
  }

  return {
    sessionId,
    reason: reason as string | undefined,
    callToken,
  };
}

function parseWebRtcSignalPayload(payload: unknown): WebRtcSignalPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new BadRequestError('Invalid WebRTC payload');
  }

  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const toUserId = data['toUserId'];
  const callToken = data['callToken'];

  if (typeof sessionId !== 'string' || sessionId.length === 0) {
    throw new BadRequestError('sessionId is required');
  }

  if (typeof toUserId !== 'string' || toUserId.length === 0) {
    throw new BadRequestError('toUserId is required');
  }

  if (typeof callToken !== 'string' || callToken.length === 0) {
    throw new BadRequestError('callToken is required');
  }

  return {
    sessionId,
    toUserId,
    callToken,
    sdp: data['sdp'],
    candidate: data['candidate'],
  };
}

async function handleCallInvite(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseCallInvitePayload(payload);
  const session = await CallsService.createOneToOneSession(userId, {
    targetUserId: input.targetUserId,
    conversationId: input.conversationId,
    callType: input.callType,
  });
  const [callerToken, calleeToken] = await Promise.all([
    CallsService.issueSessionTokenForUser(session.sessionId, userId),
    CallsService.issueSessionTokenForUser(session.sessionId, input.targetUserId),
  ]);

  if (!session.reused) {
    registerCallTimeout(session.sessionId, async () => {
      const timeoutSession = await CallsService.markMissedIfNoAnswer(session.sessionId);
      if (!timeoutSession) {
        return;
      }

      await emitCallSummaryMessage(io, {
        sessionId: timeoutSession.sessionId,
        status: 'missed',
        conversationId: timeoutSession.conversationId ?? undefined,
        senderId: timeoutSession.initiatedBy,
        endedReason: timeoutSession.endedReason ?? undefined,
        startedAt: timeoutSession.startedAt ?? undefined,
        endedAt: timeoutSession.endedAt ?? undefined,
      });

      emitCallStatus(io, timeoutSession.participantIds, {
        sessionId: timeoutSession.sessionId,
        status: 'missed',
        reason: timeoutSession.endedReason,
      });
    });
  }

  socket.emit('call_invited', {
    sessionId: session.sessionId,
    conversationId: session.conversationId,
    targetUserId: input.targetUserId,
    callType: session.callType,
    timeoutAt: session.timeoutAt,
    callToken: callerToken.token,
    callTokenExpiresInSeconds: callerToken.expiresInSeconds,
  });

  io.to(`user:${input.targetUserId}`).emit('call_incoming', {
    sessionId: session.sessionId,
    conversationId: session.conversationId,
    fromUserId: userId,
    callType: session.callType,
    timeoutAt: session.timeoutAt,
    callToken: calleeToken.token,
    callTokenExpiresInSeconds: calleeToken.expiresInSeconds,
  });

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: 'ringing',
  });
}

async function handleCallGroupInvite(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseCallGroupInvitePayload(payload);

  const session = await CallsService.createGroupSession(userId, {
    conversationId: input.conversationId,
    callType: input.callType,
  });

  const tokenEntries = await Promise.all(
    session.participantIds.map(async (participantId) => {
      const token = await CallsService.issueSessionTokenForUser(session.sessionId, participantId);
      return [participantId, token] as const;
    }),
  );
  const tokensByUserId = new Map(tokenEntries);

  registerCallTimeout(session.sessionId, async () => {
    const timeoutSession = await CallsService.markMissedIfNoAnswer(session.sessionId);
    if (!timeoutSession) {
      return;
    }

    await emitCallSummaryMessage(io, {
      sessionId: timeoutSession.sessionId,
      status: 'missed',
      conversationId: timeoutSession.conversationId ?? undefined,
      senderId: timeoutSession.initiatedBy,
      endedReason: timeoutSession.endedReason ?? undefined,
      startedAt: timeoutSession.startedAt ?? undefined,
      endedAt: timeoutSession.endedAt ?? undefined,
    });

    emitCallStatus(io, timeoutSession.participantIds, {
      sessionId: timeoutSession.sessionId,
      status: 'missed',
      reason: timeoutSession.endedReason,
    });
  });

  const callerToken = tokensByUserId.get(userId);
  if (!callerToken) {
    throw new BadRequestError('Caller token missing for group call');
  }

  socket.emit('call_invited', {
    sessionId: session.sessionId,
    conversationId: session.conversationId,
    isGroupCall: true,
    participantIds: session.participantIds,
    callType: session.callType,
    timeoutAt: session.timeoutAt,
    callToken: callerToken.token,
    callTokenExpiresInSeconds: callerToken.expiresInSeconds,
  });

  if (!session.reused) {
    for (const participantId of session.participantIds) {
      if (participantId === userId) {
        continue;
      }
      const participantToken = tokensByUserId.get(participantId);
      if (!participantToken) {
        continue;
      }

      io.to(`user:${participantId}`).emit('call_incoming', {
        sessionId: session.sessionId,
        conversationId: session.conversationId,
        fromUserId: userId,
        isGroupCall: true,
        participantIds: session.participantIds,
        callType: session.callType,
        timeoutAt: session.timeoutAt,
        callToken: participantToken.token,
        callTokenExpiresInSeconds: participantToken.expiresInSeconds,
      });
    }
  }

  const joinedParticipantIds = await CallsService.listJoinedParticipantIds(session.sessionId);
  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_joined', {
      sessionId: session.sessionId,
      userId,
      joinedParticipantIds,
    });
  }

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: session.status,
  });
}

async function handleCallAccept(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseCallSessionPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  const session = await CallsService.acceptCallSession(input.sessionId, userId);
  const joinedParticipantIds = await CallsService.listJoinedParticipantIds(session.sessionId);

  clearCallTimeout(session.sessionId);

  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_joined', {
      sessionId: session.sessionId,
      userId,
      joinedParticipantIds,
    });
  }

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: session.status,
  });
}

async function handleCallReject(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseCallRejectPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  const session = await CallsService.rejectCallSession(
    input.sessionId,
    userId,
    input.reason ?? 'rejected',
  );

  const isSessionActive = session.status === 'ringing' || session.status === 'connecting' || session.status === 'connected';
  const isGroupPartialReject = session.mode === 'sfu' && isSessionActive;

  if (!isGroupPartialReject && session.status !== 'ringing') {
    clearCallTimeout(session.sessionId);
  }

  if (isGroupPartialReject) {
    for (const participantId of session.participantIds) {
      io.to(`user:${participantId}`).emit('call_participant_left', {
        sessionId: session.sessionId,
        userId,
        reason: input.reason ?? 'rejected',
      });
    }
    return;
  }

  await emitCallSummaryMessage(io, {
    sessionId: session.sessionId,
    status: 'rejected',
    conversationId: session.conversationId ?? undefined,
    senderId: userId,
    endedReason: session.endedReason ?? undefined,
    startedAt: session.startedAt ?? undefined,
    endedAt: session.endedAt ?? undefined,
  });

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: 'rejected',
    reason: session.endedReason,
  });
}

async function handleCallEnd(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseCallEndPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  const session = await CallsService.endCallSession(input.sessionId, userId, input.reason);

  const isSessionActive = session.status === 'ringing' || session.status === 'connecting' || session.status === 'connected';
  const isGroupPartialLeave = session.mode === 'sfu' && isSessionActive;

  if (!isGroupPartialLeave && session.status !== 'ringing') {
    clearCallTimeout(session.sessionId);
  }

  if (isGroupPartialLeave) {
    for (const participantId of session.participantIds) {
      io.to(`user:${participantId}`).emit('call_participant_left', {
        sessionId: session.sessionId,
        userId,
        reason: input.reason ?? 'left',
      });
    }
    return;
  }

  await emitCallSummaryMessage(io, {
    sessionId: session.sessionId,
    status: 'ended',
    conversationId: session.conversationId ?? undefined,
    senderId: userId,
    endedReason: session.endedReason ?? undefined,
    startedAt: session.startedAt ?? undefined,
    endedAt: session.endedAt ?? undefined,
  });

  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_left', {
      sessionId: session.sessionId,
      userId,
      reason: session.endedReason,
    });
  }

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: 'ended',
    reason: session.endedReason,
  });
}

function formatCallDuration(durationSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(durationSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;

  if (minutes <= 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

async function emitCallSummaryMessage(
  io: Server,
  params: {
    sessionId: string;
    status: 'ended' | 'rejected' | 'missed';
    conversationId?: string;
    senderId: string;
    endedReason?: string;
    startedAt?: string;
    endedAt?: string;
  },
): Promise<void> {
  if (!params.conversationId) {
    return;
  }

  let content = 'Cuoc goi da ket thuc';
  if (params.status === 'rejected') {
    content = params.endedReason === 'busy'
      ? 'Cuoc goi bi tu choi (ban)'
      : 'Cuoc goi bi tu choi';
  }

  if (params.status === 'missed') {
    content = 'Cuoc goi nho';
  }

  const startedAt = params.startedAt ? new Date(params.startedAt) : null;
  const endedAt = params.endedAt ? new Date(params.endedAt) : null;

  if (
    params.status === 'ended'
    && startedAt
    && endedAt
    && !Number.isNaN(startedAt.getTime())
    && !Number.isNaN(endedAt.getTime())
  ) {
    const durationSeconds = (endedAt.getTime() - startedAt.getTime()) / 1000;
    if (durationSeconds > 0) {
      content = `${content} (${formatCallDuration(durationSeconds)})`;
    }
  }

  if (params.endedReason && params.endedReason.trim().length > 0 && params.endedReason !== 'ended') {
    content = `${content} - Ly do: ${params.endedReason}`;
  }

  const idempotencyKey = `call-summary:${params.sessionId}:${params.status}`;
  const message = await MessagesService.createMessage(
    params.conversationId,
    params.senderId,
    content,
    'text',
    idempotencyKey,
  );

  io.to(`conv:${params.conversationId}`).emit('receive_message', {
    messageId: message._id,
    conversationId: params.conversationId,
    senderId: params.senderId,
    content,
    type: 'text',
    idempotencyKey,
    createdAt: message.createdAt,
  });

  io.to(`conv:${params.conversationId}`).emit('status_update', {
    conversationId: params.conversationId,
    messageId: message._id,
    status: 'sent',
    userId: params.senderId,
  });
}

async function handleWebRtcOffer(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);

  if (!input.sdp) {
    throw new BadRequestError('sdp is required for webrtc_offer');
  }

  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  const sessionStatus = await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  if (sessionStatus === 'connected') {
    recordReconnectOfferAttempt();
  }
  io.to(`user:${input.toUserId}`).emit('webrtc_offer', {
    sessionId: input.sessionId,
    fromUserId: userId,
    sdp: input.sdp,
  });
}

async function handleWebRtcAnswer(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);

  if (!input.sdp) {
    throw new BadRequestError('sdp is required for webrtc_answer');
  }

  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  const session = await CallsService.markSessionConnected(input.sessionId, userId);
  clearCallTimeout(session.sessionId);

  io.to(`user:${input.toUserId}`).emit('webrtc_answer', {
    sessionId: input.sessionId,
    fromUserId: userId,
    sdp: input.sdp,
  });

  emitCallStatus(io, session.participantIds, {
    sessionId: session.sessionId,
    status: session.status,
  });
}

async function handleWebRtcIceCandidate(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);

  if (!input.candidate) {
    throw new BadRequestError('candidate is required for webrtc_ice_candidate');
  }

  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  io.to(`user:${input.toUserId}`).emit('webrtc_ice_candidate', {
    sessionId: input.sessionId,
    fromUserId: userId,
    candidate: input.candidate,
  });
}

async function handleSendMessage(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;

  // ─── Rate Limit Check ───
  const isWithinLimit = await checkMessageRateLimit(userId, kafkaFailureMode);
  if (!isWithinLimit) {
    const limitMsg = kafkaFailureMode
      ? 'Rate limit exceeded: max 200 messages/500ms (fallback mode)'
      : 'Rate limit exceeded: max 300 messages/500ms';
    socket.emit('error', { message: limitMsg });
    return;
  }

  // ─── Validate Payload ───
  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const msg = payload as Record<string, unknown>;
  let {
    conversationId,
    content,
    type,
    mediaUrl,
    idempotencyKey,
    replyToMessageRef,
    replyToMessageId,
    replyToPreview,
    replyToSenderId,
    replyToSenderDisplayName,
    replyToType,
  } = msg;

  if (!conversationId || !idempotencyKey) {
    socket.emit('error', { message: 'Missing required fields: conversationId, idempotencyKey' });
    return;
  }

  // Allow empty content if mediaUrl is provided, otherwise content is required
  if (!content && !mediaUrl) {
    socket.emit('error', { message: 'Either content or mediaUrl must be provided' });
    return;
  }

  // Validate content if provided
  if (content && (typeof content !== 'string' || content.length > 1000)) {
    socket.emit('error', { message: 'Content must be 1-1000 characters' });
    return;
  }

  const isValidMessageType = (type: string): boolean => {
    return ['text', 'image', 'video', 'audio', 'sticker'].includes(type) || type.startsWith('file/');
  };
  const normalizedType = typeof type === 'string' ? type : 'text';
  if (!isValidMessageType(normalizedType)) {
    socket.emit('error', { message: 'Invalid message type' });
    return;
  }

  const normalizedReplyMessageRef = typeof replyToMessageRef === 'string'
    ? replyToMessageRef.trim()
    : '';
  const normalizedReplyMessageId = typeof replyToMessageId === 'string'
    ? replyToMessageId.trim()
    : '';

  if (normalizedReplyMessageRef.length > 0 && normalizedReplyMessageRef.length > 100) {
    socket.emit('error', { message: 'replyToMessageRef is too long' });
    return;
  }

  if (normalizedReplyMessageId.length > 0 && normalizedReplyMessageId.length > 100) {
    socket.emit('error', { message: 'replyToMessageId is too long' });
    return;
  }

  const normalizedReplyToPreview = typeof replyToPreview === 'string'
    ? replyToPreview.trim().slice(0, 160)
    : undefined;

  const normalizedReplyToSenderId = typeof replyToSenderId === 'string'
    ? replyToSenderId.trim()
    : undefined;

  const normalizedReplyToSenderDisplayName = typeof replyToSenderDisplayName === 'string'
    ? replyToSenderDisplayName.trim().slice(0, 120)
    : undefined;

  const normalizedReplyToType = typeof replyToType === 'string'
    ? replyToType.trim().slice(0, 24)
    : undefined;

  let resolvedReplyTo: {
    messageRef: string;
    messageId?: string;
    senderId?: string;
    senderDisplayName?: string;
    contentPreview?: string;
    type?: string;
    isDeleted?: boolean;
  } | undefined;

  const requestedReplyRef = normalizedReplyMessageRef.length > 0
    ? normalizedReplyMessageRef
    : normalizedReplyMessageId;

  if (requestedReplyRef.length > 0) {
    const replyMessageFilters: Array<Record<string, unknown>> = [
      { idempotencyKey: requestedReplyRef },
    ];
    if (Types.ObjectId.isValid(requestedReplyRef)) {
      replyMessageFilters.push({ _id: requestedReplyRef });
    }

    const repliedMessage = await MessageModel.findOne({
      $or: replyMessageFilters,
      conversationId: conversationId as string,
    }).select('_id idempotencyKey senderId content type').lean();

    let resolvedReplySenderDisplayName: string | undefined = normalizedReplyToSenderDisplayName;
    if (repliedMessage?.senderId) {
      try {
        const replySender = await UserModel.findOne({ _id: repliedMessage.senderId }).select('displayName').lean();
        if (typeof replySender?.displayName === 'string' && replySender.displayName.trim().length > 0) {
          resolvedReplySenderDisplayName = replySender.displayName.trim();
        }
      } catch (lookupErr) {
        logger.warn('[Gateway] Failed to resolve reply sender displayName', {
          senderId: repliedMessage.senderId,
          error: lookupErr instanceof Error ? lookupErr.message : String(lookupErr),
        });
      }
    }

    resolvedReplyTo = {
      messageRef: repliedMessage?.idempotencyKey || requestedReplyRef,
      messageId: repliedMessage?._id ? String(repliedMessage._id) : (normalizedReplyMessageId || undefined),
      senderId: repliedMessage?.senderId || normalizedReplyToSenderId,
      senderDisplayName: resolvedReplySenderDisplayName,
      contentPreview: repliedMessage?.content
        ? String(repliedMessage.content).slice(0, 160)
        : normalizedReplyToPreview,
      type: repliedMessage?.type || normalizedReplyToType,
      isDeleted: false,
    };
  }

  const membership = await ConversationMemberModel.findOne({
    conversationId: conversationId as string,
    userId,
  }).select('_id');

  if (!membership) {
    socket.emit('error', { message: 'Not allowed to send message in this conversation' });
    return;
  }

  // Resolve sender profile for broadcast
  const senderProfile = await UserModel.findById(userId).select('displayName avatarUrl').lean();

  // Ensure sender has joined this conversation room for self-receive status events.
  await socket.join(`conv:${conversationId as string}`);

  // ─── Sticker URL Validation ───
  if (normalizedType === 'sticker') {
    if (!mediaUrl || typeof mediaUrl !== 'string') {
      socket.emit('error', { message: 'Sticker mediaUrl is required' });
      return;
    }
    if (!stickerService.validateStickerUrl(mediaUrl)) {
      socket.emit('error', { message: 'Invalid sticker URL' });
      return;
    }
    // Clear content for sticker messages
    content = '';
  }

  // ─── Create Message via Service ───
  try {
    const message = await MessagesService.createMessage(
      conversationId as string,
      userId,
      typeof content === 'string' ? content : '',
      normalizedType as MessageType,
      (idempotencyKey as string),
      mediaUrl ? (mediaUrl as string) : undefined,
      resolvedReplyTo,
    );

    // Note: createMessage already publishes to Kafka (worker will insert)
    // Message object here is a mock with temporary ID until Kafka worker inserts real DB

    // ─── Emit to Recipients (NOT to sender - they already have optimistic update) ───
    socket.to(`conv:${conversationId}`).emit('receive_message', {
      messageId: message._id,
      conversationId,
      senderId: userId,
      content: typeof content === 'string' ? content : '',
      type: normalizedType,
      mediaUrl,
      replyTo: message.replyTo,
      idempotencyKey,
      createdAt: message.createdAt,
    });

    // ─── Emit Status Update to ALL (including sender) ───
    io.to(`conv:${conversationId}`).emit('status_update', {
      conversationId,
      messageId: message._id,
      status: 'sent',
      userId,
    });

    // ─── Confirm to Sender (replace optimistic message ID) ───
    socket.emit('message_sent', {
      messageId: message._id,
      idempotencyKey,
      createdAt: message.createdAt,
    });

    logger.debug(`Message created: ${message._id} in conversation ${conversationId}`);

    // F1: Produce notification for offline conversation members
    void (async () => {
      try {
        const members = await ConversationMemberModel.find({
          conversationId: conversationId as string,
        }).lean();

        const sender = await UserModel.findById(userId).select('displayName').lean();
        const senderName = (sender?.displayName as string) ?? 'Someone';
        const conversation = await ConversationModel.findById(conversationId as string).select('name type').lean();
        const conversationName = typeof conversation?.name === 'string' && conversation.name.trim().length > 0
          ? conversation.name.trim()
          : senderName;
        const rawText = typeof content === 'string' ? content.trim() : '';
        const preview = rawText.length > 0
          ? rawText.slice(0, 100)
          : (normalizedType === 'text' ? 'Ban co tin nhan moi' : `[${normalizedType}]`);

        for (const member of members) {
          if (member.userId === userId) continue;

          await produceNotificationEvent({
            userId: member.userId,
            type: 'new_message',
            title: `Tin nhắn mới từ ${senderName}`,
            body: preview,
            conversationId: conversationId as string,
            fromUserId: userId,
            data: { conversationId: conversationId as string, conversationName, action: 'open_chat' },
          });
        }
      } catch (notifErr) {
        logger.error('Failed to produce message notifications', notifErr);
      }
    })();
  } catch (err) {
    logger.error('Failed to create message', err);
    throw err;
  }
}

async function handleMessageRead(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;

  // ─── Validate Payload ───
  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const data = payload as Record<string, unknown>;
  const { conversationId, messageIds } = data;

  if (!conversationId || !messageIds || !Array.isArray(messageIds)) {
    socket.emit('error', { message: 'Missing required fields: conversationId, messageIds (array)' });
    return;
  }

  if (messageIds.length === 0) {
    socket.emit('error', { message: 'messageIds cannot be empty' });
    return;
  }

  const membership = await ConversationMemberModel.exists({
    conversationId: conversationId as string,
    userId,
  });

  if (!membership) {
    socket.emit('error', { message: 'Not allowed to update read status in this conversation' });
    return;
  }

  await socket.join(`conv:${conversationId as string}`);

  // ─── Batch Update Message Status ───
  try {
    const refs = messageIds.map((value) => String(value));

    for (const messageId of messageIds) {
      await MessagesService.markAsRead(messageId as string, userId);
    }

    await MessagesService.refreshReadByPreviewForReadEvents(conversationId as string, refs);

    const readerProfile = await UserModel.findById(userId).select('displayName avatarUrl').lean();
    const readAt = new Date();

    // ─── Simply emit read status back to sender ───
    // Note: We don't query MongoDB for aggregation here because it's async
    // and may not reflect the just-updated status. Frontend will fetch latest via API.
    io.to(`conv:${conversationId}`).emit('status_update', {
      conversationId,
      messageIds: refs,
      status: 'read',
      userId,
      updatedAt: readAt,
      reader: {
        userId,
        displayName: readerProfile?.displayName || 'Nguoi dung',
        avatarUrl: readerProfile?.avatarUrl,
        readAt,
      },
    });

    logger.debug(`Marked ${messageIds.length} messages as read by ${userId}`);
  } catch (err) {
    logger.error('Failed to mark messages as read', err);
    throw err;
  }
}

async function handleMessageDelivered(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const { userId } = socket;

  // ─── Validate Payload ───
  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const data = payload as Record<string, unknown>;
  const { conversationId, messageIds } = data;

  if (!conversationId || !messageIds || !Array.isArray(messageIds)) {
    socket.emit('error', { message: 'Missing required fields: conversationId, messageIds (array)' });
    return;
  }

  if (messageIds.length === 0) {
    socket.emit('error', { message: 'messageIds cannot be empty' });
    return;
  }

  const membership = await ConversationMemberModel.exists({
    conversationId: conversationId as string,
    userId,
  });

  if (!membership) {
    socket.emit('error', { message: 'Not allowed to update delivery status in this conversation' });
    return;
  }

  await socket.join(`conv:${conversationId as string}`);

  // ─── Batch Update Message Status to 'delivered' ───
  try {
    for (const messageId of messageIds) {
      await MessagesService.updateMessageStatus(messageId as string, userId, 'delivered');
    }

    // ─── Simply emit delivered status to conversation group ───
    // Note: We don't query MongoDB for aggregation here because it's async
    // and may not reflect the just-updated status. Frontend will fetch latest via API.
    io.to(`conv:${conversationId}`).emit('status_update', {
      conversationId,
      messageIds,
      status: 'delivered',
      userId,
      updatedAt: new Date(),
    });

    logger.debug(`Marked ${messageIds.length} messages as delivered by ${userId}`);
  } catch (err) {
    logger.error('Failed to mark messages as delivered', err);
    throw err;
  }
}

async function handleDeleteMessageForMe(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const userId = socket.userId;

  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const { messageId, idempotencyKey, conversationId } = payload as {
    messageId?: string;
    idempotencyKey?: string;
    conversationId?: string;
  };

  if (!messageId || !idempotencyKey || !conversationId) {
    socket.emit('error', { message: 'Missing messageId or conversationId' });
    return;
  }

  // ✅ USE .then() INSTEAD OF await
  MessagesService.deleteMessageForMeWithConversationSync(idempotencyKey, userId)
    .then(({ message, effectiveLastMessage, unreadCount, lastVisibleMessage }) => {
      // Notify only this user (only they see the change)
      socket.emit('message_deleted_for_me', {
        messageId: messageId,
        conversationId,
        deletedAt: new Date().toISOString(),
        effectiveLastMessage: effectiveLastMessage || null,
        unreadCount,
        lastVisibleMessage: lastVisibleMessage || null,
      });

      logger.debug(`Message ${messageId} deleted for me by user ${userId}`);
    })
    .catch((err) => {
      logger.error('handleDeleteMessageForMe error', err);
      socket.emit('error', { message: (err as Error).message });
    });
}

async function handleRecallMessage(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const userId = socket.userId;

  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const { messageId, idempotencyKey, conversationId } = payload as {
    messageId?: string;
    idempotencyKey?: string;
    conversationId?: string;
  };

  if (!messageId || !idempotencyKey || !conversationId) {
    socket.emit('error', { message: 'Missing messageId or conversationId' });
    return;
  }

  // ✅ USE .then() INSTEAD OF await
  MessagesService.recallMessageWithConversationSync(idempotencyKey, userId)
    .then(({ message, conversationLastMessage }) => {
      // Broadcast to EVERYONE in conversation (sender + all recipients)
      io.to(`conv:${conversationId}`).emit('message_recalled', {
        messageId: messageId,
        idempotencyKey: idempotencyKey,
        conversationId,
        recalledBy: userId,
        recalledAt: new Date().toISOString(),
        conversationLastMessage: conversationLastMessage || null,
      });

      logger.info(`Message ${messageId} recalled by user ${userId}`);
    })
    .catch((err) => {
      logger.error('handleRecallMessage error', err);
      socket.emit('error', { message: (err as Error).message });
    });
}

async function handleForwardMessage(
  io: Server,
  socket: AuthSocket,
  payload: unknown,
): Promise<void> {
  const userId = socket.userId;

  if (typeof payload !== 'object' || payload === null) {
    socket.emit('error', { message: 'Invalid payload' });
    return;
  }

  const { originalMessageId, toConversationId, idempotencyKey } = payload as {
    originalMessageId?: string;
    toConversationId?: string;
    idempotencyKey?: string;
  };

  if (!originalMessageId || !toConversationId || !idempotencyKey) {
    socket.emit('error', { message: 'Missing required fields' });
    return;
  }

  // ✅ USE .then() INSTEAD OF await
  MessagesService.forwardMessage(originalMessageId, toConversationId, userId, idempotencyKey)
    .then((newMessage) => {
      // Broadcast to target conversation
      io.to(`conv:${toConversationId}`).emit('receive_message', {
        messageId: newMessage._id,
        conversationId: toConversationId,
        senderId: userId,
        content: newMessage.content,
        type: newMessage.type,
        mediaUrl: newMessage.mediaUrl,
        status: 'sent',
        createdAt: newMessage.createdAt,
        idempotencyKey: newMessage.idempotencyKey,
      });

      // Confirm to sender
      socket.emit('message_forwarded', {
        messageId: newMessage._id,
        idempotencyKey,
        toConversationId,
      });

      logger.info(`Message ${originalMessageId} forwarded to ${toConversationId} by user ${userId}`);
    })
    .catch((err) => {
      logger.error('handleForwardMessage error', err);
      socket.emit('error', { message: (err as Error).message });
    });
}
