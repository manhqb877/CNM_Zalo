import { type Server, type Socket } from 'socket.io';
import { CallsService } from '../modules/calls/calls.service';
import { MessagesService } from '../modules/messages/messages.service';
import { UserModel } from '../modules/users/user.model';
import { ConversationModel } from '../modules/conversations/conversation.model';
import { AppError, BadRequestError } from '../shared/errors';
import { recordReconnectOfferAttempt } from '../modules/calls/calls.metrics';
import { logger } from '../shared/logger';

interface AuthSocket extends Socket {
  userId: string;
}

function emitSocketError(socket: Socket, error: unknown, fallbackMessage: string): void {
  socket.emit('error', {
    message: error instanceof Error ? error.message : fallbackMessage,
    code: error instanceof AppError ? error.code : undefined,
  });
}

function logSocketError(eventName: string, error: unknown): void {
  if (error instanceof AppError && error.statusCode < 500) {
    logger.warn(`${eventName} rejected`, {
      message: error.message,
      code: error.code,
      statusCode: error.statusCode,
    });
    return;
  }

  logger.error(`${eventName} error`, error);
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

interface CallNotificationMeta {
  callerName?: string;
  callerAvatarUrl?: string;
  conversationName?: string;
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

interface CallMediaStatePayload {
  sessionId: string;
  callToken: string;
  isScreenSharing?: boolean;
  isMicMuted?: boolean;
  isCameraOff?: boolean;
}

const callTimeoutRegistry = new Map<string, NodeJS.Timeout>();

function registerCallTimeout(sessionId: string, task: () => Promise<void>, timeoutMs?: number): void {
  clearCallTimeout(sessionId);
  const configuredMs = Number.parseInt(process.env['CALL_RING_TIMEOUT_MS'] ?? '30000', 10);
  const resolvedMs = Number.isNaN(configuredMs) || configuredMs < 1000 ? 30_000 : configuredMs;
  const finalMs = timeoutMs ?? resolvedMs;

  const timeout = setTimeout(() => {
    callTimeoutRegistry.delete(sessionId);
    void task().catch((err) => logger.error('call timeout handler error', err));
  }, finalMs);

  callTimeoutRegistry.set(sessionId, timeout);
}

export function clearCallTimeout(sessionId: string): void {
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

function buildConversationActiveCallPayload(session: {
  sessionId: string;
  conversationId: string | null;
  callType: 'audio' | 'video';
  status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
  startedAt: string | null;
  initiatedBy: string;
  participantIds: string[];
}): {
  conversationId: string;
  activeCall: null | {
    callSessionId: string;
    type: 'audio' | 'video';
    status: 'ringing' | 'connecting' | 'connected';
    startedAt: string | null;
    initiatedBy: string;
  };
} | null {
  if (!session.conversationId) {
    return null;
  }

  const isActive = session.status === 'ringing' || session.status === 'connecting' || session.status === 'connected';
  if (!isActive) {
    return {
      conversationId: session.conversationId,
      activeCall: null,
    };
  }

  const activeStatus = session.status as 'ringing' | 'connecting' | 'connected';
  return {
    conversationId: session.conversationId,
    activeCall: {
      callSessionId: session.sessionId,
      type: session.callType,
      status: activeStatus,
      startedAt: session.startedAt,
      initiatedBy: session.initiatedBy,
    },
  };
}

function emitConversationActiveCallUpdate(
  io: Server,
  session: {
    sessionId: string;
    conversationId: string | null;
    callType: 'audio' | 'video';
    status: 'ringing' | 'connecting' | 'connected' | 'ended' | 'missed' | 'rejected';
    startedAt: string | null;
    initiatedBy: string;
    participantIds: string[];
  },
): void {
  const payload = buildConversationActiveCallPayload(session);
  if (!payload) {
    return;
  }

  io.to(`conv:${payload.conversationId}`).emit('conversation_active_call_updated', payload);
  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('conversation_active_call_updated', payload);
  }
}

function resolveCallHistoryStatus(
  status: 'ended' | 'rejected' | 'missed',
  endedReason?: string | null,
): 'ended' | 'rejected' | 'missed' | 'cancelled' {
  const normalizedReason = (endedReason ?? '').trim().toLowerCase();
  if (status === 'ended' && (normalizedReason === 'cancelled' || normalizedReason === 'canceled')) {
    return 'cancelled';
  }
  return status;
}

async function emitCallHistoryMessage(
  io: Server,
  params: {
    sessionId: string;
    status: 'ended' | 'rejected' | 'missed';
    conversationId?: string;
    callerId: string;
    participantIds: string[];
    callType: 'audio' | 'video';
    endedReason?: string;
    startedAt?: string;
    endedAt?: string;
    createdAt?: string;
    durationSeconds?: number | null;
  },
): Promise<void> {
  if (!params.conversationId) return;

  const startedAt = params.startedAt ?? params.createdAt ?? params.endedAt;
  const startedAtDate = startedAt ? new Date(startedAt) : undefined;
  const endedAtDate = params.endedAt ? new Date(params.endedAt) : undefined;
  const calculatedDurationSeconds = startedAtDate && endedAtDate
    ? Math.max(0, Math.floor((endedAtDate.getTime() - startedAtDate.getTime()) / 1000))
    : 0;
  const callHistory = {
    callSessionId: params.sessionId,
    callType: params.callType,
    status: resolveCallHistoryStatus(params.status, params.endedReason),
    startedAt: startedAtDate,
    endedAt: endedAtDate,
    durationSeconds: params.durationSeconds ?? calculatedDurationSeconds,
    callerId: params.callerId,
    participantIds: params.participantIds,
  };
  const message = await MessagesService.createCallHistoryMessage(params.conversationId, callHistory);

  io.to(`conv:${params.conversationId}`).emit('receive_message', {
    messageId: message._id,
    conversationId: params.conversationId,
    senderId: message.senderId,
    content: message.content,
    type: message.type,
    callHistory: message.callHistory,
    idempotencyKey: message.idempotencyKey,
    createdAt: message.createdAt,
  });

  io.to(`conv:${params.conversationId}`).emit('status_update', {
    conversationId: params.conversationId,
    messageId: message._id,
    status: 'sent',
    userId: message.senderId,
  });
}

async function loadCallNotificationMeta(userId: string, conversationId?: string | null): Promise<CallNotificationMeta> {
  const [caller, conversation] = await Promise.all([
    UserModel.findById(userId).select('displayName avatarUrl').lean(),
    conversationId
      ? ConversationModel.findById(conversationId).select('name type avatarUrl').lean()
      : Promise.resolve(null),
  ]);

  return {
    callerName: typeof caller?.displayName === 'string' ? caller.displayName : undefined,
    callerAvatarUrl: typeof caller?.avatarUrl === 'string' ? caller.avatarUrl : undefined,
    conversationName: typeof conversation?.name === 'string' ? conversation.name : undefined,
  };
}

// ─── Payload Parsers ─────────────────────────────────────────────────────────

function parseCallInvitePayload(payload: unknown): CallInvitePayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call_invite payload');
  const data = payload as Record<string, unknown>;
  const targetUserId = data['targetUserId'];
  const conversationId = data['conversationId'];
  const callType = data['callType'];
  if (typeof targetUserId !== 'string' || targetUserId.length === 0) throw new BadRequestError('targetUserId is required');
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
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call_group_invite payload');
  const data = payload as Record<string, unknown>;
  const conversationId = data['conversationId'];
  const callType = data['callType'];
  if (typeof conversationId !== 'string' || conversationId.length === 0) throw new BadRequestError('conversationId is required');
  if (callType !== undefined && callType !== 'audio' && callType !== 'video') {
    throw new BadRequestError('callType must be audio or video');
  }
  return { conversationId, callType: callType === 'audio' ? 'audio' : 'video' };
}

function parseCallSessionPayload(payload: unknown): CallSessionPayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call payload');
  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const callToken = data['callToken'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new BadRequestError('sessionId is required');
  if (typeof callToken !== 'string' || callToken.length === 0) throw new BadRequestError('callToken is required');
  return { sessionId, callToken };
}

function parseCallRejectPayload(payload: unknown): CallRejectPayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call_reject payload');
  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const reason = data['reason'];
  const callToken = data['callToken'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new BadRequestError('sessionId is required');
  if (reason !== undefined && reason !== 'rejected' && reason !== 'busy') throw new BadRequestError('reason must be rejected or busy');
  if (typeof callToken !== 'string' || callToken.length === 0) throw new BadRequestError('callToken is required');
  return { sessionId, reason: reason as 'rejected' | 'busy' | undefined, callToken };
}

function parseCallEndPayload(payload: unknown): CallEndPayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call_end payload');
  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const reason = data['reason'];
  const callToken = data['callToken'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new BadRequestError('sessionId is required');
  if (reason !== undefined && (typeof reason !== 'string' || reason.length === 0)) throw new BadRequestError('reason must be a non-empty string');
  if (typeof callToken !== 'string' || callToken.length === 0) throw new BadRequestError('callToken is required');
  return { sessionId, reason: reason as string | undefined, callToken };
}

function parseWebRtcSignalPayload(payload: unknown): WebRtcSignalPayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid WebRTC payload');
  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const toUserId = data['toUserId'];
  const callToken = data['callToken'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new BadRequestError('sessionId is required');
  if (typeof toUserId !== 'string' || toUserId.length === 0) throw new BadRequestError('toUserId is required');
  if (typeof callToken !== 'string' || callToken.length === 0) throw new BadRequestError('callToken is required');
  return { sessionId, toUserId, callToken, sdp: data['sdp'], candidate: data['candidate'] };
}

function parseCallMediaStatePayload(payload: unknown): CallMediaStatePayload {
  if (typeof payload !== 'object' || payload === null) throw new BadRequestError('Invalid call_media_state payload');
  const data = payload as Record<string, unknown>;
  const sessionId = data['sessionId'];
  const callToken = data['callToken'];
  const isScreenSharing = data['isScreenSharing'];
  const isMicMuted = data['isMicMuted'];
  const isCameraOff = data['isCameraOff'];
  
  if (typeof sessionId !== 'string' || sessionId.length === 0) throw new BadRequestError('sessionId is required');
  if (typeof callToken !== 'string' || callToken.length === 0) throw new BadRequestError('callToken is required');
  if (isScreenSharing !== undefined && typeof isScreenSharing !== 'boolean') {
    throw new BadRequestError('isScreenSharing must be boolean');
  }
  if (isMicMuted !== undefined && typeof isMicMuted !== 'boolean') {
    throw new BadRequestError('isMicMuted must be boolean');
  }
  if (isCameraOff !== undefined && typeof isCameraOff !== 'boolean') {
    throw new BadRequestError('isCameraOff must be boolean');
  }
  
  return { sessionId, callToken, isScreenSharing, isMicMuted, isCameraOff };
}

function isInactiveCallSignalError(error: unknown): boolean {
  return error instanceof BadRequestError && error.message === 'Call session is no longer active';
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

async function handleCallInvite(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
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
  const meta = await loadCallNotificationMeta(userId, session.conversationId);

  if (!session.reused) {
    registerCallTimeout(session.sessionId, async () => {
      const timeoutSession = await CallsService.markMissedIfNoAnswer(session.sessionId);
      if (!timeoutSession) return;
      await emitCallHistoryMessage(io, {
        sessionId: timeoutSession.sessionId,
        status: 'missed',
        conversationId: timeoutSession.conversationId ?? undefined,
        callerId: timeoutSession.initiatedBy,
        participantIds: timeoutSession.participantIds,
        callType: timeoutSession.callType,
        endedReason: timeoutSession.endedReason ?? undefined,
        startedAt: timeoutSession.startedAt ?? undefined,
        endedAt: timeoutSession.endedAt ?? undefined,
        createdAt: timeoutSession.createdAt,
        durationSeconds: timeoutSession.durationSeconds,
      });
      emitCallStatus(io, timeoutSession.participantIds, { sessionId: timeoutSession.sessionId, status: 'missed', reason: timeoutSession.endedReason });
      emitConversationActiveCallUpdate(io, timeoutSession);
    });
  }

  socket.emit('call_invited', {
    sessionId: session.sessionId,
    conversationId: session.conversationId,
    targetUserId: input.targetUserId,
    isGroupCall: false,
    participantIds: session.participantIds,
    callType: session.callType,
    timeoutAt: session.timeoutAt,
    callToken: callerToken.token,
    callTokenExpiresInSeconds: callerToken.expiresInSeconds,
  });

  const targetParticipant = session.participants.find((participant) => participant.userId === input.targetUserId);
  if (!session.reused || targetParticipant?.status !== 'joined') {
    io.to(`user:${input.targetUserId}`).emit('call_incoming', {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      fromUserId: userId,
      callerName: meta.callerName,
      callerAvatarUrl: meta.callerAvatarUrl,
      conversationName: meta.conversationName,
      isGroupCall: false,
      participantIds: session.participantIds,
      callType: session.callType,
      timeoutAt: session.timeoutAt,
      callToken: calleeToken.token,
      callTokenExpiresInSeconds: calleeToken.expiresInSeconds,
    });
  }

  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: 'ringing' });
}

async function handleCallGroupInvite(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseCallGroupInvitePayload(payload);
  const session = await CallsService.createGroupSession(userId, { conversationId: input.conversationId, callType: input.callType });

  const tokenEntries = await Promise.all(
    session.participantIds.map(async (participantId) => {
      const token = await CallsService.issueSessionTokenForUser(session.sessionId, participantId);
      return [participantId, token] as const;
    }),
  );
  const tokensByUserId = new Map(tokenEntries);

  if (!session.reused) {
    registerCallTimeout(session.sessionId, async () => {
      const timeoutSession = await CallsService.markMissedIfNoAnswer(session.sessionId);
      if (!timeoutSession) return;
      await emitCallHistoryMessage(io, {
        sessionId: timeoutSession.sessionId,
        status: 'missed',
        conversationId: timeoutSession.conversationId ?? undefined,
        callerId: timeoutSession.initiatedBy,
        participantIds: timeoutSession.participantIds,
        callType: timeoutSession.callType,
        endedReason: timeoutSession.endedReason ?? undefined,
        startedAt: timeoutSession.startedAt ?? undefined,
        endedAt: timeoutSession.endedAt ?? undefined,
        createdAt: timeoutSession.createdAt,
        durationSeconds: timeoutSession.durationSeconds,
      });
      emitCallStatus(io, timeoutSession.participantIds, { sessionId: timeoutSession.sessionId, status: 'missed', reason: timeoutSession.endedReason });
      emitConversationActiveCallUpdate(io, timeoutSession);
    });
  }

  const callerToken = tokensByUserId.get(userId);
  if (!callerToken) throw new BadRequestError('Caller token missing for group call');
  const meta = await loadCallNotificationMeta(userId, session.conversationId);

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

  for (const participantId of session.participantIds) {
    if (participantId === userId) continue;
    const participant = session.participants.find((item) => item.userId === participantId);
    if (session.reused && participant?.status === 'joined') continue;
    const participantToken = tokensByUserId.get(participantId);
    if (!participantToken) continue;
    io.to(`user:${participantId}`).emit('call_incoming', {
      sessionId: session.sessionId,
      conversationId: session.conversationId,
      fromUserId: userId,
      callerName: meta.callerName,
      callerAvatarUrl: meta.callerAvatarUrl,
      conversationName: meta.conversationName,
      isGroupCall: true,
      participantIds: session.participantIds,
      callType: session.callType,
      timeoutAt: session.timeoutAt,
      callToken: participantToken.token,
      callTokenExpiresInSeconds: participantToken.expiresInSeconds,
    });
  }

  const joinedParticipantIds = await CallsService.listJoinedParticipantIds(session.sessionId);
  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_joined', {
      sessionId: session.sessionId,
      userId,
      joinedParticipantIds,
    });
  }

  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: session.status });
  emitConversationActiveCallUpdate(io, session);
}

async function handleCallAccept(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseCallSessionPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  const session = await CallsService.acceptCallSession(input.sessionId, userId);
  const joinedParticipantIds = await CallsService.listJoinedParticipantIds(session.sessionId);
  clearCallTimeout(session.sessionId);
  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_joined', { sessionId: session.sessionId, userId, joinedParticipantIds });
  }
  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: session.status });
  emitConversationActiveCallUpdate(io, session);
}

async function handleCallReject(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseCallRejectPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken);
  const session = await CallsService.rejectCallSession(input.sessionId, userId, input.reason ?? 'rejected');

  const isSessionActive = session.status === 'ringing' || session.status === 'connecting' || session.status === 'connected';
  const isGroupPartialReject = session.mode === 'sfu' && isSessionActive;

  if (!isGroupPartialReject && session.status !== 'ringing') clearCallTimeout(session.sessionId);

  if (isGroupPartialReject) {
    for (const participantId of session.participantIds) {
      io.to(`user:${participantId}`).emit('call_participant_left', { sessionId: session.sessionId, userId, reason: input.reason ?? 'rejected' });
    }
    emitConversationActiveCallUpdate(io, session);
    return;
  }

  await emitCallHistoryMessage(io, {
    sessionId: session.sessionId, status: 'rejected',
    conversationId: session.conversationId ?? undefined,
    callerId: session.initiatedBy,
    participantIds: session.participantIds,
    callType: session.callType,
    endedReason: session.endedReason ?? undefined,
    startedAt: session.startedAt ?? undefined, endedAt: session.endedAt ?? undefined,
    createdAt: session.createdAt,
    durationSeconds: session.durationSeconds,
  });

  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: 'rejected', reason: session.endedReason });
  emitConversationActiveCallUpdate(io, session);
}

async function handleCallEnd(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseCallEndPayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  const session = await CallsService.endCallSession(input.sessionId, userId, input.reason);

  const isSessionActive = session.status === 'ringing' || session.status === 'connecting' || session.status === 'connected';
  const isGroupPartialLeave = session.mode === 'sfu' && isSessionActive;

  if (!isGroupPartialLeave && session.status !== 'ringing') clearCallTimeout(session.sessionId);

  if (isGroupPartialLeave) {
    for (const participantId of session.participantIds) {
      io.to(`user:${participantId}`).emit('call_participant_left', { sessionId: session.sessionId, userId, reason: input.reason ?? 'left' });
    }
    emitConversationActiveCallUpdate(io, session);
    return;
  }

  await emitCallHistoryMessage(io, {
    sessionId: session.sessionId, status: 'ended',
    conversationId: session.conversationId ?? undefined,
    callerId: session.initiatedBy,
    participantIds: session.participantIds,
    callType: session.callType,
    endedReason: session.endedReason ?? undefined,
    startedAt: session.startedAt ?? undefined, endedAt: session.endedAt ?? undefined,
    createdAt: session.createdAt,
    durationSeconds: session.durationSeconds,
  });

  for (const participantId of session.participantIds) {
    io.to(`user:${participantId}`).emit('call_participant_left', { sessionId: session.sessionId, userId, reason: session.endedReason });
  }

  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: 'ended', reason: session.endedReason });
  emitConversationActiveCallUpdate(io, session);
}

async function handleWebRtcOffer(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);
  if (!input.sdp) throw new BadRequestError('sdp is required for webrtc_offer');
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  const sessionStatus = await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  if (sessionStatus === 'connected') recordReconnectOfferAttempt();
  io.to(`user:${input.toUserId}`).emit('webrtc_offer', { sessionId: input.sessionId, fromUserId: userId, sdp: input.sdp });
}

async function handleWebRtcAnswer(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);
  if (!input.sdp) throw new BadRequestError('sdp is required for webrtc_answer');
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  const session = await CallsService.markSessionConnected(input.sessionId, userId);
  clearCallTimeout(session.sessionId);
  io.to(`user:${input.toUserId}`).emit('webrtc_answer', { sessionId: input.sessionId, fromUserId: userId, sdp: input.sdp });
  emitCallStatus(io, session.participantIds, { sessionId: session.sessionId, status: session.status });
  emitConversationActiveCallUpdate(io, session);
}

async function handleWebRtcIceCandidate(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseWebRtcSignalPayload(payload);
  if (!input.candidate) throw new BadRequestError('candidate is required for webrtc_ice_candidate');
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  await CallsService.assertSignalRoute(input.sessionId, userId, input.toUserId);
  io.to(`user:${input.toUserId}`).emit('webrtc_ice_candidate', { sessionId: input.sessionId, fromUserId: userId, candidate: input.candidate });
}

async function handleCallMediaState(io: Server, socket: AuthSocket, payload: unknown): Promise<void> {
  const { userId } = socket;
  const input = parseCallMediaStatePayload(payload);
  CallsService.verifySessionTokenForUser(input.sessionId, userId, input.callToken, { allowExpired: true });
  const participantIds = await CallsService.listParticipantIds(input.sessionId);
  if (!participantIds.includes(userId)) {
    throw new BadRequestError('You are not a participant of this call session');
  }

  for (const participantId of participantIds) {
    if (participantId === userId) continue;
    io.to(`user:${participantId}`).emit('call_media_state', {
      sessionId: input.sessionId,
      userId,
      isScreenSharing: input.isScreenSharing,
      isMicMuted: input.isMicMuted,
      isCameraOff: input.isCameraOff,
    });
  }
}

/**
 * CallController - Đăng ký tất cả call/WebRTC events cho một socket
 */
export function registerCallController(io: Server, socket: AuthSocket): void {
  socket.on('call_invite', async (payload: unknown) => {
    try {
      await handleCallInvite(io, socket, payload);
    } catch (err) {
      logSocketError('call_invite', err);
      emitSocketError(socket, err, 'Failed to invite call');
    }
  });

  socket.on('call_group_invite', async (payload: unknown) => {
    try {
      await handleCallGroupInvite(io, socket, payload);
    } catch (err) {
      logSocketError('call_group_invite', err);
      emitSocketError(socket, err, 'Failed to invite group call');
    }
  });

  socket.on('call_accept', async (payload: unknown) => {
    try {
      await handleCallAccept(io, socket, payload);
    } catch (err) {
      logSocketError('call_accept', err);
      emitSocketError(socket, err, 'Failed to accept call');
    }
  });

  socket.on('call_reject', async (payload: unknown) => {
    try {
      await handleCallReject(io, socket, payload);
    } catch (err) {
      logger.error('call_reject error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to reject call' });
    }
  });

  socket.on('call_end', async (payload: unknown) => {
    try {
      await handleCallEnd(io, socket, payload);
    } catch (err) {
      logger.error('call_end error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to end call' });
    }
  });

  socket.on('webrtc_offer', async (payload: unknown) => {
    try {
      await handleWebRtcOffer(io, socket, payload);
    } catch (err) {
      if (isInactiveCallSignalError(err)) {
        logger.debug('Ignoring WebRTC offer for inactive call session');
        return;
      }
      logger.error('webrtc_offer error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to relay offer' });
    }
  });

  socket.on('webrtc_answer', async (payload: unknown) => {
    try {
      await handleWebRtcAnswer(io, socket, payload);
    } catch (err) {
      if (isInactiveCallSignalError(err)) {
        logger.debug('Ignoring WebRTC answer for inactive call session');
        return;
      }
      logger.error('webrtc_answer error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to relay answer' });
    }
  });

  socket.on('webrtc_ice_candidate', async (payload: unknown) => {
    try {
      await handleWebRtcIceCandidate(io, socket, payload);
    } catch (err) {
      if (isInactiveCallSignalError(err)) {
        logger.debug('Ignoring ICE candidate for inactive call session');
        return;
      }
      logger.error('webrtc_ice_candidate error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to relay ICE candidate' });
    }
  });

  socket.on('call_media_state', async (payload: unknown) => {
    try {
      await handleCallMediaState(io, socket, payload);
    } catch (err) {
      if (isInactiveCallSignalError(err)) {
        logger.debug('Ignoring media-state update for inactive call session');
        return;
      }
      logger.error('call_media_state error', err);
      socket.emit('error', { message: err instanceof Error ? err.message : 'Failed to relay call media state' });
    }
  });
}
