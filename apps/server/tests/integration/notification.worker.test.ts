import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// ─── Mock Redis ─────────────────────────────────────────────────────────────

const redisStore = new Map<string, string>();
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
  del: jest.fn((key: string) => {
    redisStore.delete(key);
    return Promise.resolve(1);
  }),
};

let mockOnlineStatus: string | null = null;

jest.mock('../../src/infrastructure/redis', () => ({
  getRedis: () => redisMock,
  getUserOnlineStatus: jest.fn(() => Promise.resolve(mockOnlineStatus)),
}));

// ─── Mock Kafka ─────────────────────────────────────────────────────────────

jest.mock('../../src/infrastructure/kafka', () => ({
  createConsumer: jest.fn(),
  produceMessage: jest.fn(),
  KAFKA_TOPICS: { NOTIFICATIONS: 'notifications' },
}));

// ─── Mock FCM ───────────────────────────────────────────────────────────────

const mockSendFCM = jest.fn<(tokens: unknown, notif: unknown, data: unknown) => Promise<{ successCount: number; expiredTokens: string[] }>>();
let mockFCMConfigured = true;

jest.mock('../../src/infrastructure/fcm', () => ({
  isFCMConfigured: () => mockFCMConfigured,
  sendFCMNotification: (tokens: unknown, notif: unknown, data: unknown) => mockSendFCM(tokens, notif, data),
}));

// ─── Mock Web Push ──────────────────────────────────────────────────────────

const mockSendWebPush = jest.fn<(sub: unknown, payload: unknown) => Promise<{ success: boolean; expired: boolean }>>();
let mockWebPushConfigured = false;

jest.mock('../../src/infrastructure/web-push', () => ({
  isWebPushConfigured: () => mockWebPushConfigured,
  sendWebPush: (sub: unknown, payload: unknown) => mockSendWebPush(sub, payload),
}));

// ─── Mock Socket.IO ─────────────────────────────────────────────────────────

const mockEmitNotification = jest.fn<(userId: unknown, notification: unknown) => void>();

jest.mock('../../src/socket/gateway', () => ({
  emitNotification: (userId: unknown, notification: unknown) => mockEmitNotification(userId, notification),
}));

// ─── Mock logger ────────────────────────────────────────────────────────────

jest.mock('../../src/shared/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

import { NotificationModel } from '../../src/modules/notifications/notification.model';
import { NotificationPreferenceModel } from '../../src/modules/notifications/notification-preference.model';
import { DeviceTokenModel } from '../../src/modules/users/device-token.model';

let mongoServer: MongoMemoryServer;

/**
 * We test the internal `processNotification` logic by importing the worker
 * module and simulating Kafka message processing. Instead of starting the
 * real consumer, we directly invoke the eachMessage handler.
 */

let processNotification: (payload: {
  userId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
}) => Promise<void>;

beforeAll(async () => {
  process.env['NODE_ENV'] = 'test';

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  // Capture eachMessage handler
  const { createConsumer } = await import('../../src/infrastructure/kafka');
  let eachMessageHandler: (arg: { message: { value: Buffer | null } }) => Promise<void>;

  (createConsumer as jest.Mock).mockReturnValue({
    connect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    subscribe: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    run: jest.fn(async (opts: { eachMessage: typeof eachMessageHandler }) => {
      eachMessageHandler = opts.eachMessage;
    }),
    disconnect: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  });

  const { startNotificationWorker } = await import('../../src/workers/notification.worker');
  await startNotificationWorker();

  processNotification = async (payload) => {
    await eachMessageHandler!({
      message: { value: Buffer.from(JSON.stringify(payload)) },
    });
  };
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  redisStore.clear();
  jest.clearAllMocks();
  mockOnlineStatus = null;
  mockFCMConfigured = true;
  mockWebPushConfigured = false;
  mockSendFCM.mockResolvedValue({ successCount: 1, expiredTokens: [] });
  mockSendWebPush.mockResolvedValue({ success: true, expired: false });
  await NotificationModel.deleteMany({});
  await NotificationPreferenceModel.deleteMany({});
  await DeviceTokenModel.deleteMany({});
});

const USER_ID = 'worker-user-001';
const CONV_ID = 'worker-conv-001';

describe('Notification Worker', () => {
  it('should save notification to DB and emit socket event', async () => {
    await processNotification({
      userId: USER_ID,
      type: 'friend_request',
      title: 'Lời mời kết bạn',
      body: 'Ai đó muốn kết bạn',
    });

    const saved = await NotificationModel.findOne({ userId: USER_ID });
    expect(saved).toBeTruthy();
    expect(saved?.type).toBe('friend_request');
    expect(saved?.read).toBe(false);

    expect(mockEmitNotification).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ type: 'friend_request' }),
    );
  });

  it('should skip push when conversation is muted', async () => {
    await NotificationPreferenceModel.create({
      userId: USER_ID,
      mutedConversations: [CONV_ID],
      enablePush: true,
      enableSound: true,
      enableBadge: true,
    });

    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-token-muted',
    });

    await processNotification({
      userId: USER_ID,
      type: 'new_message',
      title: 'Tin nhắn',
      body: 'Hello',
      conversationId: CONV_ID,
    });

    // Notification must NOT be saved for muted conversations
    const saved = await NotificationModel.findOne({ userId: USER_ID });
    expect(saved).toBeNull();

    // But FCM should NOT be called
    expect(mockSendFCM).not.toHaveBeenCalled();
    expect(mockEmitNotification).not.toHaveBeenCalled();
  });

  it('should skip push when user is online (new_message only)', async () => {
    mockOnlineStatus = Date.now().toString();

    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-token-online',
    });

    await processNotification({
      userId: USER_ID,
      type: 'new_message',
      title: 'Tin nhắn',
      body: 'Hello',
      conversationId: CONV_ID,
    });

    expect(mockSendFCM).not.toHaveBeenCalled();
  });

  it('should still push for friend_request even if user is online', async () => {
    mockOnlineStatus = Date.now().toString();

    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-token-friend',
    });

    await processNotification({
      userId: USER_ID,
      type: 'friend_request',
      title: 'Kết bạn',
      body: 'Ai đó muốn kết bạn',
    });

    expect(mockSendFCM).toHaveBeenCalledWith(
      ['fcm-token-friend'],
      { title: 'Kết bạn', body: 'Ai đó muốn kết bạn' },
      {},
    );
  });

  it('should send FCM to android tokens', async () => {
    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-android-token',
    });

    await processNotification({
      userId: USER_ID,
      type: 'group_invite',
      title: 'Nhóm mới',
      body: 'Bạn được mời vào nhóm',
    });

    expect(mockSendFCM).toHaveBeenCalledWith(
      ['fcm-android-token'],
      { title: 'Nhóm mới', body: 'Bạn được mời vào nhóm' },
      {},
    );
  });

  it('should send Web Push to web tokens with pushSubscription', async () => {
    mockWebPushConfigured = true;
    mockFCMConfigured = false;

    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'web',
      deviceToken: 'https://push.example.com/sub/test',
      pushSubscription: {
        endpoint: 'https://push.example.com/sub/test',
        keys: { p256dh: 'key1', auth: 'key2' },
      },
    });

    await processNotification({
      userId: USER_ID,
      type: 'post_like',
      title: 'Reaction',
      body: 'Ai đó thả tim bài viết',
    });

    expect(mockSendWebPush).toHaveBeenCalledTimes(1);
    const callArgs = mockSendWebPush.mock.calls[0]!;
    const subArg = callArgs[0] as { endpoint: string; keys: { p256dh: string; auth: string } };
    expect(subArg.endpoint).toBe('https://push.example.com/sub/test');
    expect(subArg.keys.p256dh).toBe('key1');
    expect(subArg.keys.auth).toBe('key2');
    expect(typeof callArgs[1]).toBe('string');
  });

  it('should clean expired FCM tokens', async () => {
    const dt = await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'expired-fcm-token',
    });

    mockSendFCM.mockResolvedValue({
      successCount: 0,
      expiredTokens: ['expired-fcm-token'],
    });

    await processNotification({
      userId: USER_ID,
      type: 'friend_accepted',
      title: 'Đã chấp nhận',
      body: 'Bạn bè mới',
    });

    const remaining = await DeviceTokenModel.findById(dt._id);
    expect(remaining).toBeNull();
  });

  it('should clean expired Web Push subscriptions', async () => {
    mockWebPushConfigured = true;

    const dt = await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'web',
      deviceToken: 'https://push.example.com/sub/expired',
      pushSubscription: {
        endpoint: 'https://push.example.com/sub/expired',
        keys: { p256dh: 'k1', auth: 'k2' },
      },
    });

    mockSendWebPush.mockResolvedValue({ success: false, expired: true });

    await processNotification({
      userId: USER_ID,
      type: 'post_comment',
      title: 'Comment',
      body: 'Ai đó bình luận bài viết',
    });

    const remaining = await DeviceTokenModel.findById(dt._id);
    expect(remaining).toBeNull();
  });

  it('should debounce rapid new_message notifications', async () => {
    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-debounce',
    });

    // First message: should trigger push
    await processNotification({
      userId: USER_ID,
      type: 'new_message',
      title: 'Msg 1',
      body: 'Hello 1',
      conversationId: CONV_ID,
    });

    expect(mockSendFCM).toHaveBeenCalledTimes(1);

    // Second message: should be debounced
    await processNotification({
      userId: USER_ID,
      type: 'new_message',
      title: 'Msg 2',
      body: 'Hello 2',
      conversationId: CONV_ID,
    });

    // FCM still called only once (debounced)
    expect(mockSendFCM).toHaveBeenCalledTimes(1);

    // But notification is still saved
    const count = await NotificationModel.countDocuments({ userId: USER_ID });
    expect(count).toBe(2);
  });

  it('should skip push when enablePush is false', async () => {
    await NotificationPreferenceModel.create({
      userId: USER_ID,
      mutedConversations: [],
      enablePush: false,
      enableSound: true,
      enableBadge: true,
    });

    await DeviceTokenModel.create({
      userId: USER_ID,
      platform: 'android',
      deviceToken: 'fcm-disabled',
    });

    await processNotification({
      userId: USER_ID,
      type: 'friend_request',
      title: 'Test',
      body: 'Test',
    });

    expect(mockSendFCM).not.toHaveBeenCalled();
    expect(mockEmitNotification).not.toHaveBeenCalled();
  });
});
