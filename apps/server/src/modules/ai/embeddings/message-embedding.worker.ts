import type { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer, KAFKA_TOPICS } from '../../../infrastructure/kafka';
import { isNeonAvailable } from '../../../infrastructure/neon';
import { logger } from '../../../shared/logger';
import { MessageModel } from '../../messages/message.model';
import { embedText } from './embedding.service';
import { insertMessageEmbedding } from './neon-vector.service';

const MESSAGE_EMBEDDING_WORKER_GROUP = 'message-embedding-worker-group';
const MAX_EMBEDDING_CHARS = 8000;

interface MessageEmbeddingJob {
  messageId: string;
  conversationId: string;
  contentText: string;
  type?: string;
  requestedAt?: string;
}

let messageEmbeddingConsumer: Consumer | null = null;

async function processMessageEmbeddingJob(job: MessageEmbeddingJob): Promise<void> {
  if (!isNeonAvailable()) {
    return;
  }

  if (!job.messageId || !job.conversationId) {
    logger.warn('[MessageEmbeddingWorker] Invalid job payload', job);
    return;
  }

  const message = await MessageModel.findById(job.messageId)
    .select('_id conversationId content type isDeleted deleteType')
    .lean<{
      _id: unknown;
      conversationId: string;
      content?: string;
      type: string;
      isDeleted?: boolean;
      deleteType?: string;
    } | null>();

  if (!message || message.isDeleted || message.deleteType === 'recall') {
    return;
  }

  const contentText = (message.content ?? job.contentText ?? '').trim();
  if (!contentText) {
    return;
  }

  const embedding = await embedText(contentText.slice(0, MAX_EMBEDDING_CHARS), 'RETRIEVAL_DOCUMENT');
  await insertMessageEmbedding({
    messageId: String(message._id),
    conversationId: message.conversationId,
    contentText,
    embedding,
  });
}

export async function startMessageEmbeddingWorker(): Promise<void> {
  if (messageEmbeddingConsumer) return;
  if (!isNeonAvailable()) {
    logger.warn('[MessageEmbeddingWorker] Neon is not configured; worker skipped');
    return;
  }

  messageEmbeddingConsumer = createConsumer(MESSAGE_EMBEDDING_WORKER_GROUP);
  await messageEmbeddingConsumer.connect();
  await messageEmbeddingConsumer.subscribe({ topic: KAFKA_TOPICS.MESSAGE_EMBEDDINGS, fromBeginning: false });

  await messageEmbeddingConsumer.run({
    eachMessage: async ({ message }: EachMessagePayload) => {
      if (!message.value) return;

      try {
        const payload = JSON.parse(message.value.toString()) as MessageEmbeddingJob;
        await processMessageEmbeddingJob(payload);
      } catch (err) {
        logger.error('[MessageEmbeddingWorker] Failed to process embedding job', {
          err: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  logger.info(`[MessageEmbeddingWorker] Started (groupId: ${MESSAGE_EMBEDDING_WORKER_GROUP})`);
}

export async function stopMessageEmbeddingWorker(): Promise<void> {
  if (!messageEmbeddingConsumer) return;

  try {
    await messageEmbeddingConsumer.disconnect();
    messageEmbeddingConsumer = null;
    logger.info('[MessageEmbeddingWorker] Stopped');
  } catch (err) {
    logger.error('[MessageEmbeddingWorker] Error on stop', err);
  }
}
