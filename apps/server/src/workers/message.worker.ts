import type { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, KAFKA_TOPICS, produceMessage } from '../infrastructure/kafka';
import { MessageModel, MessageType, type IReplyTo } from '../modules/messages/message.model';
import { MessagesService } from '../modules/messages/messages.service';
import { logger } from '../shared/logger';

const BATCH_SIZE = 100;
const BATCH_TIMEOUT_MS = 500; // 500ms for Phase 5 MVP
const MSG_WORKER_GROUP_ID = 'message-worker-group'; // Task 6.2 spec
const SESSION_TIMEOUT = 30000; // Task 6.2 spec

// ─── DLQ / Retry Constants ─────────────────────────────────────────────────
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS_BASE = 1000; // Base: 1s, exponential backoff

interface RawMessage {
  messageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  type: MessageType;
  mediaUrl?: string;
  replyTo?: IReplyTo;
  idempotencyKey: string;
  createdAt: string;
  // DLQ metadata
  _retryCount?: number;
  _failureReason?: string;
  _originalTopic?: string;
}

let messageWorkerConsumer: Consumer | null = null;
let kafkaInsertFailureCallback: ((messages: any[]) => Promise<void>) | null = null;

/**
 * Set callback for when Kafka batch insert fails
 * Used for fallback to direct DB insert via service
 */
export function setKafkaInsertFailureCallback(callback: (messages: any[]) => Promise<void>): void {
  kafkaInsertFailureCallback = callback;
}

/**
 * Notify gateway that Kafka batch insert has recovered
 * Used to disable fallback mode when Kafka recovers
 */
export function notifyKafkaRecovery(): void {
  try {
    // Import here to avoid circular dependency
    const { setKafkaFailureMode } = require('../socket/gateway');
    setKafkaFailureMode(false);
  } catch (err) {
    // Ignore circular dependency errors
  }
}

/**
 * Đẩy message vào DLQ (Dead Letter Queue)
 * Dùng khi message đã retry quá MAX_RETRY_ATTEMPTS lần
 */
async function sendToDLQ(message: RawMessage, reason: string): Promise<void> {
  try {
    await produceMessage(KAFKA_TOPICS.RAW_MESSAGES_DLQ, message.conversationId, {
      ...message,
      _retryCount: message._retryCount ?? 0,
      _failureReason: reason,
      _originalTopic: KAFKA_TOPICS.RAW_MESSAGES,
      _dlqAt: new Date().toISOString(),
    });
    logger.warn(`[DLQ] Message ${message.idempotencyKey} sent to DLQ after ${message._retryCount ?? 0} retries. Reason: ${reason}`);
  } catch (err) {
    logger.error(`[DLQ] CRITICAL: Failed to send message to DLQ! Message may be lost: ${message.idempotencyKey}`, err);
  }
}

/**
 * Đẩy message vào Retry topic (với exponential backoff metadata)
 */
async function sendToRetry(message: RawMessage, reason: string): Promise<void> {
  const retryCount = (message._retryCount ?? 0) + 1;

  if (retryCount > MAX_RETRY_ATTEMPTS) {
    await sendToDLQ({ ...message, _retryCount: retryCount, _failureReason: reason }, reason);
    return;
  }

  try {
    await produceMessage(KAFKA_TOPICS.RAW_MESSAGES_RETRY, message.conversationId, {
      ...message,
      _retryCount: retryCount,
      _failureReason: reason,
      _originalTopic: KAFKA_TOPICS.RAW_MESSAGES,
      _retryAt: new Date().toISOString(),
    });
    logger.warn(`[Retry] Message ${message.idempotencyKey} queued for retry #${retryCount}. Reason: ${reason}`);
  } catch (err) {
    logger.error(`[Retry] Failed to queue retry for message ${message.idempotencyKey}`, err);
    // Last resort: try DLQ
    await sendToDLQ(message, `Retry queue failed: ${reason}`);
  }
}

export async function startMessageWorker(): Promise<void> {
  try {
    // Task 6.2: Create consumer with specified groupId
    messageWorkerConsumer = createConsumer(MSG_WORKER_GROUP_ID);

    await messageWorkerConsumer.connect();
    logger.info(`Message worker connected (groupId: ${MSG_WORKER_GROUP_ID})`);

    // Subscribe to raw-messages AND retry topic
    await messageWorkerConsumer.subscribe({ topic: KAFKA_TOPICS.RAW_MESSAGES, fromBeginning: false });
    await messageWorkerConsumer.subscribe({ topic: KAFKA_TOPICS.RAW_MESSAGES_RETRY, fromBeginning: false });
    logger.info(`Message worker subscribed to: ${KAFKA_TOPICS.RAW_MESSAGES}, ${KAFKA_TOPICS.RAW_MESSAGES_RETRY}`);

    // Task 6.2: Batch collection variables
    const batch: Array<{
      mockId: string;
      conversationId: string;
      senderId: string;
      content: string;
      type: string;
      mediaUrl?: string;
      replyTo?: IReplyTo;
      idempotencyKey: string;
      createdAt: Date;
      _rawMessage?: RawMessage; // Keep original for DLQ routing
    }> = [];

    let batchTimer: NodeJS.Timeout | null = null;

    /**
     * Task 6.2: Batch insert to MongoDB with metadata + DLQ/Retry
     * Calls MessagesService.insertMessageWithMetadata for each message
     * Handles all DB operations: Message + MessageStatus + conversation metadata
     */
    const processBatch = async (): Promise<void> => {
      if (batch.length === 0) return;

      const toInsert = batch.splice(0, batch.length);
      let successCount = 0;

      for (const msg of toInsert) {
        try {
          await MessagesService.insertMessageWithMetadata(
            msg.conversationId,
            msg.senderId,
            msg.content,
            msg.type as MessageType,
            msg.idempotencyKey,
            msg.mediaUrl,
            msg.mockId,
            msg.replyTo,
          );
          successCount++;
        } catch (err) {
          logger.error(`[Batch] Failed to insert message ${msg.idempotencyKey}`, err);

          // ─── DLQ/Retry Logic ───────────────────────────────────────────────
          if (msg._rawMessage) {
            const errorMessage = err instanceof Error ? err.message : 'Unknown DB error';
            await sendToRetry(msg._rawMessage, errorMessage);
          } else {
            // No original message reference — log and continue
            logger.error(`[Batch] Cannot route to DLQ/Retry: no rawMessage reference for ${msg.idempotencyKey}`);
          }
        }
      }

      logger.debug(`✓ Batch inserted ${successCount}/${toInsert.length} messages`);

      // Kafka batch insert successful, disable fallback mode if it was enabled
      if (successCount > 0) {
        notifyKafkaRecovery();
      }

      // If some failed, trigger fallback callback for failed messages
      if (successCount < toInsert.length && kafkaInsertFailureCallback) {
        const failedMessages = toInsert.slice(successCount);
        try {
          await kafkaInsertFailureCallback(failedMessages);
          logger.info(`✓ Fallback inserted ${failedMessages.length} messages via service`);
        } catch (fallbackErr) {
          logger.error('Fallback insert also failed', fallbackErr);
        }
      }
    };

    /**
     * Task 6.2: Schedule batch flush with timeout
     */
    const scheduleBatchFlush = (): void => {
      if (batchTimer) return;

      batchTimer = setTimeout(async () => {
        batchTimer = null;
        if (batch.length > 0) {
          logger.debug(`Batch timeout (${BATCH_TIMEOUT_MS}ms): processing ${batch.length} messages`);
          await processBatch();
        }
      }, BATCH_TIMEOUT_MS);
    };

    /**
     * Task 6.2: Main consumer loop
     * Note: sessionTimeout (30s) and heartbeat (3s) configured in KafkaJS defaults
     */
    await messageWorkerConsumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        if (!payload.message.value) {
          logger.warn('Received empty message value');
          return;
        }

        try {
          const rawMessage = JSON.parse(payload.message.value.toString()) as RawMessage;

          // Log if this is a retry attempt
          if (rawMessage._retryCount && rawMessage._retryCount > 0) {
            logger.info(`[Retry] Processing retry #${rawMessage._retryCount} for message ${rawMessage.idempotencyKey}`);
          }

          batch.push({
            mockId: rawMessage.messageId,
            conversationId: rawMessage.conversationId,
            senderId: rawMessage.senderId,
            content: rawMessage.content,
            type: rawMessage.type,
            mediaUrl: rawMessage.mediaUrl,
            replyTo: rawMessage.replyTo,
            idempotencyKey: rawMessage.idempotencyKey,
            createdAt: new Date(rawMessage.createdAt),
            _rawMessage: rawMessage, // Keep reference for DLQ routing
          });

          logger.debug(`Buffered message ${rawMessage.messageId} (batch: ${batch.length}/${BATCH_SIZE})`);

          // Task 6.2: Check if batch is full
          if (batch.length >= BATCH_SIZE) {
            if (batchTimer) {
              clearTimeout(batchTimer);
              batchTimer = null;
            }
            logger.debug(`Batch full: processing ${batch.length} messages`);
            await processBatch();
            // Reset timer for next batch
            scheduleBatchFlush();
          } else {
            // Task 6.2: Reset timer for next potential flush
            scheduleBatchFlush();
          }
        } catch (err) {
          logger.error('Error processing Kafka message', err);
          // Task 6.2: Error handling - continue to next message
        }
      },
    });

    logger.info('✓ Message worker started – consuming raw-messages + retry topics');
  } catch (err) {
    logger.error('Message worker failed to start', err);
    throw err;
  }
}

/**
 * Task 6.2: Graceful shutdown handler
 */
export async function stopMessageWorker(): Promise<void> {
  if (!messageWorkerConsumer) return;

  try {
    logger.info('Stopping message worker...');
    await messageWorkerConsumer.disconnect();
    logger.info('✓ Message worker consumer disconnected');
  } catch (err) {
    logger.error('Error stopping message worker', err);
  }
}
