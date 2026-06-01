import { Kafka, Partitioners, type Producer, type Consumer, type Admin, type ConsumerConfig, logLevel } from 'kafkajs';
import { logger } from '../shared/logger';

export const KAFKA_TOPICS = {
  RAW_MESSAGES: 'raw-messages',
  NOTIFICATIONS: 'notifications',
  MESSAGE_EMBEDDINGS: 'message-embeddings',    // AI-2: async embed worker
  AI_CATCHUP_JOBS: 'ai-catchup-jobs',
  // ─── Dead Letter Queue (DLQ) Topics ────────────────────────────────────────
  // Khi worker xử lý thất bại, message sẽ được đẩy vào DLQ để xử lý lại sau
  RAW_MESSAGES_RETRY: 'raw-messages.retry',    // Retry topic (1-3 lần)
  RAW_MESSAGES_DLQ: 'raw-messages.dlq',        // Dead Letter Queue (quá retry)
  NOTIFICATIONS_RETRY: 'notifications.retry',
  NOTIFICATIONS_DLQ: 'notifications.dlq',
} as const;

let kafka: Kafka | null = null;
let producer: Producer | null = null;

const REQUIRED_TOPICS = [
  { topic: KAFKA_TOPICS.RAW_MESSAGES, numPartitions: 3, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.NOTIFICATIONS, numPartitions: 3, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.MESSAGE_EMBEDDINGS, numPartitions: 3, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.AI_CATCHUP_JOBS, numPartitions: 3, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.RAW_MESSAGES_RETRY, numPartitions: 1, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.RAW_MESSAGES_DLQ, numPartitions: 1, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.NOTIFICATIONS_RETRY, numPartitions: 1, replicationFactor: 1 },
  { topic: KAFKA_TOPICS.NOTIFICATIONS_DLQ, numPartitions: 1, replicationFactor: 1 },
] as const;

export async function connectKafka(): Promise<void> {
  const brokers = (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(',');

  kafka = new Kafka({
    clientId: 'zync-server',
    brokers,
    logLevel: logLevel.WARN,
    retry: { initialRetryTime: 200, retries: 10 },
  });

  producer = kafka.producer({
    idempotent: true,
    createPartitioner: Partitioners.LegacyPartitioner,
    retry: { retries: Number.MAX_SAFE_INTEGER },
  });

  await producer.connect();
  logger.info('Kafka producer connected');

  // Tạo topic nếu chưa tồn tại. KafkaJS log ERROR nếu gọi createTopics cho topic đã có,
  // nên lọc trước để log server sạch hơn khi restart local.
  const admin: Admin = kafka.admin();
  await admin.connect();
  try {
    const existingTopics = new Set(await admin.listTopics());
    const missingTopics = REQUIRED_TOPICS.filter(({ topic }) => !existingTopics.has(topic));

    if (missingTopics.length > 0) {
      await admin.createTopics({
        topics: [...missingTopics],
        waitForLeaders: true,
      });
      logger.info(`Kafka topics created: ${missingTopics.map(({ topic }) => topic).join(', ')}`);
    } else {
      logger.info('Kafka topics already exist');
    }
  } finally {
    await admin.disconnect();
  }
}

export function getProducer(): Producer {
  if (!producer) throw new Error('Kafka producer not initialized. Call connectKafka() first.');
  return producer;
}

export function createConsumer(groupId: string, options: Omit<ConsumerConfig, 'groupId'> = {}): Consumer {
  if (!kafka) throw new Error('Kafka not initialized. Call connectKafka() first.');
  return kafka.consumer({ groupId, ...options });
}

export async function produceMessage(
  topic: string,
  key: string,
  value: Record<string, unknown>,
): Promise<void> {
  const producer = getProducer();
  await producer.send({
    topic,
    messages: [{ key, value: JSON.stringify(value) }],
  });
}
