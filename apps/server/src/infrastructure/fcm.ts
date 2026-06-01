import * as admin from 'firebase-admin';
import { logger } from '../shared/logger';

let fcmConfigured = false;

function initializeFCM(): void {
  if (admin.apps.length > 0) {
    fcmConfigured = true;
    return;
  }

  const credentialsPath = process.env['GOOGLE_APPLICATION_CREDENTIALS'];
  const credentialsJson = process.env['FCM_SERVICE_ACCOUNT_JSON'];

  if (credentialsJson) {
    try {
      const serviceAccount = JSON.parse(credentialsJson) as admin.ServiceAccount;
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      fcmConfigured = true;
      logger.info('FCM initialized from FCM_SERVICE_ACCOUNT_JSON');
    } catch (err) {
      logger.warn('FCM init failed – invalid FCM_SERVICE_ACCOUNT_JSON', err);
    }
    return;
  }

  if (credentialsPath) {
    try {
      admin.initializeApp({ credential: admin.credential.applicationDefault() });
      fcmConfigured = true;
      logger.info(`FCM initialized from GOOGLE_APPLICATION_CREDENTIALS (${credentialsPath})`);
    } catch (err) {
      logger.warn('FCM init failed – invalid GOOGLE_APPLICATION_CREDENTIALS', err);
    }
    return;
  }

  logger.warn('FCM not configured – push notifications will be logged only (set GOOGLE_APPLICATION_CREDENTIALS or FCM_SERVICE_ACCOUNT_JSON)');
}

initializeFCM();

export function isFCMConfigured(): boolean {
  return fcmConfigured;
}

export async function sendFCMNotification(
  tokens: string[],
  notification: { title: string; body: string },
  data?: Record<string, string>,
): Promise<{ successCount: number; expiredTokens: string[] }> {
  if (tokens.length === 0) {
    return { successCount: 0, expiredTokens: [] };
  }

  if (!fcmConfigured) {
    logger.warn(`[FCM dev-mode] Would send to ${tokens.length} device(s): ${notification.title}`);
    return { successCount: 0, expiredTokens: [] };
  }

  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification,
      data,
      android: { priority: 'high' },
      webpush: { headers: { Urgency: 'high' } },
    });

    const expiredTokens: string[] = [];

    response.responses.forEach((res, idx) => {
      if (res.error) {
        const code = res.error.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          expiredTokens.push(tokens[idx]!);
        } else {
          logger.error(`FCM send error for token index ${idx}: ${code}`, res.error);
        }
      }
    });

    logger.debug(
      `FCM result: ${response.successCount} success, ${response.failureCount} failed, ${expiredTokens.length} expired`,
    );

    return { successCount: response.successCount, expiredTokens };
  } catch (err) {
    logger.error('FCM sendEachForMulticast failed', err);
    return { successCount: 0, expiredTokens: [] };
  }
}
