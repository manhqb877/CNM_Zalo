import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

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

const redisMock = {
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
  keys: jest.fn((pattern: string) => {
    if (!pattern.endsWith('*')) {
      return Promise.resolve(redisStore.has(pattern) ? [pattern] : []);
    }

    const prefix = pattern.slice(0, -1);
    const matched = [...redisStore.keys()].filter((key) => key.startsWith(prefix));
    return Promise.resolve(matched);
  }),
  pipeline: jest.fn(() => createRedisPipelineMock()),
};

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMock,
}));

import { createApp } from '../../src/app';
import { FriendshipModel } from '../../src/modules/friends/friendship.model';
import { UserModel } from '../../src/modules/users/user.model';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'friends-test-secret';
  process.env['JWT_REFRESH_SECRET'] = 'friends-test-refresh-secret';
  process.env['NODE_ENV'] = 'test';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  redisStore.clear();
  jest.clearAllMocks();
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

describe('Friends routes', () => {
  it('should send and accept friend request', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'b@example.com' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-a1');
    const tokenB = issueAccessToken(userB.id as string, 'friends-jti-b1');

    const sendRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ toUserId: userB.id as string });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);

    const requestId = sendRes.body.request._id as string;

    const acceptRes = await request(app)
      .put(`/api/friends/request/${requestId}/accept`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(acceptRes.status).toBe(200);
    expect(acceptRes.body.success).toBe(true);

    const relations = await FriendshipModel.find({ status: 'accepted' });
    expect(relations).toHaveLength(2);
  });

  it('should accept targetUserId alias when sending a friend request', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'alias-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'alias-b@example.com' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-alias-a');

    const sendRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ targetUserId: userB.id as string });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.request.friendId).toBe(userB.id as string);
  });

  it('should auto-accept a reverse pending request', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'reverse-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'reverse-b@example.com' });

    await FriendshipModel.create({
      userId: userB.id as string,
      friendId: userA.id as string,
      status: 'pending',
    });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-reverse-a');

    const sendRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ toUserId: userB.id as string });

    expect(sendRes.status).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.request.status).toBe('accepted');

    const relations = await FriendshipModel.find({
      status: 'accepted',
      $or: [
        { userId: userA.id as string, friendId: userB.id as string },
        { userId: userB.id as string, friendId: userA.id as string },
      ],
    });
    expect(relations).toHaveLength(2);
  });

  it('should reject friend request', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'ra@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'rb@example.com' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-a2');
    const tokenB = issueAccessToken(userB.id as string, 'friends-jti-b2');

    const sendRes = await request(app)
      .post('/api/friends/request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ toUserId: userB.id as string });

    const requestId = sendRes.body.request._id as string;

    const rejectRes = await request(app)
      .put(`/api/friends/request/${requestId}/reject`)
      .set('Authorization', `Bearer ${tokenB}`);

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);

    const pending = await FriendshipModel.findById(requestId);
    expect(pending).toBeNull();
  });

  it('should list friends with cursor structure and cache', async () => {
    const owner = await UserModel.create({ displayName: 'Owner', email: 'owner@example.com' });
    const friend1 = await UserModel.create({ displayName: 'Friend 1', email: 'f1@example.com' });
    const friend2 = await UserModel.create({ displayName: 'Friend 2', email: 'f2@example.com' });

    await FriendshipModel.create({ userId: owner.id as string, friendId: friend1.id as string, status: 'accepted' });
    await FriendshipModel.create({ userId: owner.id as string, friendId: friend2.id as string, status: 'accepted' });

    const tokenOwner = issueAccessToken(owner.id as string, 'friends-jti-owner');

    const res = await request(app)
      .get('/api/friends?limit=1')
      .set('Authorization', `Bearer ${tokenOwner}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.friends)).toBe(true);
    expect(res.body.friends).toHaveLength(1);
    expect(typeof res.body.nextCursor === 'string' || res.body.nextCursor === null).toBe(true);

    const cachedKeys = [...redisStore.keys()].filter((key) => key.startsWith(`friends:${owner.id}:`));
    expect(cachedKeys.length).toBeGreaterThan(0);
  });

  it('should list incoming and outgoing pending requests', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'list-a@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'list-b@example.com' });
    const userC = await UserModel.create({ displayName: 'User C', email: 'list-c@example.com' });

    await FriendshipModel.create({ userId: userA.id as string, friendId: userB.id as string, status: 'pending' });
    await FriendshipModel.create({ userId: userC.id as string, friendId: userA.id as string, status: 'pending' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-list-req');
    const res = await request(app)
      .get('/api/friends/requests')
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.outgoing).toHaveLength(1);
    expect(res.body.incoming).toHaveLength(1);
  });

  it('should unfriend successfully', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'ua@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'ub@example.com' });

    await FriendshipModel.create({ userId: userA.id as string, friendId: userB.id as string, status: 'accepted' });
    await FriendshipModel.create({ userId: userB.id as string, friendId: userA.id as string, status: 'accepted' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-a3');

    const res = await request(app)
      .delete(`/api/friends/${userB.id}`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);

    const remained = await FriendshipModel.find({
      $or: [
        { userId: userA.id as string, friendId: userB.id as string },
        { userId: userB.id as string, friendId: userA.id as string },
      ],
    });
    expect(remained).toHaveLength(0);
  });

  it('should block and unblock user', async () => {
    const userA = await UserModel.create({ displayName: 'User A', email: 'ba@example.com' });
    const userB = await UserModel.create({ displayName: 'User B', email: 'bb@example.com' });

    const tokenA = issueAccessToken(userA.id as string, 'friends-jti-a4');

    const blockRes = await request(app)
      .post(`/api/friends/${userB.id}/block`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(blockRes.status).toBe(200);
    expect(blockRes.body.success).toBe(true);

    const blocked = await FriendshipModel.findOne({
      userId: userA.id as string,
      friendId: userB.id as string,
      status: 'blocked',
    });
    expect(blocked).toBeTruthy();

    const unblockRes = await request(app)
      .delete(`/api/friends/${userB.id}/block`)
      .set('Authorization', `Bearer ${tokenA}`);

    expect(unblockRes.status).toBe(200);
    expect(unblockRes.body.success).toBe(true);
  });
});
