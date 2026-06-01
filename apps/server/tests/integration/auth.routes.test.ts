import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ─── Mock Redis ───────────────────────────────────────────────────────────────
const redisStore = new Map<string, string>();
const redisMock = {
  get: jest.fn((key: string) => Promise.resolve(redisStore.get(key) ?? null)),
  set: jest.fn((key: string, value: string, _ex: string, _ttl: number) => {
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

// ─── Skip real OTP send ───────────────────────────────────────────────────────
jest.mock('../../src/modules/auth/otp.service', () => {
  const actual = jest.requireActual<typeof import('../../src/modules/auth/otp.service')>(
    '../../src/modules/auth/otp.service',
  );
  return {
    ...actual,
    sendOtp: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
});

jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();
  return {
    OAuth2Client: jest.fn().mockImplementation(() => ({
      verifyIdToken,
    })),
    __verifyIdTokenMock: verifyIdToken,
  };
});

// ─── Must import app AFTER mocks are set up ──────────────────────────────────
import { createApp } from '../../src/app';
import { UserModel } from '../../src/modules/users/user.model';

const { __verifyIdTokenMock } = jest.requireMock('google-auth-library') as {
  __verifyIdTokenMock: jest.Mock;
};

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'test-jwt-secret';
  process.env['JWT_REFRESH_SECRET'] = 'test-refresh-secret';
  process.env['OTP_HARDCODE'] = 'true';
  process.env['OTP_HARDCODE_VALUE'] = '123456';
  process.env['NODE_ENV'] = 'test';
  process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id.apps.googleusercontent.com';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await mongoose.connection.db?.dropDatabase();
  redisStore.clear();
  jest.clearAllMocks();
  // Restore get/set/del to use the in-memory store
  redisMock.get.mockImplementation((key: string) =>
    Promise.resolve(redisStore.get(key) ?? null),
  );
  redisMock.set.mockImplementation((key: string, value: string) => {
    redisStore.set(key, value);
    return Promise.resolve('OK');
  });
  redisMock.del.mockImplementation((key: string) => {
    redisStore.delete(key);
    return Promise.resolve(1);
  });
  __verifyIdTokenMock.mockReset();
});

const app = createApp();

// ─── POST /api/auth/register ──────────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('should return 200 and send OTP for valid phone', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ identifier: '0901234567' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/OTP sent/i);
  });

  it('should return 400 for missing identifier', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for identifier that is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ identifier: 'ab' });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/verify-otp ────────────────────────────────────────────────

describe('POST /api/auth/verify-otp', () => {
  beforeEach(async () => {
    // Seed OTP in Redis
    await request(app)
      .post('/api/auth/register')
      .send({ identifier: '0901234567' });
  });

  it('should return 200 with accessToken for correct OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        identifier: '0901234567',
        otp: '123456',
        displayName: 'Test User',
        password: 'Secret123!',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toBeDefined();
    // Refresh token should be in http-only cookie
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 for wrong OTP', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        identifier: '0901234567',
        otp: '000000',
        displayName: 'Test User',
        password: 'Secret123!',
      });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid OTP format (non-numeric)', async () => {
    const res = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        identifier: '0901234567',
        otp: 'abcdef',
        displayName: 'Test User',
        password: 'Secret123!',
      });

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/auth/refresh ───────────────────────────────────────────────────

describe('POST /api/auth/refresh', () => {
  it('should return new access token with valid refresh token cookie', async () => {
    // 1. Register + OTP → get cookie
    await request(app).post('/api/auth/register').send({ identifier: '0911111111' });

    const loginRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        identifier: '0911111111',
        otp: '123456',
        displayName: 'Refresh User',
        password: 'Secret123!',
      });

    const cookie = loginRes.headers['set-cookie'] as unknown as string[];

    // 2. Use cookie to refresh
    const res = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });

  it('should return 401 when no refresh token cookie', async () => {
    const res = await request(app).post('/api/auth/refresh');
    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/logout ────────────────────────────────────────────────────

describe('POST /api/auth/logout', () => {
  it('should clear cookie and blacklist token on logout', async () => {
    // 1. Register + login
    await request(app).post('/api/auth/register').send({ identifier: '0922222222' });
    const loginRes = await request(app)
      .post('/api/auth/verify-otp')
      .send({
        identifier: '0922222222',
        otp: '123456',
        displayName: 'Logout User',
        password: 'Secret123!',
      });

    const { accessToken } = loginRes.body as { accessToken: string };
    const cookie = loginRes.headers['set-cookie'] as unknown as string[];

    // 2. Logout
    const res = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Cookie should be cleared
    const setCookie = (res.headers['set-cookie'] as unknown as string[]) ?? [];
    const refreshCookie = setCookie.find((c: string) => c.startsWith('refreshToken='));
    expect(refreshCookie).toMatch(/(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  });
});

// ─── POST /api/auth/login-password/request-otp ──────────────────────────────

describe('POST /api/auth/login-password/request-otp', () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    await UserModel.create({
      email: 'pwd-user@test.com',
      displayName: 'Pwd User',
      passwordHash,
    });
  });

  it('should return 200 for valid email/password', async () => {
    const res = await request(app)
      .post('/api/auth/login-password/request-otp')
      .send({ email: 'pwd-user@test.com', password: 'Secret123!' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 401 for invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login-password/request-otp')
      .send({ email: 'pwd-user@test.com', password: 'WrongPass123!' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/login-password/verify-otp ───────────────────────────────

describe('POST /api/auth/login-password/verify-otp', () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    await UserModel.create({
      email: 'pwd-verify@test.com',
      displayName: 'Pwd Verify',
      passwordHash,
    });

    await request(app)
      .post('/api/auth/login-password/request-otp')
      .send({ email: 'pwd-verify@test.com', password: 'Secret123!' });
  });

  it('should return 200 with access token for valid password and OTP', async () => {
    const res = await request(app)
      .post('/api/auth/login-password/verify-otp')
      .send({
        email: 'pwd-verify@test.com',
        password: 'Secret123!',
        otp: '123456',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 for invalid OTP', async () => {
    const res = await request(app)
      .post('/api/auth/login-password/verify-otp')
      .send({
        email: 'pwd-verify@test.com',
        password: 'Secret123!',
        otp: '000000',
      });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/forgot-password/request-otp ────────────────────────────

describe('POST /api/auth/forgot-password/request-otp', () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('Secret123!', 10);
    await UserModel.create({
      email: 'forgot-user@test.com',
      displayName: 'Forgot User',
      passwordHash,
    });
  });

  it('should return 200 when email exists', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password/request-otp')
      .send({ email: 'forgot-user@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should return 401 when email does not exist', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password/request-otp')
      .send({ email: 'missing-user@test.com' });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/forgot-password/reset ──────────────────────────────────

describe('POST /api/auth/forgot-password/reset', () => {
  beforeEach(async () => {
    const passwordHash = await bcrypt.hash('OldPass123!', 10);
    await UserModel.create({
      email: 'forgot-reset@test.com',
      displayName: 'Forgot Reset',
      passwordHash,
    });

    await request(app)
      .post('/api/auth/forgot-password/request-otp')
      .send({ email: 'forgot-reset@test.com' });
  });

  it('should reset password with valid OTP', async () => {
    const resetRes = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({
        email: 'forgot-reset@test.com',
        otp: '123456',
        newPassword: 'NewPass123!',
      });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const loginRequestRes = await request(app)
      .post('/api/auth/login-password/request-otp')
      .send({ email: 'forgot-reset@test.com', password: 'NewPass123!' });

    expect(loginRequestRes.status).toBe(200);
  });

  it('should return 401 with invalid OTP', async () => {
    const res = await request(app)
      .post('/api/auth/forgot-password/reset')
      .send({
        email: 'forgot-reset@test.com',
        otp: '000000',
        newPassword: 'NewPass123!',
      });

    expect(res.status).toBe(401);
  });
});

// ─── POST /api/auth/google ───────────────────────────────────────────────────

describe('POST /api/auth/google', () => {
  it('should return 200 and issue JWT for valid Google token', async () => {
    __verifyIdTokenMock.mockImplementation(async () => ({
      getPayload: () => ({
        email: 'google-user@test.com',
        email_verified: true,
        name: 'Google User',
        picture: 'https://example.com/avatar.png',
      }),
    }));

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'google-id-token-sample-1234567890' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user.email).toBe('google-user@test.com');
    expect(res.headers['set-cookie']).toBeDefined();
  });

  it('should return 401 when Google token is invalid', async () => {
    __verifyIdTokenMock.mockImplementation(async () => {
      throw new Error('Invalid token');
    });

    const res = await request(app)
      .post('/api/auth/google')
      .send({ idToken: 'invalid-token-1234567890' });

    expect(res.status).toBe(401);
  });
});
