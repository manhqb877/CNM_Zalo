import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const redisStore = new Map<string, string>();
const redisTtlStore = new Map<string, number>();

function createRedisMultiMock() {
  const results: Array<[null, unknown]> = [];

  const multi = {
    incr: jest.fn((key: string) => {
      const next = Number(redisStore.get(key) ?? '0') + 1;
      redisStore.set(key, String(next));
      results.push([null, next]);
      return multi;
    }),
    ttl: jest.fn((key: string) => {
      results.push([null, redisTtlStore.get(key) ?? -1]);
      return multi;
    }),
    exec: jest.fn(() => Promise.resolve(results)),
  };

  return multi;
}

const redisMock = {
  get: jest.fn(() => Promise.resolve(null)),
  multi: jest.fn(() => createRedisMultiMock()),
  expire: jest.fn((key: string, ttl: number) => {
    redisTtlStore.set(key, ttl);
    return Promise.resolve(1);
  }),
  keys: jest.fn(() => Promise.resolve([])),
  del: jest.fn(() => Promise.resolve(0)),
};

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMock,
}));

process.env['JWT_SECRET'] = 'conversations-test-secret';
process.env['JWT_REFRESH_SECRET'] = 'conversations-test-refresh-secret';
process.env['NODE_ENV'] = 'test';
process.env['ALLOW_DIRECT_MESSAGE_NON_FRIENDS'] = 'true';
process.env['NON_FRIEND_DIRECT_MESSAGE_MAX'] = '2';
process.env['NON_FRIEND_DIRECT_MESSAGE_WINDOW_SECONDS'] = '3600';

import { createApp } from '../../src/app';
import { ConversationModel } from '../../src/modules/conversations/conversation.model';
import { ConversationMemberModel } from '../../src/modules/conversations/conversation-member.model';
import { FriendshipModel } from '../../src/modules/friends/friendship.model';
import { UserModel } from '../../src/modules/users/user.model';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  redisStore.clear();
  redisTtlStore.clear();
  jest.clearAllMocks();
  await ConversationModel.deleteMany({});
  await ConversationMemberModel.deleteMany({});
  await FriendshipModel.deleteMany({});
  await UserModel.deleteMany({});
});

const app = createApp();

function issueAccessToken(userId: string, jti: string): string {
  return jwt.sign(
    { sub: userId, jti },
    process.env['JWT_SECRET'] as string,
    { expiresIn: '15m' },
  );
}

describe('Conversation routes', () => {
  it('allows non-friends to open a direct conversation without creating friendship', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'dm-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'dm-b@example.com' });
    const tokenA = issueAccessToken(userA.id as string, 'dm-a');

    const res = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id as string });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe('direct');
    expect(res.body.data.users.map((user: { _id: string }) => user._id).sort()).toEqual([
      userA.id as string,
      userB.id as string,
    ].sort());

    await expect(FriendshipModel.countDocuments({})).resolves.toBe(0);
  });

  it('returns an existing direct conversation instead of creating a duplicate', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'existing-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'existing-b@example.com' });
    const tokenA = issueAccessToken(userA.id as string, 'existing-a');

    const first = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id as string });

    const second = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id as string });

    expect(second.status).toBe(200);
    expect(second.body.data._id).toBe(first.body.data._id);
    await expect(ConversationModel.countDocuments({ type: 'direct' })).resolves.toBe(1);
  });

  it('blocks direct messages when either side has blocked the other user', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'blocked-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'blocked-b@example.com' });
    await FriendshipModel.create({
      userId: userB.id as string,
      friendId: userA.id as string,
      status: 'blocked',
    });

    const res = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${issueAccessToken(userA.id as string, 'blocked-a')}`)
      .send({ targetUserId: userB.id as string });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DIRECT_MESSAGE_BLOCKED');
  });

  it('honors friends_only message privacy for non-friends', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'privacy-a@example.com' });
    const userB = await UserModel.create({
      displayName: 'User B',
      email: 'privacy-b@example.com',
      allowMessagesFrom: 'friends_only',
    });

    const res = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${issueAccessToken(userA.id as string, 'privacy-a')}`)
      .send({ targetUserId: userB.id as string });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('DIRECT_MESSAGE_FRIENDS_ONLY');
  });

  it('rate limits new non-friend direct conversations', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'rl-a@example.com' });
    const targets = await Promise.all([
      UserModel.create({ displayName: 'Target 1', email: 'rl-1@example.com' }),
      UserModel.create({ displayName: 'Target 2', email: 'rl-2@example.com' }),
      UserModel.create({ displayName: 'Target 3', email: 'rl-3@example.com' }),
    ]);
    const tokenA = issueAccessToken(userA.id as string, 'rl-a');

    for (const target of targets.slice(0, 2)) {
      const res = await request(app)
        .post('/api/conversations/direct')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ targetUserId: target.id as string });
      expect(res.status).toBe(200);
    }

    const limited = await request(app)
      .post('/api/conversations/direct')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: targets[2].id as string });

    expect(limited.status).toBe(429);
  });
});
