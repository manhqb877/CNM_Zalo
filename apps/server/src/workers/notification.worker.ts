import type { Consumer } from "kafkajs";
import { createConsumer, KAFKA_TOPICS } from "../infrastructure/kafka";
import { getRedis, getUserOnlineStatus } from "../infrastructure/redis";
import { sendFCMNotification, isFCMConfigured } from "../infrastructure/fcm";
import { sendWebPush, isWebPushConfigured } from "../infrastructure/web-push";
import {
  NotificationModel,
  type NotificationType,
} from "../modules/notifications/notification.model";
import { NotificationPreferenceModel } from "../modules/notifications/notification-preference.model";
import { DeviceTokenModel } from "../modules/users/device-token.model";
import { emitNotification } from "../socket/gateway";
import { logger } from "../shared/logger";

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  conversationId?: string;
  fromUserId?: string;
  createAt?: Date;
}

const DEBOUNCE_WINDOW_SECONDS = 5;

let consumer: Consumer | null = null;

export async function startNotificationWorker(): Promise<void> {
  consumer = createConsumer(
    `${process.env["KAFKA_GROUP_ID"] ?? "zync-server"}-notifications`,
  );

  await consumer.connect();
  await consumer.subscribe({
    topic: KAFKA_TOPICS.NOTIFICATIONS,
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;

      try {
        // E1.1 – Parse payload
        const payload = JSON.parse(
          message.value.toString(),
        ) as NotificationPayload;
        logger.debug(
          `Processing notification for user ${payload.userId}: ${payload.type}`,
        );

        await processNotification(payload);
      } catch (err) {
        // E1.13 – Error handling: log but never throw (worker continues consuming)
        logger.error("Failed to process notification event", err);
      }
    },
  });

  logger.info("Notification worker started – consuming notifications");
}

// E2.2 – Graceful shutdown
export async function stopNotificationWorker(): Promise<void> {
  if (!consumer) return;

  try {
    logger.info("Stopping notification worker...");
    await consumer.disconnect();
    consumer = null;
    logger.info("Notification worker stopped");
  } catch (err) {
    logger.error("Error stopping notification worker", err);
  }
}

async function processNotification(payload: NotificationPayload): Promise<void> {
  const { userId, type, title, body, data, conversationId, fromUserId, createAt } = payload;
  const safeTitle = typeof title === 'string' && title.trim().length > 0
    ? title.trim()
    : 'Thong bao moi';
  const safeBody = typeof body === 'string' && body.trim().length > 0
    ? body.trim()
    : 'Ban co thong bao moi';

  if (safeTitle !== title || safeBody !== body) {
    logger.warn('Notification payload missing title/body; fallback text applied', {
      userId,
      type,
      conversationId,
    });
  }

  const pref = await NotificationPreferenceModel.findOne({ userId }).lean();

  // E1.2 – Check mute
  let isMuted = false;
  if (conversationId) {
    if (pref?.mutedConversations?.includes(conversationId)) {
      const mutedUntilMap = pref.mutedUntil as unknown as
        | Record<string, Date>
        | undefined;
      if (mutedUntilMap) {
        const expiry = mutedUntilMap[conversationId];
        if (expiry && new Date(expiry) < new Date()) {
          await NotificationPreferenceModel.updateOne(
            { userId },
            {
              $pull: { mutedConversations: conversationId },
              $unset: { [`mutedUntil.${conversationId}`]: "" },
            },
          );
        } else {
          isMuted = true;
        }
      } else {
        isMuted = true;
      }
    }
  }

  // E1.3 – Check master toggle
  let pushEnabled = true;
  if (!isMuted) {
    if (pref && pref.enablePush === false) {
      pushEnabled = false;
    }
  }

  if (isMuted) {
    logger.debug(
      `Notification skipped (muted) for user ${userId}, conversation ${conversationId}`,
    );
    return;
  }

  // E1.6 – Save notification history (except muted conversation)
  const notificationDoc = await NotificationModel.create({
    userId,
    type,
    title: safeTitle,
    body: safeBody,
    data,
    conversationId,
    fromUserId,
    read: false,
  });

  // E1.7 – Emit Socket.IO only when notifications are effectively enabled.
  // This keeps in-app behavior consistent with mute/disable-push settings.
  if (!isMuted && pushEnabled) {
    emitNotification(
      userId,
      (createAt? {...notificationDoc.toObject(), createAt}: notificationDoc.toObject()) as unknown as Record<string, unknown>,
    );
  }

  // Skip push if push disabled
  if (!pushEnabled) {
    logger.debug(`Push disabled for user ${userId}`);
    return;
  }

  // E1.4 – Check online status: skip push for new_message if user is online
  if (type === "new_message") {
    const onlineStatus = await getUserOnlineStatus(userId);
    if (onlineStatus) {
      logger.debug(`User ${userId} is online – skipping push for new_message`);
      return;
    }
  }

  // E1.5 – Debounce logic for conversation-scoped notifications
  if (conversationId && type === "new_message") {
    const redis = getRedis();
    const debounceKey = `notif_debounce:${userId}:${conversationId}`;
    const existing = await redis.get(debounceKey);

    if (existing) {
      const count = parseInt(existing, 10) + 1;
      await redis.setex(debounceKey, DEBOUNCE_WINDOW_SECONDS, count.toString());
      logger.debug(
        `Debounced notification for user ${userId} (${count} msgs in window)`,
      );
      return;
    }

    await redis.setex(debounceKey, DEBOUNCE_WINDOW_SECONDS, "1");
  }

  // E1.8 – Query device tokens
  const deviceTokens = await DeviceTokenModel.find({ userId });

  if (deviceTokens.length === 0) {
    logger.debug(`No device tokens for user ${userId}`);
    return;
  }

  const expiredTokenIds: string[] = [];
  const pushPayload = { title: safeTitle, body: safeBody };
  const pushData = data ?? {};

  // E1.9 – Route FCM: android tokens + web tokens without pushSubscription
  const fcmTokens = deviceTokens
    .filter(
      (dt) =>
        dt.platform === "android" ||
        (dt.platform === "web" && !dt.pushSubscription),
    )
    .map((dt) => dt.deviceToken);

  if (fcmTokens.length > 0) {
    if (isFCMConfigured()) {
      const result = await sendFCMNotification(
        fcmTokens,
        pushPayload,
        pushData,
      );
      for (const expiredToken of result.expiredTokens) {
        const dt = deviceTokens.find((d) => d.deviceToken === expiredToken);
        if (dt) expiredTokenIds.push(dt._id.toString());
      }
    } else {
      logger.debug(
        `[FCM dev-mode] Would push to ${fcmTokens.length} FCM token(s)`,
      );
    }
  }

  // E1.10 – Route Web Push: web tokens with pushSubscription
  const webPushTokens = deviceTokens.filter(
    (dt) => dt.platform === "web" && dt.pushSubscription,
  );

  if (webPushTokens.length > 0) {
    if (isWebPushConfigured()) {
      for (const dt of webPushTokens) {
        const result = await sendWebPush(
          dt.pushSubscription!,
          JSON.stringify({ title: safeTitle, body: safeBody, data: pushData }),
        );
        if (result.expired) {
          expiredTokenIds.push(dt._id.toString());
        }
      }
    } else {
      logger.debug(
        `[WebPush dev-mode] Would push to ${webPushTokens.length} subscription(s)`,
      );
    }
  }

  // E1.11 – Route APNs: iOS placeholder
  const iosTokens = deviceTokens.filter((dt) => dt.platform === "ios");
  if (iosTokens.length > 0) {
    logger.debug(
      `[APNs placeholder] Would push to ${iosTokens.length} iOS device(s)`,
    );
  }

  // E1.12 – Clean expired tokens
  if (expiredTokenIds.length > 0) {
    await DeviceTokenModel.deleteMany({ _id: { $in: expiredTokenIds } });
    logger.info(
      `Cleaned ${expiredTokenIds.length} expired device token(s) for user ${userId}`,
    );
  }
}
