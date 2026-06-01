import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';

// ─── Mock Redis ─────────────────────────────────────────────────────────────

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

// ─── Mock Kafka ─────────────────────────────────────────────────────────────

jest.mock('../../src/infrastructure/kafka', () => ({
  produceMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  KAFKA_TOPICS: { NOTIFICATIONS: 'notifications' },
}));

// ─── Mock Web Push infrastructure ───────────────────────────────────────────

jest.mock('../../src/infrastructure/web-push', () => ({
  isWebPushConfigured: () => false,
  getVapidPublicKey: () => 'fake-vapid-key',
  sendWebPush: jest.fn(),
}));

import { createApp } from '../../src/app';
import { UserModel } from '../../src/modules/users/user.model';
import { NotificationModel } from '../../src/modules/notifications/notification.model';
import { NotificationPreferenceModel } from '../../src/modules/notifications/notification-preference.model';
import { DeviceTokenModel } from '../../src/modules/users/device-token.model';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  process.env['JWT_SECRET'] = 'notif-test-secret';
  process.env['JWT_REFRESH_SECRET'] = 'notif-test-refresh-secret';
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
  await NotificationModel.deleteMany({});
  await NotificationPreferenceModel.deleteMany({});
  await DeviceTokenModel.deleteMany({});
});

const app = createApp();

function issueToken(userId: string, jti = 'notif-jti-1'): string {
  return jwt.sign(
    { sub: userId, jti },
    process.env['JWT_SECRET'] as string,
    { expiresIn: '15m' },
  );
}

// ─── CRUD Notifications ─────────────────────────────────────────────────────

describe('Notification CRUD routes', () => {
  it('GET /api/notifications should return empty list initially', async () => {
    const user = await UserModel.create({ email: 'test@test.com', displayName: 'Test' });
    const token = issueToken(user.id as string);

    const res = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.notifications).toEqual([]);
    expect(res.body.nextCursor).toBeNull();
  });

  it('GET /api/notifications should return paginated results', async () => {
    const user = await UserModel.create({ email: 'pag@test.com', displayName: 'Pag' });
    const token = issueToken(user.id as string, 'notif-jti-pag');

    for (let i = 0; i < 5; i++) {
      await NotificationModel.create({
        userId: user.id,
        type: 'new_message',
        title: `N${i}`,
        body: `Body ${i}`,
        read: false,
      });
    }

    const res1 = await request(app)
      .get('/api/notifications?limit=3')
      .set('Authorization', `Bearer ${token}`);

    expect(res1.status).toBe(200);
    expect(res1.body.notifications).toHaveLength(3);
    expect(res1.body.nextCursor).toBeTruthy();

    const res2 = await request(app)
      .get(`/api/notifications?limit=3&cursor=${res1.body.nextCursor}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res2.status).toBe(200);
    expect(res2.body.notifications).toHaveLength(2);
    expect(res2.body.nextCursor).toBeNull();
  });

  it('GET /api/notifications/unread-count should return correct count', async () => {
    const user = await UserModel.create({ email: 'count@test.com', displayName: 'Count' });
    const token = issueToken(user.id as string, 'notif-jti-count');

    await NotificationModel.create([
      { userId: user.id, type: 'new_message', title: 'T1', body: 'B1', read: false },
      { userId: user.id, type: 'friend_request', title: 'T2', body: 'B2', read: false },
      { userId: user.id, type: 'group_invite', title: 'T3', body: 'B3', read: true },
    ]);

    const res = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
  });

  it('PATCH /api/notifications/read should mark specified notifications', async () => {
    const user = await UserModel.create({ email: 'read@test.com', displayName: 'Read' });
    const token = issueToken(user.id as string, 'notif-jti-read');

    const n = await NotificationModel.create({
      userId: user.id,
      type: 'new_message',
      title: 'Unread',
      body: 'Body',
      read: false,
    });

    const res = await request(app)
      .patch('/api/notifications/read')
      .set('Authorization', `Bearer ${token}`)
      .send({ notificationIds: [n._id.toString()] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.modified).toBe(1);
  });

  it('PATCH /api/notifications/read-all should mark all as read', async () => {
    const user = await UserModel.create({ email: 'readall@test.com', displayName: 'ReadAll' });
    const token = issueToken(user.id as string, 'notif-jti-readall');

    await NotificationModel.create([
      { userId: user.id, type: 'new_message', title: 'T1', body: 'B1', read: false },
      { userId: user.id, type: 'new_message', title: 'T2', body: 'B2', read: false },
    ]);

    const res = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.modified).toBe(2);
  });
});

// ─── Mute / Unmute ──────────────────────────────────────────────────────────

describe('Mute/Unmute routes', () => {
  it('POST /api/notifications/mute/:convId should mute', async () => {
    const user = await UserModel.create({ email: 'mute@test.com', displayName: 'Mute' });
    const token = issueToken(user.id as string, 'notif-jti-mute');

    const res = await request(app)
      .post('/api/notifications/mute/conv-123')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const pref = await NotificationPreferenceModel.findOne({ userId: user.id });
    expect(pref?.mutedConversations).toContain('conv-123');
  });

  it('DELETE /api/notifications/mute/:convId should unmute', async () => {
    const user = await UserModel.create({ email: 'unmute@test.com', displayName: 'Unmute' });
    const token = issueToken(user.id as string, 'notif-jti-unmute');

    await NotificationPreferenceModel.create({
      userId: user.id,
      mutedConversations: ['conv-456'],
      enablePush: true,
      enableSound: true,
      enableBadge: true,
    });

    const res = await request(app)
      .delete('/api/notifications/mute/conv-456')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    const pref = await NotificationPreferenceModel.findOne({ userId: user.id });
    expect(pref?.mutedConversations).not.toContain('conv-456');
  });
});

// ─── Preferences ────────────────────────────────────────────────────────────

describe('Preferences routes', () => {
  it('GET /api/notifications/preferences should return default prefs', async () => {
    const user = await UserModel.create({ email: 'pref@test.com', displayName: 'Pref' });
    const token = issueToken(user.id as string, 'notif-jti-pref');

    const res = await request(app)
      .get('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.enablePush).toBe(true);
    expect(res.body.data.enableSound).toBe(true);
  });

  it('PATCH /api/notifications/preferences should update toggles', async () => {
    const user = await UserModel.create({ email: 'upd@test.com', displayName: 'Upd' });
    const token = issueToken(user.id as string, 'notif-jti-upd');

    const res = await request(app)
      .patch('/api/notifications/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({ enablePush: false, enableSound: false });

    expect(res.status).toBe(200);
    expect(res.body.data.enablePush).toBe(false);
    expect(res.body.data.enableSound).toBe(false);
    expect(res.body.data.enableBadge).toBe(true);
  });
});

// ─── Web Push ───────────────────────────────────────────────────────────────

describe('Web Push routes', () => {
  it('POST /api/notifications/web-push/subscribe should upsert device token', async () => {
    const user = await UserModel.create({ email: 'wp@test.com', displayName: 'WP' });
    const token = issueToken(user.id as string, 'notif-jti-wp');

    const res = await request(app)
      .post('/api/notifications/web-push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://push.example.com/sub/123',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const dt = await DeviceTokenModel.findOne({ userId: user.id });
    expect(dt?.pushSubscription?.endpoint).toBe('https://push.example.com/sub/123');
  });

  it('DELETE /api/notifications/web-push/unsubscribe should remove subscription', async () => {
    const user = await UserModel.create({ email: 'wpdel@test.com', displayName: 'WPD' });
    const token = issueToken(user.id as string, 'notif-jti-wpdel');

    await DeviceTokenModel.create({
      userId: user.id,
      platform: 'web',
      deviceToken: 'https://push.example.com/sub/456',
      pushSubscription: {
        endpoint: 'https://push.example.com/sub/456',
        keys: { p256dh: 'key1', auth: 'key2' },
      },
    });

    const res = await request(app)
      .delete('/api/notifications/web-push/unsubscribe')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it('GET /api/notifications/web-push/vapid-key should return key', async () => {
    const user = await UserModel.create({ email: 'vk@test.com', displayName: 'VK' });
    const token = issueToken(user.id as string, 'notif-jti-vk');

    const res = await request(app)
      .get('/api/notifications/web-push/vapid-key')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.vapidPublicKey).toBe('fake-vapid-key');
  });
});

// ─── Auth guard ─────────────────────────────────────────────────────────────

describe('Auth guard', () => {
  it('should reject unauthenticated requests', async () => {
    const res = await request(app).get('/api/notifications');
    expect(res.status).toBe(401);
  });
});
