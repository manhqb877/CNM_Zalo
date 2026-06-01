import webPush from 'web-push';
import { logger } from '../shared/logger';

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let webPushConfigured = false;

function initializeWebPush(): void {
  const publicKey = process.env['VAPID_PUBLIC_KEY'];
  const privateKey = process.env['VAPID_PRIVATE_KEY'];
  const subject = process.env['VAPID_SUBJECT'] ?? 'mailto:admin@zync.io';

  if (!publicKey || !privateKey) {
    logger.warn(
      'Web Push not configured – VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY missing. Browser push disabled. Generate keys: npx web-push generate-vapid-keys',
    );
    return;
  }

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
    webPushConfigured = true;
    logger.info('Web Push initialized with VAPID keys');
  } catch (err) {
    logger.warn('Web Push init failed – invalid VAPID keys', err);
  }
}

initializeWebPush();

export function isWebPushConfigured(): boolean {
  return webPushConfigured;
}

export function getVapidPublicKey(): string | undefined {
  return process.env['VAPID_PUBLIC_KEY'];
}

export async function sendWebPush(
  subscription: PushSubscriptionJSON,
  payload: string,
): Promise<{ success: boolean; expired: boolean }> {
  if (!webPushConfigured) {
    logger.warn(`[WebPush dev-mode] Would send to ${subscription.endpoint.slice(0, 60)}…`);
    return { success: false, expired: false };
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
      },
      payload,
      { TTL: 60 * 60 }, // 1 hour
    );
    return { success: true, expired: false };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;

    if (statusCode === 410 || statusCode === 404) {
      logger.debug(`Web Push subscription expired (${statusCode}): ${subscription.endpoint.slice(0, 60)}…`);
      return { success: false, expired: true };
    }

    logger.error('Web Push send failed', err);
    return { success: false, expired: false };
  }
}
