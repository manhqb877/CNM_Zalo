import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import type { Application } from 'express';
import http, { type Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';

// Mock Redis adapter de khong phu thuoc Redis thuc khi test socket gateway
jest.mock('@socket.io/redis-adapter', () => {
  const { Adapter } = jest.requireActual('socket.io-adapter') as { Adapter: any };
  class MockRedisAdapter extends (Adapter as any) {}
  return {
    createAdapter: jest.fn(() => MockRedisAdapter),
  };
});

const redisStore = new Map<string, string>();
function createRedisPipelineMock() {
  const results: Array<Promise<[null, unknown]>> = [];

  const pipeline = {
    get: jest.fn((key: string) => {
      results.push(Promise.resolve([null, redisStore.get(key) ?? null]));
      return pipeline;
    }),
    set: jest.fn((key: string, value: string) => {
      redisStore.set(key, value);
      results.push(Promise.resolve([null, 'OK']));
      return pipeline;
    }),
    setex: jest.fn((key: string, _ttl: number, value: string) => {
      redisStore.set(key, value);
      results.push(Promise.resolve([null, 'OK']));
      return pipeline;
    }),
    setnx: jest.fn((key: string, value: string) => {
      const inserted = redisStore.has(key) ? 0 : 1;
      if (inserted) redisStore.set(key, value);
      results.push(Promise.resolve([null, inserted]));
      return pipeline;
    }),
    del: jest.fn((key: string) => {
      const deleted = redisStore.delete(key) ? 1 : 0;
      results.push(Promise.resolve([null, deleted]));
      return pipeline;
    }),
    exec: jest.fn(() => Promise.all(results)),
  };

  return pipeline;
}

const redisMockClient = {
  hset: jest.fn(() => Promise.resolve(1)),
  hdel: jest.fn(() => Promise.resolve(1)),
  get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  set: jest.fn((key: string, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve('OK');
  }),
  setex: jest.fn((key: string, _ttl: number, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve('OK');
  }),
  del: jest.fn((...keys: string[]) => {
    let deleted = 0;
    for (const key of keys) {
      if (redisStore.delete(key)) deleted += 1;
    }
    return Promise.resolve(deleted);
  }),
  pipeline: jest.fn(() => createRedisPipelineMock()),
  duplicate: jest.fn(() => redisMockClient),
};

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMockClient,
  createRedisDuplicate: () => redisMockClient,
  setTypingIndicator: jest.fn(() => Promise.resolve()),
  removeTypingIndicator: jest.fn(() => Promise.resolve()),
  setUserOnline: jest.fn(() => Promise.resolve()),
  removeUserOnline: jest.fn(() => Promise.resolve()),
  checkMessageRateLimit: jest.fn(() => Promise.resolve(true)),
}));

import { createApp } from '../../src/app';
import { initSocketGateway } from '../../src/socket/gateway';
import { UserModel } from '../../src/modules/users/user.model';
import { FriendshipModel } from '../../src/modules/friends/friendship.model';
import { CallEventModel, CallParticipantModel, CallSessionModel } from '../../src/modules/calls/calls.model';
import { ConversationModel } from '../../src/modules/conversations/conversation.model';
import { ConversationMemberModel } from '../../src/modules/conversations/conversation-member.model';
import { ConversationsService } from '../../src/modules/conversations/conversations.service';
import { MessageModel } from '../../src/modules/messages/message.model';

let app: Application;
let mongoServer: MongoMemoryServer;
let httpServer: HttpServer;
let baseUrl = '';

function issueAccessToken(userId: string): string {
  return jwt.sign(
    { sub: userId },
    process.env['JWT_SECRET'] as string,
    { expiresIn: '15m' },
  );
}

function issueExpiredCallToken(sessionId: string, userId: string): string {
  return jwt.sign(
    {
      sid: sessionId,
      typ: 'call_ephemeral',
      exp: Math.floor(Date.now() / 1000) - 10,
    },
    process.env['CALL_EPHEMERAL_TOKEN_SECRET'] as string,
    { subject: userId },
  );
}

function waitForEvent<T>(socket: ClientSocket, eventName: string, timeoutMs: number = 4000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for event ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload: T) => {
      cleanup();
      resolve(payload);
    };

    const onConnectError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent as (...args: any[]) => void);
      socket.off('connect_error', onConnectError as (...args: any[]) => void);
    };

    socket.on(eventName, onEvent as (...args: any[]) => void);
    socket.on('connect_error', onConnectError as (...args: any[]) => void);
  });
}

function waitForEventMatching<T>(
  socket: ClientSocket,
  eventName: string,
  predicate: (payload: T) => boolean,
  timeoutMs: number = 6000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout waiting for matching event ${eventName}`));
    }, timeoutMs);

    const onEvent = (payload: T) => {
      try {
        if (!predicate(payload)) {
          return;
        }
        cleanup();
        resolve(payload);
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const onConnectError = (err: Error) => {
      cleanup();
      reject(err);
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent as (...args: any[]) => void);
      socket.off('connect_error', onConnectError as (...args: any[]) => void);
    };

    socket.on(eventName, onEvent as (...args: any[]) => void);
    socket.on('connect_error', onConnectError as (...args: any[]) => void);
  });
}

function expectNoMatchingEvent<T>(
  socket: ClientSocket,
  eventName: string,
  predicate: (payload: T) => boolean,
  timeoutMs: number = 1200,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, timeoutMs);

    const onEvent = (payload: T) => {
      try {
        if (!predicate(payload)) {
          return;
        }
        cleanup();
        reject(new Error(`Unexpected matching event ${eventName}`));
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    const cleanup = () => {
      clearTimeout(timer);
      socket.off(eventName, onEvent as (...args: any[]) => void);
    };

    socket.on(eventName, onEvent as (...args: any[]) => void);
  });
}

async function connectClient(token: string): Promise<ClientSocket> {
  const socket = ioClient(baseUrl, {
    transports: ['websocket'],
    auth: { token },
    forceNew: true,
    reconnection: false,
  });

  await waitForEvent(socket, 'connect', 5000);
  return socket;
}

async function seedCallUsers(): Promise<{ callerId: string; calleeId: string; callerToken: string; calleeToken: string }> {
  const caller = await UserModel.create({
    email: 'caller-call@test.com',
    displayName: 'Caller Call',
  });

  const callee = await UserModel.create({
    email: 'callee-call@test.com',
    displayName: 'Callee Call',
  });

  await FriendshipModel.insertMany([
    { userId: caller._id.toString(), friendId: callee._id.toString(), status: 'accepted' },
    { userId: callee._id.toString(), friendId: caller._id.toString(), status: 'accepted' },
  ]);

  return {
    callerId: caller._id.toString(),
    calleeId: callee._id.toString(),
    callerToken: issueAccessToken(caller._id.toString()),
    calleeToken: issueAccessToken(callee._id.toString()),
  };
}

function disconnectSockets(...sockets: ClientSocket[]): void {
  for (const socket of sockets) {
    if (socket.connected) {
      socket.disconnect();
    }
  }
}

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';
  process.env['JWT_SECRET'] = 'calls-realtime-test-secret';
  process.env['JWT_REFRESH_SECRET'] = 'calls-realtime-refresh-secret';
  process.env['CALL_EPHEMERAL_TOKEN_SECRET'] = 'calls-realtime-ephemeral-secret';
  process.env['CALL_RING_TIMEOUT_MS'] = '1200';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  app = createApp();
  httpServer = http.createServer(app);
  initSocketGateway(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to determine test server port');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    httpServer.close(() => resolve());
  });
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  redisStore.clear();
  jest.clearAllMocks();
  await Promise.all([
    CallEventModel.deleteMany({}),
    CallParticipantModel.deleteMany({}),
    CallSessionModel.deleteMany({}),
    ConversationMemberModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    FriendshipModel.deleteMany({}),
    MessageModel.deleteMany({}),
    UserModel.deleteMany({}),
  ]);
});

describe('Calls realtime integration (Phase 7.5 Milestone A)', () => {
  it('happy path: invite -> accept -> offer/answer -> connected -> end', async () => {
    const { callerId, calleeId, callerToken, calleeToken } = await seedCallUsers();

    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );

      const incoming = await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      expect(invited['callToken']).toBeTruthy();
      expect(incoming['callToken']).toBeTruthy();

      calleeSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incoming['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === calleeId,
      );

      const connectedStatusPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'connected',
      );

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        sdp: { type: 'offer', sdp: 'fake-offer-sdp' },
        callToken: invited['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'webrtc_offer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === callerId,
      );

      calleeSocket.emit('webrtc_answer', {
        sessionId: invited['sessionId'],
        toUserId: callerId,
        sdp: { type: 'answer', sdp: 'fake-answer-sdp' },
        callToken: incoming['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'webrtc_answer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === calleeId,
      );

      await connectedStatusPromise;

      const endedStatusPromise = waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'ended',
      );

      callerSocket.emit('call_end', {
        sessionId: invited['sessionId'],
        reason: 'ended',
        callToken: invited['callToken'],
      });

      const endedStatus = await endedStatusPromise;
      expect(endedStatus['reason']).toBe('ended');

      callerSocket.emit('webrtc_ice_candidate', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        candidate: { candidate: 'late-candidate', sdpMid: '0', sdpMLineIndex: 0 },
        callToken: invited['callToken'],
      });

      await expectNoMatchingEvent<Record<string, any>>(
        callerSocket,
        'error',
        (payload) => String(payload['message'] ?? '').includes('Call session is no longer active'),
        300,
      );
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('reject path: callee rejects with busy', async () => {
    const { calleeId, callerToken, calleeToken } = await seedCallUsers();
    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );
      const incoming = await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const rejectedPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'rejected',
      );

      calleeSocket.emit('call_reject', {
        sessionId: invited['sessionId'],
        reason: 'busy',
        callToken: incoming['callToken'],
      });

      const rejected = await rejectedPromise;
      expect(rejected['reason']).toBe('busy');
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('reinvite while ringing reuses the 1-1 session and notifies callee again', async () => {
    const { calleeId, callerToken, calleeToken } = await seedCallUsers();
    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const firstInvited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );
      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === firstInvited['sessionId'],
      );

      const noActiveConflict = expectNoMatchingEvent<Record<string, any>>(
        callerSocket,
        'error',
        (payload) => String(payload['message'] ?? '').includes('already active'),
        800,
      );

      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const reinvited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['sessionId'] === firstInvited['sessionId'] && Boolean(payload['callToken']),
      );
      const reincoming = await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === firstInvited['sessionId'] && Boolean(payload['callToken']),
      );

      expect(reinvited['participantIds']).toContain(calleeId);
      expect(reincoming['participantIds']).toContain(calleeId);
      expect(await CallSessionModel.countDocuments({ status: { $in: ['ringing', 'connecting', 'connected'] } })).toBe(1);
      await noActiveConflict;
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('missed path: timeout auto-miss when callee does not answer', async () => {
    const { calleeId, callerToken, calleeToken } = await seedCallUsers();
    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const missed = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'missed',
        7000,
      );

      expect(missed['reason']).toBe('timeout');
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('reconnect signaling and security: second offer increments reconnect metric, missing callToken is rejected', async () => {
    const { callerId, calleeId, callerToken, calleeToken } = await seedCallUsers();
    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );
      const incoming = await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      calleeSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incoming['callToken'],
      });

      const connectedStatusPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'connected',
      );

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        sdp: { type: 'offer', sdp: 'offer-1' },
        callToken: invited['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'webrtc_offer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === callerId,
      );

      calleeSocket.emit('webrtc_answer', {
        sessionId: invited['sessionId'],
        toUserId: callerId,
        sdp: { type: 'answer', sdp: 'answer-1' },
        callToken: incoming['callToken'],
      });

      await connectedStatusPromise;

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        sdp: { type: 'offer', sdp: 'offer-reconnect' },
        callToken: invited['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'webrtc_offer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === callerId,
      );

      const metricsRes = await request(app).get('/metrics');
      expect(metricsRes.status).toBe(200);
      const reconnectMetric = metricsRes.text.match(/^call_reconnect_offer_total\s+([0-9.]+)$/m);
      expect(reconnectMetric).toBeTruthy();
      expect(Number(reconnectMetric?.[1] ?? '0')).toBeGreaterThan(0);

      const errorPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'error',
        (payload) => typeof payload['message'] === 'string' && payload['message'].includes('callToken is required'),
      );

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        sdp: { type: 'offer', sdp: 'offer-without-token' },
      });

      const errorPayload = await errorPromise;
      expect(errorPayload['message']).toContain('callToken is required');
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('connected signaling accepts an expired but valid call token', async () => {
    const { callerId, calleeId, callerToken, calleeToken } = await seedCallUsers();
    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );
      const incoming = await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      calleeSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incoming['callToken'],
      });

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        sdp: { type: 'offer', sdp: 'offer-before-expired-token' },
        callToken: invited['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'webrtc_offer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === callerId,
      );

      calleeSocket.emit('webrtc_answer', {
        sessionId: invited['sessionId'],
        toUserId: callerId,
        sdp: { type: 'answer', sdp: 'answer-before-expired-token' },
        callToken: incoming['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'connected',
      );

      const expiredCallerCallToken = issueExpiredCallToken(invited['sessionId'], callerId);
      callerSocket.emit('webrtc_ice_candidate', {
        sessionId: invited['sessionId'],
        toUserId: calleeId,
        candidate: { candidate: 'candidate-with-expired-token', sdpMid: '0', sdpMLineIndex: 0 },
        callToken: expiredCallerCallToken,
      });

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'webrtc_ice_candidate',
        (payload) => payload['sessionId'] === invited['sessionId']
          && payload['fromUserId'] === callerId
          && payload['candidate']?.['candidate'] === 'candidate-with-expired-token',
      );
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('stale ringing session is auto-missed and does not block a new invite', async () => {
    const { callerId, calleeId, callerToken, calleeToken } = await seedCallUsers();
    const staleSession = await CallSessionModel.create({
      conversationId: new mongoose.Types.ObjectId().toString(),
      callType: 'video',
      mode: 'p2p',
      status: 'ringing',
      initiatedBy: callerId,
      participantIds: [callerId, calleeId],
      timeoutAt: new Date(Date.now() - 60_000),
    });

    await CallParticipantModel.insertMany([
      {
        sessionId: staleSession._id.toString(),
        userId: callerId,
        role: 'caller',
        status: 'joined',
        joinedAt: new Date(Date.now() - 70_000),
      },
      {
        sessionId: staleSession._id.toString(),
        userId: calleeId,
        role: 'callee',
        status: 'invited',
      },
    ]);

    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string' && payload['sessionId'] !== staleSession._id.toString(),
      );

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const refreshedStaleSession = await CallSessionModel.findById(staleSession._id).lean();
      expect(refreshedStaleSession?.status).toBe('missed');
      expect(refreshedStaleSession?.endedReason).toBe('timeout');
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
    }
  });

  it('stale connected session is auto-ended and does not block a new invite', async () => {
    process.env['CALL_CONNECTED_STALE_MS'] = '60000';
    const { callerId, calleeId, callerToken, calleeToken } = await seedCallUsers();
    const staleConnectedSession = await CallSessionModel.create({
      conversationId: new mongoose.Types.ObjectId().toString(),
      callType: 'video',
      mode: 'p2p',
      status: 'connected',
      initiatedBy: callerId,
      participantIds: [callerId, calleeId],
      startedAt: new Date(Date.now() - 120_000),
      createdAt: new Date(Date.now() - 180_000),
    });

    await CallParticipantModel.insertMany([
      {
        sessionId: staleConnectedSession._id.toString(),
        userId: callerId,
        role: 'caller',
        status: 'joined',
        joinedAt: new Date(Date.now() - 20_000),
      },
      {
        sessionId: staleConnectedSession._id.toString(),
        userId: calleeId,
        role: 'callee',
        status: 'joined',
        joinedAt: new Date(Date.now() - 20_000),
      },
    ]);

    const callerSocket = await connectClient(callerToken);
    const calleeSocket = await connectClient(calleeToken);

    try {
      callerSocket.emit('call_invite', { targetUserId: calleeId });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string' && payload['sessionId'] !== staleConnectedSession._id.toString(),
      );

      await waitForEventMatching<Record<string, any>>(
        calleeSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const refreshedStaleSession = await CallSessionModel.findById(staleConnectedSession._id).lean();
      expect(refreshedStaleSession?.status).toBe('ended');
      expect(refreshedStaleSession?.endedReason).toBe('superseded_reinvite');
    } finally {
      disconnectSockets(callerSocket, calleeSocket);
      delete process.env['CALL_CONNECTED_STALE_MS'];
    }
  });

  it('group call path: invite group -> multiple incoming -> participant join signaling', async () => {
    const caller = await UserModel.create({
      email: 'group-caller@test.com',
      displayName: 'Group Caller',
    });
    const participantA = await UserModel.create({
      email: 'group-a@test.com',
      displayName: 'Group Member A',
    });
    const participantB = await UserModel.create({
      email: 'group-b@test.com',
      displayName: 'Group Member B',
    });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhóm test call',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      {
        conversationId: conversation._id.toString(),
        userId: caller._id.toString(),
        role: 'admin',
      },
      {
        conversationId: conversation._id.toString(),
        userId: participantA._id.toString(),
        role: 'member',
      },
      {
        conversationId: conversation._id.toString(),
        userId: participantB._id.toString(),
        role: 'member',
      },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );

      expect(invited['participantIds']).toHaveLength(3);
      expect(invited['callToken']).toBeTruthy();

      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      const incomingB = await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      expect(incomingA['isGroupCall']).toBe(true);
      expect(incomingB['isGroupCall']).toBe(true);

      participantASocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
      });

      const joinedPayload = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );
      expect(Array.isArray(joinedPayload['joinedParticipantIds'])).toBe(true);
      expect(joinedPayload['joinedParticipantIds']).toContain(caller._id.toString());
      expect(joinedPayload['joinedParticipantIds']).toContain(participantA._id.toString());

      callerSocket.emit('webrtc_offer', {
        sessionId: invited['sessionId'],
        toUserId: participantA._id.toString(),
        sdp: { type: 'offer', sdp: 'group-offer-a' },
        callToken: invited['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'webrtc_offer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === caller._id.toString(),
      );

      participantASocket.emit('webrtc_answer', {
        sessionId: invited['sessionId'],
        toUserId: caller._id.toString(),
        sdp: { type: 'answer', sdp: 'group-answer-a' },
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'webrtc_answer',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['fromUserId'] === participantA._id.toString(),
      );
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  });

  it('group call: one participant reject does not end whole room and others can still join', async () => {
    const caller = await UserModel.create({ email: 'group2-caller@test.com', displayName: 'Group2 Caller' });
    const participantA = await UserModel.create({ email: 'group2-a@test.com', displayName: 'Group2 A' });
    const participantB = await UserModel.create({ email: 'group2-b@test.com', displayName: 'Group2 B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhóm test reject',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );

      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      const incomingB = await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      participantASocket.emit('call_reject', {
        sessionId: invited['sessionId'],
        reason: 'busy',
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      await expectNoMatchingEvent<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'rejected',
        300,
      );

      participantBSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingB['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantB._id.toString(),
      );

      const refreshedSession = await CallSessionModel.findById(invited['sessionId']).lean();
      expect(refreshedSession?.status === 'ringing' || refreshedSession?.status === 'connecting').toBe(true);
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  });

  it('group call: rejected or left participant can rejoin the active room with a new group invite', async () => {
    const caller = await UserModel.create({ email: 'group-rejoin-after-left-caller@test.com', displayName: 'Group Rejoin After Left Caller' });
    const participantA = await UserModel.create({ email: 'group-rejoin-after-left-a@test.com', displayName: 'Group Rejoin After Left A' });
    const participantB = await UserModel.create({ email: 'group-rejoin-after-left-b@test.com', displayName: 'Group Rejoin After Left B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhom test rejoin after reject',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );
      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      const incomingB = await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      participantASocket.emit('call_reject', {
        sessionId: invited['sessionId'],
        reason: 'rejected',
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      participantBSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingB['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantB._id.toString(),
      );

      participantASocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_invited',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['isGroupCall'] === true,
      );

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId']
          && payload['userId'] === participantA._id.toString()
          && Array.isArray(payload['joinedParticipantIds'])
          && payload['joinedParticipantIds'].includes(participantA._id.toString()),
      );

      participantASocket.emit('call_end', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
        reason: 'left',
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      participantASocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_invited',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['isGroupCall'] === true,
      );

      const participantARecord = await CallParticipantModel.findOne({
        sessionId: invited['sessionId'],
        userId: participantA._id.toString(),
      }).lean();
      expect(participantARecord?.status).toBe('joined');

      const session = await CallSessionModel.findById(invited['sessionId']).lean();
      expect(['connecting', 'connected']).toContain(session?.status);
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  }, 15000);

  it('group call: ends when all invited peers reject and allows a new invite', async () => {
    const caller = await UserModel.create({ email: 'group-retry-caller@test.com', displayName: 'Group Retry Caller' });
    const participantA = await UserModel.create({ email: 'group-retry-a@test.com', displayName: 'Group Retry A' });
    const participantB = await UserModel.create({ email: 'group-retry-b@test.com', displayName: 'Group Retry B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhom test retry',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );
      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      const incomingB = await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      participantASocket.emit('call_reject', {
        sessionId: invited['sessionId'],
        reason: 'rejected',
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      participantBSocket.emit('call_reject', {
        sessionId: invited['sessionId'],
        reason: 'busy',
        callToken: incomingB['callToken'],
      });

      let endedSession = await CallSessionModel.findById(invited['sessionId']).lean();
      for (let attempt = 0; attempt < 20 && endedSession?.status !== 'rejected'; attempt += 1) {
        await new Promise((resolve) => { setTimeout(resolve, 100); });
        endedSession = await CallSessionModel.findById(invited['sessionId']).lean();
      }
      expect(endedSession?.status).toBe('rejected');
      expect(endedSession?.endedReason).toBe('busy');

      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });
      const secondInvited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true && payload['sessionId'] !== invited['sessionId'],
      );
      expect(secondInvited['sessionId']).toBeTruthy();
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  }, 15000);

  it('group call: non-host end call only leaves self and does not end room', async () => {
    const caller = await UserModel.create({ email: 'group3-caller@test.com', displayName: 'Group3 Caller' });
    const participantA = await UserModel.create({ email: 'group3-a@test.com', displayName: 'Group3 A' });
    const participantB = await UserModel.create({ email: 'group3-b@test.com', displayName: 'Group3 B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhóm test leave',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );

      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      participantASocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      participantASocket.emit('call_end', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
        reason: 'left',
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      await expectNoMatchingEvent<Record<string, any>>(
        callerSocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'ended',
        300,
      );

      const refreshedSession = await CallSessionModel.findById(invited['sessionId']).lean();
      expect(refreshedSession?.status === 'ringing' || refreshedSession?.status === 'connecting').toBe(true);
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  });

  it('group call: host can leave while two other participants keep the room active', async () => {
    const caller = await UserModel.create({ email: 'group-host-leave-caller@test.com', displayName: 'Group Host Leave Caller' });
    const participantA = await UserModel.create({ email: 'group-host-leave-a@test.com', displayName: 'Group Host Leave A' });
    const participantB = await UserModel.create({ email: 'group-host-leave-b@test.com', displayName: 'Group Host Leave B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhom host leave',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );
      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      const incomingB = await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const participantAJoinedPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );
      const participantBJoinedPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantB._id.toString(),
      );

      participantASocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
      });
      participantBSocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingB['callToken'],
      });

      await participantAJoinedPromise;
      await participantBJoinedPromise;

      callerSocket.emit('call_end', {
        sessionId: invited['sessionId'],
        callToken: invited['callToken'],
        reason: 'left',
      });

      await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_participant_left',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === caller._id.toString(),
      );

      await expectNoMatchingEvent<Record<string, any>>(
        participantASocket,
        'call_status',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['status'] === 'ended',
        300,
      );

      const refreshedSession = await CallSessionModel.findById(invited['sessionId']).lean();
      expect(refreshedSession?.status === 'ringing' || refreshedSession?.status === 'connecting').toBe(true);
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  }, 15000);

  it('group call: reinvite joins existing active room without notifying joined peers again', async () => {
    const caller = await UserModel.create({ email: 'group-rejoin-caller@test.com', displayName: 'Group Rejoin Caller' });
    const participantA = await UserModel.create({ email: 'group-rejoin-a@test.com', displayName: 'Group Rejoin A' });
    const participantB = await UserModel.create({ email: 'group-rejoin-b@test.com', displayName: 'Group Rejoin B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhom rejoin',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerSocket = await connectClient(issueAccessToken(caller._id.toString()));
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );
      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      const participantAJoinedPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );
      participantASocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
      });
      await participantAJoinedPromise;

      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString() });
      const rejoin = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true && payload['sessionId'] === invited['sessionId'],
      );
      expect(rejoin['callToken']).toBeTruthy();

      await expectNoMatchingEvent<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
        300,
      );
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  }, 15000);

  it('persists call_history message after group call ends and returns it from messages API', async () => {
    const caller = await UserModel.create({ email: 'history-caller@test.com', displayName: 'History Caller' });
    const participantA = await UserModel.create({ email: 'history-a@test.com', displayName: 'History A' });
    const participantB = await UserModel.create({ email: 'history-b@test.com', displayName: 'History B' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Nhom lich su cuoc goi',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participantA._id.toString(), role: 'member' },
      { conversationId: conversation._id.toString(), userId: participantB._id.toString(), role: 'member' },
    ]);

    const callerToken = issueAccessToken(caller._id.toString());
    const callerSocket = await connectClient(callerToken);
    const participantASocket = await connectClient(issueAccessToken(participantA._id.toString()));
    const participantBSocket = await connectClient(issueAccessToken(participantB._id.toString()));

    try {
      callerSocket.emit('join_conversation', { conversationId: conversation._id.toString() });
      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'conversation_active_call_updated',
        (payload) => payload['conversationId'] === conversation._id.toString(),
      );

      callerSocket.emit('call_group_invite', { conversationId: conversation._id.toString(), callType: 'video' });

      const invited = await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_invited',
        (payload) => payload['isGroupCall'] === true,
      );
      const incomingA = await waitForEventMatching<Record<string, any>>(
        participantASocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );
      await waitForEventMatching<Record<string, any>>(
        participantBSocket,
        'call_incoming',
        (payload) => payload['sessionId'] === invited['sessionId'],
      );

      participantASocket.emit('call_accept', {
        sessionId: invited['sessionId'],
        callToken: incomingA['callToken'],
      });

      await waitForEventMatching<Record<string, any>>(
        callerSocket,
        'call_participant_joined',
        (payload) => payload['sessionId'] === invited['sessionId'] && payload['userId'] === participantA._id.toString(),
      );

      const receiveHistoryPromise = waitForEventMatching<Record<string, any>>(
        callerSocket,
        'receive_message',
        (payload) => payload['conversationId'] === conversation._id.toString()
          && payload['type'] === 'call_history'
          && payload['callHistory']?.['callSessionId'] === invited['sessionId'],
      );

      callerSocket.emit('call_end', {
        sessionId: invited['sessionId'],
        callToken: invited['callToken'],
        reason: 'ended',
      });

      const receivedHistory = await receiveHistoryPromise;
      expect(receivedHistory['type']).toBe('call_history');
      expect(receivedHistory['callHistory']).toMatchObject({
        callSessionId: invited['sessionId'],
        callType: 'video',
        status: 'ended',
        callerId: caller._id.toString(),
      });

      const storedMessage = await MessageModel.findOne({
        conversationId: conversation._id.toString(),
        type: 'call_history',
      }).lean();
      expect(storedMessage).toBeTruthy();
      expect(storedMessage?.callHistory).toMatchObject({
        callSessionId: invited['sessionId'],
        callType: 'video',
        status: 'ended',
        callerId: caller._id.toString(),
      });
      expect(storedMessage?.callHistory?.startedAt).toBeTruthy();
      expect(storedMessage?.callHistory?.endedAt).toBeTruthy();
      expect(typeof storedMessage?.callHistory?.durationSeconds).toBe('number');
      expect(storedMessage?.callHistory?.participantIds).toEqual(
        expect.arrayContaining([
          caller._id.toString(),
          participantA._id.toString(),
          participantB._id.toString(),
        ]),
      );

      const response = await request(app)
        .get(`/api/messages/${conversation._id.toString()}`)
        .set('Authorization', `Bearer ${callerToken}`)
        .expect(200);

      const apiHistory = response.body.messages.find((message: Record<string, any>) => (
        message['type'] === 'call_history'
        && message['callHistory']?.['callSessionId'] === invited['sessionId']
      ));
      expect(apiHistory).toBeTruthy();
      expect(apiHistory.callHistory).toMatchObject({
        callSessionId: invited['sessionId'],
        callType: 'video',
        status: 'ended',
        callerId: caller._id.toString(),
      });
    } finally {
      disconnectSockets(callerSocket, participantASocket, participantBSocket);
    }
  }, 15000);

  it('rejects starting or accepting a second concurrent call for the same user', async () => {
    const userA = await UserModel.create({ email: 'busy-a@test.com', displayName: 'Busy A' });
    const userB = await UserModel.create({ email: 'busy-b@test.com', displayName: 'Busy B' });
    const userC = await UserModel.create({ email: 'busy-c@test.com', displayName: 'Busy C' });

    await FriendshipModel.insertMany([
      { userId: userA._id.toString(), friendId: userB._id.toString(), status: 'accepted' },
      { userId: userB._id.toString(), friendId: userA._id.toString(), status: 'accepted' },
      { userId: userA._id.toString(), friendId: userC._id.toString(), status: 'accepted' },
      { userId: userC._id.toString(), friendId: userA._id.toString(), status: 'accepted' },
      { userId: userB._id.toString(), friendId: userC._id.toString(), status: 'accepted' },
      { userId: userC._id.toString(), friendId: userB._id.toString(), status: 'accepted' },
    ]);

    const socketA = await connectClient(issueAccessToken(userA._id.toString()));
    const socketB = await connectClient(issueAccessToken(userB._id.toString()));
    const socketC = await connectClient(issueAccessToken(userC._id.toString()));

    try {
      socketA.emit('call_invite', { targetUserId: userB._id.toString() });
      const firstInvited = await waitForEventMatching<Record<string, any>>(
        socketA,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string',
      );
      const incomingForB = await waitForEventMatching<Record<string, any>>(
        socketB,
        'call_incoming',
        (payload) => payload['sessionId'] === firstInvited['sessionId'],
      );

      socketA.emit('call_invite', { targetUserId: userC._id.toString() });
      const startRejected = await waitForEventMatching<Record<string, any>>(
        socketA,
        'error',
        (payload) => String(payload['message'] ?? '').includes('Bạn đang trong một cuộc gọi khác'),
      );
      expect(startRejected['message']).toBe('Bạn đang trong một cuộc gọi khác. Vui lòng kết thúc cuộc gọi hiện tại trước.');

      socketB.emit('call_invite', { targetUserId: userC._id.toString() });
      await waitForEventMatching<Record<string, any>>(
        socketB,
        'call_invited',
        (payload) => typeof payload['sessionId'] === 'string' && payload['sessionId'] !== firstInvited['sessionId'],
      );

      socketB.emit('call_accept', {
        sessionId: firstInvited['sessionId'],
        callToken: incomingForB['callToken'],
      });
      const acceptRejected = await waitForEventMatching<Record<string, any>>(
        socketB,
        'error',
        (payload) => String(payload['message'] ?? '').includes('Bạn đang trong một cuộc gọi khác'),
      );
      expect(acceptRejected['message']).toBe('Bạn đang trong một cuộc gọi khác. Vui lòng kết thúc cuộc gọi hiện tại trước.');
    } finally {
      disconnectSockets(socketA, socketB, socketC);
    }
  }, 15000);

  it('conversation API clears stale activeCall when the referenced session is no longer active', async () => {
    const caller = await UserModel.create({ email: 'stale-active-caller@test.com', displayName: 'Stale Active Caller' });
    const participant = await UserModel.create({ email: 'stale-active-participant@test.com', displayName: 'Stale Active Participant' });

    const conversation = await ConversationModel.create({
      type: 'group',
      name: 'Stale active call group',
      createdBy: caller._id.toString(),
      adminIds: [caller._id.toString()],
    });

    await ConversationMemberModel.insertMany([
      { conversationId: conversation._id.toString(), userId: caller._id.toString(), role: 'admin' },
      { conversationId: conversation._id.toString(), userId: participant._id.toString(), role: 'member' },
    ]);

    const endedSession = await CallSessionModel.create({
      conversationId: conversation._id.toString(),
      callType: 'video',
      mode: 'sfu',
      status: 'ended',
      initiatedBy: caller._id.toString(),
      participantIds: [caller._id.toString(), participant._id.toString()],
      startedAt: new Date(Date.now() - 30_000),
      endedAt: new Date(),
      durationSeconds: 30,
      endedReason: 'ended',
    });

    await ConversationModel.findByIdAndUpdate(conversation._id, {
      activeCall: {
        callSessionId: endedSession._id.toString(),
        type: 'video',
        status: 'connected',
        startedAt: endedSession.startedAt,
        initiatedBy: caller._id.toString(),
      },
    });

    const conversations = await ConversationsService.getUserConversations(caller._id.toString());
    const resolved = conversations.find((item) => item._id === conversation._id.toString());
    expect(resolved?.activeCall).toBeNull();

    const refreshedConversation = await ConversationModel.findById(conversation._id).lean();
    expect(refreshedConversation?.activeCall).toBeUndefined();
  });
});
