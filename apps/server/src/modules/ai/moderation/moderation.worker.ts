/**
 * Moderation Worker - AI-1 (Kafka Consumer)
 *
 * Consumes topic: `raw-messages`
 * Runs moderation async AFTER socket gateway has already broadcast the message.
 * If blocked -> emits `content_blocked` + `message_recalled` and publishes to `moderation-actions`.
 *
 * This worker is PASSIVE: it does NOT block message delivery (fail-open design).
 */

import type { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, produceMessage } from '../../../infrastructure/kafka';
const RAW_MESSAGES_TOPIC = 'raw-messages';
import { moderateMessage } from './moderation.service';
import { getIO } from '../../../socket/gateway';
import { MessagesService } from '../../messages/messages.service';
import { logger } from '../../../shared/logger';

const MODERATION_WORKER_GROUP_ID = 'moderation-worker-group';

interface RawMessagePayload {
  messageId: string;
  idempotencyKey?: string;
  conversationId: string;
  senderId: string;
  content?: string;
  type: string; // text | image | video | audio | file | sticker
  mediaUrl?: string;
}

let moderationConsumer: Consumer | null = null;

export async function startModerationWorker(): Promise<void> {
  try {
    moderationConsumer = createConsumer(MODERATION_WORKER_GROUP_ID);
    await moderationConsumer.connect();
    logger.info(`[ModerationWorker] Connected (groupId: ${MODERATION_WORKER_GROUP_ID})`);

    await moderationConsumer.subscribe({
      topic: RAW_MESSAGES_TOPIC,
      fromBeginning: false,
    });
    logger.info(`[ModerationWorker] Subscribed to topic: ${RAW_MESSAGES_TOPIC}`);

    await moderationConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        if (!payload.message.value) return;

        let raw: RawMessagePayload;
        try {
          raw = JSON.parse(payload.message.value.toString()) as RawMessagePayload;
        } catch {
          logger.warn('[ModerationWorker] Failed to parse message payload');
          return;
        }

        // Only moderate text and image/video content
        const isModeratableType = ['text', 'image', 'video'].includes(raw.type);
        if (!isModeratableType) return;

        try {
          const messageReference = raw.idempotencyKey ?? raw.messageId;
          const result = await moderateMessage({
            messageId: messageReference,
            conversationId: raw.conversationId,
            senderId: raw.senderId,
            contentType: raw.type as 'text' | 'image' | 'video' | 'audio' | 'file',
            content: raw.content,
            mediaUrl: raw.mediaUrl,
          });

          // Handle blocked content
          if (result.action === 'block') {
            logger.warn('[ModerationWorker] Message blocked', {
              messageId: messageReference,
              confidence: result.confidence,
              reason: result.reason,
            });

            const io = getIO();

            // 1) Notify sender that their content was blocked
            if (io) {
              io.to(`user:${raw.senderId}`).emit('content_blocked', {
                messageId: messageReference,
                conversationId: raw.conversationId,
                reason: 'Tin nh\u1eafn c\u1ee7a b\u1ea1n vi ph\u1ea1m ti\u00eau chu\u1ea9n c\u1ed9ng \u0111\u1ed3ng v\u00e0 \u0111\u00e3 b\u1ecb \u1ea9n.',
                confidence: result.confidence,
              });

              // 2) Realtime hide for all clients immediately (no DB wait)
              io.to(`conv:${raw.conversationId}`).emit('message_recalled', {
                messageId: messageReference,
                idempotencyKey: messageReference,
                conversationId: raw.conversationId,
                recalledBy: 'system',
                recalledAt: new Date().toISOString(),
              });
            }

            // 3) Publish moderation action for downstream consumers
            await produceMessage('moderation-actions', messageReference, {
              messageId: messageReference,
              conversationId: raw.conversationId,
              senderId: raw.senderId,
              action: 'block',
              label: result.label,
              confidence: result.confidence,
              reason: result.reason,
              source: result.source,
              timestamp: new Date().toISOString(),
            }).catch((err) =>
              logger.error('[ModerationWorker] Failed to produce moderation action', err),
            );

            // 4) Persist recall to DB with retry (handles race with message.worker insert)
            try {
              await MessagesService.recallMessageWithRetry(messageReference, 'system', true);
              logger.info('[ModerationWorker] Cleaned up blocked message from conversation', {
                messageId: messageReference,
              });
            } catch (recallErr) {
              logger.error('[ModerationWorker] Failed to recall blocked message', {
                messageId: messageReference,
                err: String(recallErr),
              });
            }
          }

          // Handle flagged (warning) content
          if (result.action === 'flag') {
            logger.info('[ModerationWorker] Message flagged for admin review', {
              messageId: messageReference,
              confidence: result.confidence,
            });

            await produceMessage('moderation-actions', messageReference, {
              messageId: messageReference,
              conversationId: raw.conversationId,
              senderId: raw.senderId,
              action: 'flag',
              label: result.label,
              confidence: result.confidence,
              reason: result.reason,
              source: result.source,
              timestamp: new Date().toISOString(),
            }).catch((err) =>
              logger.error('[ModerationWorker] Failed to produce flag event', err),
            );
          }
        } catch (err) {
          // Fail-open: log error but do not crash worker
          logger.error('[ModerationWorker] Moderation failed (fail-open)', {
            messageId: raw.messageId,
            err: String(err),
          });
        }
      },
    });

    logger.info('[ModerationWorker] Started - consuming raw-messages topic');
  } catch (err) {
    logger.error('[ModerationWorker] Failed to start', err);
    throw err;
  }
}

export async function stopModerationWorker(): Promise<void> {
  if (!moderationConsumer) return;
  try {
    logger.info('[ModerationWorker] Stopping...');
    await moderationConsumer.disconnect();
    logger.info('[ModerationWorker] Stopped');
  } catch (err) {
    logger.error('[ModerationWorker] Error on stop', err);
  }
}
