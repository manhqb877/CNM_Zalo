import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

const redisStore = new Map<string, string>();
const redisMock = {
  get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  set: jest.fn((key: string, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve('OK');
  }),
  del: jest.fn((key: string) => {
    redisStore.delete(key);
    return Promise.resolve(1);
  }),
};

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMock,
}));

import { createApp } from '../../src/app';
import { UserModel } from '../../src/modules/users/user.model';
import { DeviceTokenModel } from '../../src/modules/users/device-token.model';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'users-test-secret';
  process.env['JWT_REFRESH_SECRET'] = 'users-test-refresh-secret';
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
  await UserModel.deleteMany({});
  await DeviceTokenModel.deleteMany({});
});

const app = createApp();

function issueAccessToken(userId: string, jti = 'users-jti-1'): string {
  return jwt.sign(
    { sub: userId, jti },
    process.env['JWT_SECRET'] as string,
    { expiresIn: '15m' },
  );
}

describe('Users routes', () => {
  it('GET /api/users/me should return own profile with valid token', async () => {
    const user = await UserModel.create({
      phoneNumber: '0901234567',
      displayName: 'Profile User',
    });

    const token = issueAccessToken(user.id as string);

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.displayName).toBe('Profile User');
  });

  it('PATCH /api/users/me should update profile fields', async () => {
    const user = await UserModel.create({
      email: 'phase2@example.com',
      displayName: 'Old Name',
    });

    const token = issueAccessToken(user.id as string, 'users-jti-2');

    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ displayName: 'New Name', bio: 'Bio moi' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.displayName).toBe('New Name');
    expect(res.body.user.bio).toBe('Bio moi');
  });

  it('POST /api/users/me/device-token should upsert token', async () => {
    const user = await UserModel.create({
      phoneNumber: '0912345678',
      displayName: 'Device User',
    });

    const token = issueAccessToken(user.id as string, 'users-jti-3');

    const res = await request(app)
      .post('/api/users/me/device-token')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceToken: 'device-token-abc', platform: 'web' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const stored = await DeviceTokenModel.findOne({ deviceToken: 'device-token-abc' });
    expect(stored).toBeTruthy();
    expect(stored?.userId).toBe(user.id as string);
    expect(stored?.platform).toBe('web');
  });

  it('GET /api/users/search should return matched users', async () => {
    const owner = await UserModel.create({
      email: 'owner-search@example.com',
      displayName: 'Owner Search',
    });

    await UserModel.create({
      email: 'nguyen.a@example.com',
      displayName: 'Nguyen Van A',
    });
    await UserModel.create({
      email: 'tran.b@example.com',
      displayName: 'Tran Thi B',
    });

    const token = issueAccessToken(owner.id as string, 'users-jti-search');

    const res = await request(app)
      .get('/api/users/search?query=nguyen&limit=10')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.some((u: { displayName: string }) => u.displayName === 'Nguyen Van A')).toBe(true);
  });

  it('should reject revoked access token from blacklist', async () => {
    const user = await UserModel.create({
      email: 'revoked@example.com',
      displayName: 'Revoked User',
    });

    const token = issueAccessToken(user.id as string, 'users-jti-revoked');
    redisStore.set('blacklist:token:users-jti-revoked', '1');

    const res = await request(app)
      .get('/api/users/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/revoked/i);
  });
});
