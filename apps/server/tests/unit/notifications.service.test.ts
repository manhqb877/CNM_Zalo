import { jest, describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

jest.mock('../../src/infrastructure/kafka', () => ({
  produceMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  KAFKA_TOPICS: { NOTIFICATIONS: 'notifications' },
}));

import {
  createNotification,
  produceNotificationEvent,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  isConversationMuted,
  muteConversation,
  unmuteConversation,
  getPreferences,
  updatePreferences,
} from '../../src/modules/notifications/notifications.service';
import { NotificationModel } from '../../src/modules/notifications/notification.model';
import { NotificationPreferenceModel } from '../../src/modules/notifications/notification-preference.model';
import { produceMessage } from '../../src/infrastructure/kafka';

let mongoServer: MongoMemoryServer;
const TEST_USER = 'user-001';
const TEST_CONV = 'conv-001';

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  jest.clearAllMocks();
  await NotificationModel.deleteMany({});
  await NotificationPreferenceModel.deleteMany({});
});

// ─── createNotification ─────────────────────────────────────────────────────

describe('createNotification()', () => {
  it('should create and return a notification document', async () => {
    const doc = await createNotification(
      TEST_USER,
      'new_message',
      'Tin nhắn mới',
      'Bạn có 1 tin nhắn',
      { key: 'val' },
      TEST_CONV,
      'sender-001',
    );

    expect(doc.userId).toBe(TEST_USER);
    expect(doc.type).toBe('new_message');
    expect(doc.title).toBe('Tin nhắn mới');
    expect(doc.read).toBe(false);
    expect(doc.conversationId).toBe(TEST_CONV);
    expect(doc._id).toBeDefined();
  });
});

// ─── produceNotificationEvent ───────────────────────────────────────────────

describe('produceNotificationEvent()', () => {
  it('should call produceMessage with correct topic and key', async () => {
    await produceNotificationEvent({
      userId: TEST_USER,
      type: 'friend_request',
      title: 'Lời mời kết bạn',
      body: 'Ai đó muốn kết bạn',
    });

    expect(produceMessage).toHaveBeenCalledWith(
      'notifications',
      TEST_USER,
      expect.objectContaining({ userId: TEST_USER, type: 'friend_request' }),
    );
  });

  it('should not throw when Kafka fails', async () => {
    (produceMessage as jest.Mock).mockRejectedValueOnce(new Error('Kafka down') as never);

    await expect(
      produceNotificationEvent({
        userId: TEST_USER,
        type: 'friend_request',
        title: 'Test',
        body: 'Test',
      }),
    ).resolves.toBeUndefined();
  });
});

// ─── getNotifications (cursor pagination) ───────────────────────────────────

describe('getNotifications()', () => {
  it('should return notifications sorted by createdAt desc', async () => {
    await NotificationModel.create([
      { userId: TEST_USER, type: 'new_message', title: 'A', body: 'a', read: false },
      { userId: TEST_USER, type: 'friend_request', title: 'B', body: 'b', read: false },
      { userId: TEST_USER, type: 'group_invite', title: 'C', body: 'c', read: false },
    ]);

    const result = await getNotifications(TEST_USER, undefined, 10);

    expect(result.notifications).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
    const titles = result.notifications.map((n) => n.title);
    expect(titles).toEqual(['C', 'B', 'A']);
  });

  it('should support cursor pagination', async () => {
    for (let i = 0; i < 5; i++) {
      await createNotification(TEST_USER, 'new_message', `N${i}`, `Body ${i}`);
    }

    const page1 = await getNotifications(TEST_USER, undefined, 3);
    expect(page1.notifications).toHaveLength(3);
    expect(page1.nextCursor).toBeTruthy();

    const page2 = await getNotifications(TEST_USER, page1.nextCursor!, 3);
    expect(page2.notifications).toHaveLength(2);
    expect(page2.nextCursor).toBeNull();
  });

  it('should only return notifications for the target user', async () => {
    await createNotification(TEST_USER, 'new_message', 'Mine', 'my msg');
    await createNotification('other-user', 'new_message', 'Not mine', 'other msg');

    const result = await getNotifications(TEST_USER);
    expect(result.notifications).toHaveLength(1);
    expect(result.notifications[0]!.title).toBe('Mine');
  });
});

// ─── markAsRead ─────────────────────────────────────────────────────────────

describe('markAsRead()', () => {
  it('should mark specified notifications as read', async () => {
    const n1 = await createNotification(TEST_USER, 'new_message', 'T1', 'B1');
    const n2 = await createNotification(TEST_USER, 'new_message', 'T2', 'B2');

    const modified = await markAsRead(TEST_USER, [n1._id.toString()]);
    expect(modified).toBe(1);

    const updated = await NotificationModel.findById(n1._id);
    expect(updated?.read).toBe(true);

    const untouched = await NotificationModel.findById(n2._id);
    expect(untouched?.read).toBe(false);
  });

  it('should not modify other users notifications', async () => {
    const n = await createNotification('other-user', 'new_message', 'T', 'B');
    const modified = await markAsRead(TEST_USER, [n._id.toString()]);
    expect(modified).toBe(0);
  });
});

// ─── markAllAsRead ──────────────────────────────────────────────────────────

describe('markAllAsRead()', () => {
  it('should mark all unread notifications as read', async () => {
    await createNotification(TEST_USER, 'new_message', 'T1', 'B1');
    await createNotification(TEST_USER, 'friend_request', 'T2', 'B2');

    const modified = await markAllAsRead(TEST_USER);
    expect(modified).toBe(2);

    const unread = await NotificationModel.countDocuments({ userId: TEST_USER, read: false });
    expect(unread).toBe(0);
  });
});

// ─── getUnreadCount ─────────────────────────────────────────────────────────

describe('getUnreadCount()', () => {
  it('should return the count of unread notifications', async () => {
    await createNotification(TEST_USER, 'new_message', 'T1', 'B1');
    await createNotification(TEST_USER, 'new_message', 'T2', 'B2');
    const n3 = await createNotification(TEST_USER, 'new_message', 'T3', 'B3');
    await markAsRead(TEST_USER, [n3._id.toString()]);

    const count = await getUnreadCount(TEST_USER);
    expect(count).toBe(2);
  });
});

// ─── muteConversation / unmuteConversation / isConversationMuted ────────────

describe('mute/unmute', () => {
  it('muteConversation() should add conversation to muted list', async () => {
    await muteConversation(TEST_USER, TEST_CONV);

    const muted = await isConversationMuted(TEST_USER, TEST_CONV);
    expect(muted).toBe(true);
  });

  it('unmuteConversation() should remove conversation from muted list', async () => {
    await muteConversation(TEST_USER, TEST_CONV);
    await unmuteConversation(TEST_USER, TEST_CONV);

    const muted = await isConversationMuted(TEST_USER, TEST_CONV);
    expect(muted).toBe(false);
  });

  it('isConversationMuted() should return false for non-muted conversation', async () => {
    const muted = await isConversationMuted(TEST_USER, 'unmuted-conv');
    expect(muted).toBe(false);
  });

  it('should auto-unmute when mutedUntil expires', async () => {
    const past = new Date(Date.now() - 60_000);
    await muteConversation(TEST_USER, TEST_CONV, past);

    const muted = await isConversationMuted(TEST_USER, TEST_CONV);
    expect(muted).toBe(false);
  });

  it('muteConversation() should mark existing notifications in that conversation as read', async () => {
    await createNotification(TEST_USER, 'new_message', 'T1', 'B1', undefined, TEST_CONV);
    await createNotification(TEST_USER, 'new_message', 'T2', 'B2', undefined, TEST_CONV);
    await createNotification(TEST_USER, 'new_message', 'T3', 'B3', undefined, 'conv-other');

    await muteConversation(TEST_USER, TEST_CONV);

    const unreadInMutedConv = await NotificationModel.countDocuments({
      userId: TEST_USER,
      conversationId: TEST_CONV,
      read: false,
    });
    const unreadOtherConv = await NotificationModel.countDocuments({
      userId: TEST_USER,
      conversationId: 'conv-other',
      read: false,
    });

    expect(unreadInMutedConv).toBe(0);
    expect(unreadOtherConv).toBe(1);
  });
});

// ─── getPreferences / updatePreferences ─────────────────────────────────────

describe('preferences', () => {
  it('getPreferences() should create default preferences if none exist', async () => {
    const prefs = await getPreferences(TEST_USER);
    expect(prefs.userId).toBe(TEST_USER);
    expect(prefs.enablePush).toBe(true);
    expect(prefs.enableSound).toBe(true);
    expect(prefs.enableBadge).toBe(true);
    expect(prefs.mutedConversations).toEqual([]);
  });

  it('updatePreferences() should toggle push off', async () => {
    await getPreferences(TEST_USER);
    const updated = await updatePreferences(TEST_USER, { enablePush: false });
    expect(updated.enablePush).toBe(false);
    expect(updated.enableSound).toBe(true);
  });

  it('updatePreferences() should toggle sound and badge', async () => {
    const updated = await updatePreferences(TEST_USER, {
      enableSound: false,
      enableBadge: false,
    });
    expect(updated.enableSound).toBe(false);
    expect(updated.enableBadge).toBe(false);
  });
});
