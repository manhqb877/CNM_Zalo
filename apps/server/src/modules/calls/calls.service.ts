import { Types } from 'mongoose';
import jwt from 'jsonwebtoken';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../shared/errors';
import { ensureAcceptedFriendship } from '../friends/friends.service';
import { UserModel } from '../users/user.model';
import { ConversationModel } from '../conversations/conversation.model';
import { ConversationMemberModel } from '../conversations/conversation-member.model';
import {
  CallEventModel,
  CallParticipantModel,
  CallSessionModel,
  UserCallStateModel,
  type CallParticipantStatus,
  type CallSessionStatus,
} from './calls.model';
import {
  recordCallConnected,
  recordCallEnded,
  recordCallInvite,
  recordCallMissed,
  recordCallRejected,
} from './calls.metrics';

const ACTIVE_SESSION_STATUSES: CallSessionStatus[] = ['ringing', 'connecting', 'connected'];
export const ACTIVE_CALL_EXISTS_CODE = 'ACTIVE_CALL_EXISTS';
export const GROUP_CALL_REQUIRES_PARTICIPANTS_CODE = 'GROUP_CALL_REQUIRES_PARTICIPANTS';
export const ACTIVE_CALL_CONFLICT_MESSAGE = 'Bạn đang trong một cuộc gọi khác. Vui lòng kết thúc cuộc gọi hiện tại trước.';

interface CreateOneToOneCallInput {
  targetUserId: string;
  conversationId?: string;
  callType: 'audio' | 'video';
}

interface CreateGroupCallInput {
  conversationId: string;
  callType: 'audio' | 'video';
}

interface CallParticipantView {
  userId: string;
  role: string;
  status: CallParticipantStatus;
  joinedAt: Date | null;
  leftAt: Date | null;
}

interface CallSessionDetail {
  sessionId: string;
  conversationId: string | null;
  mode: 'p2p' | 'sfu';
  callType: 'audio' | 'video';
  status: CallSessionStatus;
  initiatedBy: string;
  participantIds: string[];
  participants: CallParticipantView[];
  timeoutAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  endedReason: string | null;
  createdAt: string;
  reused?: boolean;
}

interface ActiveCallDetail extends CallSessionDetail {
  conversationName: string | null;
  callToken: string;
  callTokenExpiresInSeconds: number;
}

interface CallTokenPayload {
  sub: string;
  sid: string;
  typ: 'call_ephemeral';
  iat?: number;
  exp?: number;
}

function getCallRingTimeoutMs(): number {
  const raw = process.env['CALL_RING_TIMEOUT_MS'];
  const parsed = Number.parseInt(raw ?? '30000', 10);
  if (Number.isNaN(parsed) || parsed < 1000) {
    return 30_000;
  }
  return parsed;
}

function getCallConnectedStaleMs(): number {
  const raw = process.env['CALL_CONNECTED_STALE_MS'];
  const parsed = Number.parseInt(raw ?? '180000', 10);
  if (Number.isNaN(parsed) || parsed < 60_000) {
    return 180_000;
  }
  return parsed;
}

function getCallGroupMaxParticipants(): number {
  const raw = process.env['CALL_GROUP_MAX_PARTICIPANTS'];
  const parsed = Number.parseInt(raw ?? '10', 10);
  if (Number.isNaN(parsed) || parsed < 3) {
    return 10;
  }
  return parsed;
}

function assertObjectId(value: string, fieldName: string): void {
  if (!Types.ObjectId.isValid(value)) {
    throw new BadRequestError(`Invalid ${fieldName}`);
  }
}

function toIso(value?: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function getCallTokenSecret(): string {
  const secret = process.env['CALL_EPHEMERAL_TOKEN_SECRET'] ?? process.env['JWT_SECRET'];
  if (!secret) {
    throw new Error('CALL_EPHEMERAL_TOKEN_SECRET or JWT_SECRET must be configured');
  }
  return secret;
}

function getCallTokenTtlSeconds(): number {
  const raw = process.env['CALL_EPHEMERAL_TOKEN_TTL_SECONDS'];
  const parsed = Number.parseInt(raw ?? '21600', 10);
  if (Number.isNaN(parsed) || parsed < 60) {
    return 21_600;
  }
  return parsed;
}

function signEphemeralCallToken(sessionId: string, userId: string): { token: string; expiresInSeconds: number } {
  const expiresInSeconds = getCallTokenTtlSeconds();
  const token = jwt.sign(
    {
      sid: sessionId,
      typ: 'call_ephemeral',
    },
    getCallTokenSecret(),
    {
      subject: userId,
      expiresIn: expiresInSeconds,
    },
  );

  return { token, expiresInSeconds };
}

async function ensureUserExists(userId: string): Promise<void> {
  assertObjectId(userId, 'userId');
  const exists = await UserModel.exists({ _id: userId });
  if (!exists) {
    throw new NotFoundError('User not found');
  }
}

async function ensureParticipant(sessionId: string, userId: string): Promise<void> {
  const participant = await CallParticipantModel.exists({ sessionId, userId });
  if (!participant) {
    throw new ForbiddenError('You are not a participant of this call session');
  }
}

async function buildCallSessionDetail(sessionId: string): Promise<CallSessionDetail> {
  const session = await CallSessionModel.findById(sessionId).lean();
  if (!session) {
    throw new NotFoundError('Call session not found');
  }

  const participants = await CallParticipantModel.find({ sessionId }).lean();
  return {
    sessionId: session._id.toString(),
    conversationId: session.conversationId ?? null,
    mode: session.mode,
    callType: session.callType,
    status: session.status,
    initiatedBy: session.initiatedBy,
    participantIds: session.participantIds,
    participants: participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role,
      status: participant.status,
      joinedAt: participant.joinedAt ?? null,
      leftAt: participant.leftAt ?? null,
    })),
    timeoutAt: toIso(session.timeoutAt),
    startedAt: toIso(session.startedAt),
    endedAt: toIso(session.endedAt),
    durationSeconds: typeof session.durationSeconds === 'number' ? session.durationSeconds : null,
    endedReason: session.endedReason ?? null,
    createdAt: session.createdAt.toISOString(),
  };
}

async function appendCallEvent(
  sessionId: string,
  type: string,
  actorUserId?: string,
  payload?: Record<string, unknown>,
): Promise<void> {
  await CallEventModel.create({
    sessionId,
    type,
    actorUserId,
    payload,
  });
}

async function countActiveParticipants(sessionId: string): Promise<{ active: number; joined: number }> {
  const [active, joined] = await Promise.all([
    CallParticipantModel.countDocuments({
      sessionId,
      status: { $in: ['joined', 'invited'] },
    }),
    CallParticipantModel.countDocuments({
      sessionId,
      status: 'joined',
    }),
  ]);

  return { active, joined };
}

function shouldEndGroupSession(counts: { active: number; joined: number }): boolean {
  return counts.joined <= 0 || counts.active <= 1;
}

function calculateCallDurationSeconds(startedAt?: Date | null, endedAt?: Date | null): number | undefined {
  if (!startedAt || !endedAt) {
    return undefined;
  }

  return Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000));
}

async function ensureUserNotInOtherActiveCall(userId: string, sessionId?: string): Promise<void> {
  const state = await UserCallStateModel.findOne({ userId }).lean();
  if (state?.activeCallSessionId && state.activeCallSessionId !== sessionId) {
    throw new ConflictError(ACTIVE_CALL_CONFLICT_MESSAGE, ACTIVE_CALL_EXISTS_CODE);
  }
}

async function setUserActiveCall(userId: string, sessionId: string): Promise<void> {
  await ensureUserNotInOtherActiveCall(userId, sessionId);
  await UserCallStateModel.updateOne(
    { userId },
    { $set: { activeCallSessionId: sessionId } },
    { upsert: true },
  );
}

async function clearUserActiveCall(userId: string, sessionId: string): Promise<void> {
  await UserCallStateModel.updateOne(
    { userId, activeCallSessionId: sessionId },
    { $unset: { activeCallSessionId: 1 } },
  );
}

async function setConversationActiveCall(sessionId: string): Promise<void> {
  const session = await CallSessionModel.findById(sessionId).lean();
  if (!session?.conversationId || session.mode !== 'sfu' || !ACTIVE_SESSION_STATUSES.includes(session.status)) {
    return;
  }

  await ConversationModel.findByIdAndUpdate(session.conversationId, {
    $set: {
      activeCall: {
        callSessionId: session._id.toString(),
        type: session.callType,
        status: session.status,
        startedAt: session.startedAt,
        initiatedBy: session.initiatedBy,
      },
    },
  });
}

async function clearConversationActiveCall(sessionId: string): Promise<void> {
  const session = await CallSessionModel.findById(sessionId).select('conversationId mode').lean();
  if (!session) {
    await ConversationModel.updateMany(
      { 'activeCall.callSessionId': sessionId },
      { $unset: { activeCall: 1 } },
    );
    return;
  }

  if (!session.conversationId || session.mode !== 'sfu') {
    return;
  }

  await ConversationModel.updateOne(
    {
      _id: session.conversationId,
      'activeCall.callSessionId': sessionId,
    },
    { $unset: { activeCall: 1 } },
  );
}

async function clearJoinedUserCallStates(sessionId: string): Promise<void> {
  await UserCallStateModel.updateMany(
    { activeCallSessionId: sessionId },
    { $unset: { activeCallSessionId: 1 } },
  );
}

export class CallsService {
  static async getActiveCallForUser(userId: string): Promise<ActiveCallDetail | null> {
    const state = await UserCallStateModel.findOne({ userId }).lean();
    if (!state?.activeCallSessionId) {
      return null;
    }

    const session = await CallSessionModel.findById(state.activeCallSessionId).lean();
    if (!session || !ACTIVE_SESSION_STATUSES.includes(session.status)) {
      await clearUserActiveCall(userId, state.activeCallSessionId);
      await clearConversationActiveCall(state.activeCallSessionId);
      return null;
    }

    const detail = await buildCallSessionDetail(state.activeCallSessionId);
    const conversation = detail.conversationId
      ? await ConversationModel.findById(detail.conversationId).select('name').lean()
      : null;

    const token = signEphemeralCallToken(detail.sessionId, userId);
    return {
      ...detail,
      conversationName: typeof conversation?.name === 'string' ? conversation.name : null,
      callToken: token.token,
      callTokenExpiresInSeconds: token.expiresInSeconds,
    };
  }

  private static async cleanupExpiredRingingSessionsForPair(
    callerUserId: string,
    calleeUserId: string,
  ): Promise<void> {
    const now = new Date();
    const expiredSessionIds = await CallSessionModel.find({
      mode: 'p2p',
      participantIds: { $all: [callerUserId, calleeUserId], $size: 2 },
      status: 'ringing',
      timeoutAt: { $lte: now },
    })
      .select('_id')
      .lean();

    for (const session of expiredSessionIds) {
      await this.markMissedIfNoAnswer(session._id.toString());
    }
  }

  private static async cleanupExpiredRingingSessionsForConversation(
    conversationId: string,
  ): Promise<void> {
    const now = new Date();
    const expiredSessionIds = await CallSessionModel.find({
      mode: 'sfu',
      conversationId,
      status: 'ringing',
      timeoutAt: { $lte: now },
    })
      .select('_id')
      .lean();

    for (const session of expiredSessionIds) {
      await this.markMissedIfNoAnswer(session._id.toString());
    }
  }

  private static shouldAutoResolveSessionForReinvite(
    session: {
      status: CallSessionStatus;
      timeoutAt?: Date | null;
      createdAt: Date;
      startedAt?: Date | null;
    },
  ): boolean {
    const nowTs = Date.now();

    if (session.status === 'ringing') {
      return Boolean(session.timeoutAt && session.timeoutAt.getTime() <= nowTs);
    }

    if (session.status === 'connecting') {
      const connectingAgeMs = nowTs - session.createdAt.getTime();
      return connectingAgeMs > getCallRingTimeoutMs() * 2;
    }

    if (session.status === 'connected') {
      const startedAtMs = session.startedAt?.getTime() ?? session.createdAt.getTime();
      return nowTs - startedAtMs > getCallConnectedStaleMs();
    }

    return false;
  }

  private static async forceEndSessionForReinvite(sessionId: string): Promise<void> {
    const session = await CallSessionModel.findById(sessionId);
    if (!session || !ACTIVE_SESSION_STATUSES.includes(session.status)) {
      return;
    }

    const now = new Date();
    await CallParticipantModel.updateMany(
      {
        sessionId,
        status: { $in: ['joined', 'invited'] },
      },
      {
        $set: {
          status: 'left',
          leftAt: now,
        },
      },
    );

    session.status = 'ended';
    session.endedAt = now;
    session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
    session.endedReason = 'superseded_reinvite';
    await session.save();
    await clearJoinedUserCallStates(sessionId);
    await clearConversationActiveCall(sessionId);

    recordCallEnded(session.endedReason, session.durationSeconds);
    await appendCallEvent(sessionId, 'call_force_ended', undefined, {
      reason: session.endedReason,
    });
  }

  static async issueSessionTokenForUser(
    sessionId: string,
    userId: string,
  ): Promise<{ token: string; expiresInSeconds: number }> {
    assertObjectId(sessionId, 'sessionId');
    await ensureParticipant(sessionId, userId);
    return signEphemeralCallToken(sessionId, userId);
  }

  static verifySessionTokenForUser(
    sessionId: string,
    userId: string,
    token: string,
    options?: { allowExpired?: boolean },
  ): void {
    if (!token || token.trim().length === 0) {
      throw new UnauthorizedError('Missing call token');
    }

    let decoded: CallTokenPayload;
    try {
      decoded = jwt.verify(token, getCallTokenSecret(), {
        ignoreExpiration: options?.allowExpired === true,
      }) as CallTokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired call token');
    }

    if (decoded.typ !== 'call_ephemeral' || decoded.sid !== sessionId || decoded.sub !== userId) {
      throw new UnauthorizedError('Call token does not match session or user');
    }
  }

  static async createOneToOneSession(
    callerUserId: string,
    input: CreateOneToOneCallInput,
  ): Promise<CallSessionDetail> {
    const calleeUserId = input.targetUserId;

    if (callerUserId === calleeUserId) {
      throw new BadRequestError('Cannot call yourself');
    }

    await Promise.all([
      ensureUserExists(callerUserId),
      ensureUserExists(calleeUserId),
    ]);
    await ensureAcceptedFriendship(
      callerUserId,
      calleeUserId,
      'Only accepted friends can start a 1-1 call',
    );

    await this.cleanupExpiredRingingSessionsForPair(callerUserId, calleeUserId);

    let activeSession = await CallSessionModel.findOne({
      mode: 'p2p',
      participantIds: { $all: [callerUserId, calleeUserId], $size: 2 },
      status: { $in: ACTIVE_SESSION_STATUSES },
    }).lean();

    if (
      activeSession
      && activeSession.status === 'ringing'
      && activeSession.timeoutAt
      && new Date(activeSession.timeoutAt).getTime() <= Date.now()
    ) {
      await this.markMissedIfNoAnswer(activeSession._id.toString());
      activeSession = await CallSessionModel.findOne({
        mode: 'p2p',
        participantIds: { $all: [callerUserId, calleeUserId], $size: 2 },
        status: { $in: ACTIVE_SESSION_STATUSES },
      }).lean();
    }

    if (
      activeSession
      && this.shouldAutoResolveSessionForReinvite({
        status: activeSession.status,
        timeoutAt: activeSession.timeoutAt,
        createdAt: activeSession.createdAt,
        startedAt: activeSession.startedAt,
      })
    ) {
      await this.forceEndSessionForReinvite(activeSession._id.toString());
      activeSession = await CallSessionModel.findOne({
        mode: 'p2p',
        participantIds: { $all: [callerUserId, calleeUserId], $size: 2 },
        status: { $in: ACTIVE_SESSION_STATUSES },
      }).lean();
    }

    if (activeSession) {
      await ensureUserNotInOtherActiveCall(callerUserId, activeSession._id.toString());
      await CallParticipantModel.updateOne(
        { sessionId: activeSession._id.toString(), userId: callerUserId },
        {
          $set: {
            status: 'joined',
            joinedAt: new Date(),
            leftAt: null,
          },
        },
      );
      await setUserActiveCall(callerUserId, activeSession._id.toString());

      const detail = await buildCallSessionDetail(activeSession._id.toString());
      return { ...detail, reused: true };
    }

    await ensureUserNotInOtherActiveCall(callerUserId);

    const timeoutAt = new Date(Date.now() + getCallRingTimeoutMs());
    const session = await CallSessionModel.create({
      conversationId: input.conversationId,
      callType: input.callType,
      mode: 'p2p',
      status: 'ringing',
      initiatedBy: callerUserId,
      participantIds: [callerUserId, calleeUserId],
      timeoutAt,
    });

    await CallParticipantModel.insertMany([
      {
        sessionId: session._id.toString(),
        userId: callerUserId,
        role: 'caller',
        status: 'joined',
        joinedAt: new Date(),
      },
      {
        sessionId: session._id.toString(),
        userId: calleeUserId,
        role: 'callee',
        status: 'invited',
      },
    ]);

    await appendCallEvent(session._id.toString(), 'call_invited', callerUserId, {
      targetUserId: calleeUserId,
      conversationId: input.conversationId ?? null,
    });
    await setUserActiveCall(callerUserId, session._id.toString());
    recordCallInvite();

    return buildCallSessionDetail(session._id.toString());
  }

  static async createGroupSession(
    callerUserId: string,
    input: CreateGroupCallInput,
  ): Promise<CallSessionDetail> {
    assertObjectId(input.conversationId, 'conversationId');
    await ensureUserExists(callerUserId);

    const conversation = await ConversationModel.findById(input.conversationId)
      .select('type')
      .lean();
    if (!conversation || conversation.type !== 'group') {
      throw new NotFoundError('Group conversation not found');
    }

    const members = await ConversationMemberModel.find({
      conversationId: input.conversationId,
    })
      .select('userId')
      .lean();

    const participantIds = Array.from(new Set(members.map((member) => member.userId)));
    if (!participantIds.includes(callerUserId)) {
      throw new ForbiddenError('Only conversation members can start a group call');
    }

    if (participantIds.length < 2) {
      throw new BadRequestError('Group call requires at least 2 participants', GROUP_CALL_REQUIRES_PARTICIPANTS_CODE);
    }

    if (participantIds.length > getCallGroupMaxParticipants()) {
      throw new ConflictError('Group call participant limit exceeded');
    }

    await this.cleanupExpiredRingingSessionsForConversation(input.conversationId);

    let activeSession = await CallSessionModel.findOne({
      mode: 'sfu',
      conversationId: input.conversationId,
      status: { $in: ACTIVE_SESSION_STATUSES },
    }).lean();

    if (
      activeSession
      && this.shouldAutoResolveSessionForReinvite({
        status: activeSession.status,
        timeoutAt: activeSession.timeoutAt,
        createdAt: activeSession.createdAt,
        startedAt: activeSession.startedAt,
      })
    ) {
      await this.forceEndSessionForReinvite(activeSession._id.toString());
      activeSession = await CallSessionModel.findOne({
        mode: 'sfu',
        conversationId: input.conversationId,
        status: { $in: ACTIVE_SESSION_STATUSES },
      }).lean();
    }

    if (activeSession) {
      await ensureUserNotInOtherActiveCall(callerUserId, activeSession._id.toString());
      await CallParticipantModel.updateOne(
        { sessionId: activeSession._id.toString(), userId: callerUserId },
        {
          $set: {
            status: 'joined',
            joinedAt: new Date(),
            leftAt: null,
          },
        },
      );
      await setUserActiveCall(callerUserId, activeSession._id.toString());
      await setConversationActiveCall(activeSession._id.toString());
      const detail = await buildCallSessionDetail(activeSession._id.toString());
      return { ...detail, reused: true };
    }

    await ensureUserNotInOtherActiveCall(callerUserId);

    const timeoutAt = new Date(Date.now() + getCallRingTimeoutMs());
    const session = await CallSessionModel.create({
      conversationId: input.conversationId,
      callType: input.callType,
      mode: 'sfu',
      status: 'ringing',
      initiatedBy: callerUserId,
      participantIds,
      timeoutAt,
    });

    await CallParticipantModel.insertMany(
      participantIds.map((participantId) => {
        if (participantId === callerUserId) {
          return {
            sessionId: session._id.toString(),
            userId: participantId,
            role: 'caller',
            status: 'joined' as const,
            joinedAt: new Date(),
          };
        }

        return {
          sessionId: session._id.toString(),
          userId: participantId,
          role: 'participant' as const,
          status: 'invited' as const,
        };
      }),
    );

    await appendCallEvent(session._id.toString(), 'call_group_invited', callerUserId, {
      conversationId: input.conversationId,
      participantCount: participantIds.length,
    });
    await setUserActiveCall(callerUserId, session._id.toString());
    await setConversationActiveCall(session._id.toString());
    recordCallInvite();

    return buildCallSessionDetail(session._id.toString());
  }

  static async getSessionForUser(sessionId: string, userId: string): Promise<CallSessionDetail> {
    assertObjectId(sessionId, 'sessionId');
    await ensureParticipant(sessionId, userId);
    return buildCallSessionDetail(sessionId);
  }

  static async acceptCallSession(sessionId: string, userId: string): Promise<CallSessionDetail> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Call session not found');
    }

    await ensureParticipant(sessionId, userId);
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
      throw new BadRequestError('Call session is no longer active');
    }
    await ensureUserNotInOtherActiveCall(userId, sessionId);

    await CallParticipantModel.updateOne(
      { sessionId, userId },
      {
        $set: {
          status: 'joined',
          joinedAt: new Date(),
          leftAt: null,
        },
      },
    );

    if (session.status === 'ringing') {
      session.status = 'connecting';
      await session.save();
    }

    await setUserActiveCall(userId, sessionId);
    await setConversationActiveCall(sessionId);
    await appendCallEvent(sessionId, 'call_accepted', userId);
    return buildCallSessionDetail(sessionId);
  }

  static async rejectCallSession(
    sessionId: string,
    userId: string,
    reason: 'rejected' | 'busy',
  ): Promise<CallSessionDetail> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Call session not found');
    }

    await ensureParticipant(sessionId, userId);
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
      throw new BadRequestError('Call session is no longer active');
    }

    await CallParticipantModel.updateOne(
      { sessionId, userId },
      {
        $set: {
          status: reason,
          leftAt: new Date(),
        },
      },
    );

    await appendCallEvent(sessionId, 'call_rejected', userId, { reason });
    recordCallRejected(reason);
    await clearUserActiveCall(userId, sessionId);

    if (session.mode === 'sfu') {
      const remainingActive = await countActiveParticipants(sessionId);
      if (shouldEndGroupSession(remainingActive)) {
        session.status = 'rejected';
        session.endedAt = new Date();
        session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
        session.endedReason = reason;
        await session.save();
        await clearJoinedUserCallStates(sessionId);
        await clearConversationActiveCall(sessionId);
        recordCallEnded(reason);
      }

      return buildCallSessionDetail(sessionId);
    }

    session.status = 'rejected';
    session.endedAt = new Date();
    session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
    session.endedReason = reason;
    await session.save();
    await clearJoinedUserCallStates(sessionId);
    recordCallEnded(reason);

    return buildCallSessionDetail(sessionId);
  }

  static async markSessionConnected(sessionId: string, actorUserId: string): Promise<CallSessionDetail> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Call session not found');
    }

    await ensureParticipant(sessionId, actorUserId);
    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
      throw new BadRequestError('Call session is no longer active');
    }

    if (session.status !== 'connected') {
      session.status = 'connected';
      if (!session.startedAt) {
        session.startedAt = new Date();
      }
      await session.save();
      await setConversationActiveCall(sessionId);
      const setupSeconds = (session.startedAt.getTime() - session.createdAt.getTime()) / 1000;
      recordCallConnected(setupSeconds);
      await appendCallEvent(sessionId, 'call_connected', actorUserId);
    }

    return buildCallSessionDetail(sessionId);
  }

  static async endCallSession(
    sessionId: string,
    userId: string,
    reason?: string,
  ): Promise<CallSessionDetail> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId);
    if (!session) {
      throw new NotFoundError('Call session not found');
    }

    await ensureParticipant(sessionId, userId);

    if (session.status === 'ended' || session.status === 'missed' || session.status === 'rejected') {
      return buildCallSessionDetail(sessionId);
    }

    const isGroupHostEndingRoom = session.mode === 'sfu' && session.initiatedBy === userId && reason !== 'left';
    if (session.mode === 'sfu' && !isGroupHostEndingRoom) {
      await CallParticipantModel.updateOne(
        {
          sessionId,
          userId,
        },
        {
          $set: {
            status: 'left',
            leftAt: new Date(),
          },
        },
      );
      await clearUserActiveCall(userId, sessionId);

      await appendCallEvent(sessionId, 'call_left', userId, { reason: reason ?? 'left' });

      const remainingActive = await countActiveParticipants(sessionId);
      if (shouldEndGroupSession(remainingActive)) {
        session.status = 'ended';
        session.endedAt = new Date();
        session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
        session.endedReason = reason ?? 'ended';
        await session.save();
        await clearJoinedUserCallStates(sessionId);
        await clearConversationActiveCall(sessionId);
        recordCallEnded(session.endedReason, session.durationSeconds);
        await appendCallEvent(sessionId, 'call_ended', userId, { reason: session.endedReason });
      }

      return buildCallSessionDetail(sessionId);
    }

    await CallParticipantModel.updateOne(
      {
        sessionId,
        userId,
      },
      {
        $set: {
          status: 'left',
          leftAt: new Date(),
        },
      },
    );
    await clearUserActiveCall(userId, sessionId);

    session.status = 'ended';
    session.endedAt = new Date();
    session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
    session.endedReason = reason ?? 'ended';
    await session.save();
    await clearJoinedUserCallStates(sessionId);
    await clearConversationActiveCall(sessionId);
    recordCallEnded(session.endedReason, session.durationSeconds);

    await appendCallEvent(sessionId, 'call_ended', userId, { reason: session.endedReason });
    return buildCallSessionDetail(sessionId);
  }

  static async markMissedIfNoAnswer(sessionId: string): Promise<CallSessionDetail | null> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId);
    if (!session) {
      return null;
    }

    if (session.status !== 'ringing') {
      return null;
    }

    await CallParticipantModel.updateMany(
      { sessionId, status: 'invited' },
      {
        $set: {
          status: 'missed',
          leftAt: new Date(),
        },
      },
    );

    session.status = 'missed';
    session.endedAt = new Date();
    session.durationSeconds = calculateCallDurationSeconds(session.startedAt, session.endedAt);
    session.endedReason = 'timeout';
    await session.save();
    await clearJoinedUserCallStates(sessionId);
    await clearConversationActiveCall(sessionId);
    recordCallMissed();
    recordCallEnded('timeout');

    await appendCallEvent(sessionId, 'call_missed', undefined, { reason: 'timeout' });
    return buildCallSessionDetail(sessionId);
  }

  static async assertSignalRoute(
    sessionId: string,
    fromUserId: string,
    toUserId: string,
  ): Promise<CallSessionStatus> {
    assertObjectId(sessionId, 'sessionId');
    const session = await CallSessionModel.findById(sessionId).lean();
    if (!session) {
      throw new NotFoundError('Call session not found');
    }

    if (!ACTIVE_SESSION_STATUSES.includes(session.status)) {
      throw new BadRequestError('Call session is no longer active');
    }

    await ensureParticipant(sessionId, fromUserId);
    await ensureParticipant(sessionId, toUserId);
    return session.status;
  }

  static async listParticipantIds(sessionId: string): Promise<string[]> {
    const participants = await CallParticipantModel.find({ sessionId }).select('userId').lean();
    return participants.map((participant) => participant.userId);
  }

  static async listJoinedParticipantIds(sessionId: string): Promise<string[]> {
    const participants = await CallParticipantModel.find({
      sessionId,
      status: 'joined',
    })
      .select('userId')
      .lean();
    return participants.map((participant) => participant.userId);
  }
}
