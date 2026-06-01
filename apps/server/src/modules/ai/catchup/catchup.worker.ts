import type { Consumer, EachMessagePayload } from 'kafkajs';
import { Types } from 'mongoose';
import { createAIProvider } from '../providers';
import type { AIProvider } from '../providers';
import { createConsumer, KAFKA_TOPICS } from '../../../infrastructure/kafka';
import { logger } from '../../../shared/logger';
import { ConversationMemberModel } from '../../conversations/conversation-member.model';
import { ConversationModel } from '../../conversations/conversation.model';
import { MessageModel } from '../../messages/message.model';
import { UserModel } from '../../users/user.model';
import { AiCatchupDigestModel, type IAiCatchupDigest } from './catchup.model';
import { AiCatchupModelOutputSchema, type AiCatchupModelOutput } from './catchup.schema';
import { AiCatchupService } from './catchup.service';
import { AiReminderService } from '../reminders/reminder.service';

const CATCHUP_WORKER_GROUP_ID = 'ai-catchup-worker-group';
const WORKER_SESSION_TIMEOUT_MS = parseInt(process.env['AI_CATCHUP_KAFKA_SESSION_TIMEOUT_MS'] ?? '120000', 10);
const WORKER_HEARTBEAT_INTERVAL_MS = parseInt(process.env['AI_CATCHUP_KAFKA_HEARTBEAT_INTERVAL_MS'] ?? '3000', 10);
const MAX_RANGE_MESSAGES = 100;
const MAX_INPUT_CHARS = 20_000;
const CONTEXT_MESSAGE_COUNT = 5;
const MAX_RETRIES = 2;

interface CatchupJobPayload {
  digestId: string;
  userId: string;
  conversationId: string;
  itemId?: string;
  type?: string;
}

interface CatchupMessage {
  _id: unknown;
  conversationId: string;
  senderId: string;
  content?: string;
  type: string;
  mediaUrl?: string;
  idempotencyKey: string;
  createdAt: Date;
  callHistory?: {
    status?: string;
    callType?: string;
    durationSeconds?: number;
  };
}

interface PromptMessage {
  messageRef: string;
  senderId: string;
  senderName: string;
  createdAt: string;
  type: string;
  text: string;
  isContext?: boolean;
}

let catchupConsumer: Consumer | null = null;

function startHeartbeatLoop(heartbeat: () => Promise<void>): () => void {
  let inFlight = false;
  const timer = setInterval(() => {
    if (inFlight) return;
    inFlight = true;
    heartbeat()
      .catch((err) => {
        logger.warn('[AI Catch-up Worker] Kafka heartbeat failed', {
          err: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => {
        inFlight = false;
      });
  }, Math.max(1000, WORKER_HEARTBEAT_INTERVAL_MS));

  timer.unref?.();
  return () => clearInterval(timer);
}

function buildMessageRefsQuery(refs: string[]): Record<string, unknown>[] {
  const objectIds = refs
    .filter((ref) => Types.ObjectId.isValid(ref))
    .map((ref) => new Types.ObjectId(ref));

  const clauses: Record<string, unknown>[] = [{ idempotencyKey: { $in: refs } }];
  if (objectIds.length > 0) {
    clauses.push({ _id: { $in: objectIds } });
  }

  return clauses;
}

function getMessageRef(message: Pick<CatchupMessage, '_id' | 'idempotencyKey'>): string {
  return message.idempotencyKey || String(message._id);
}

function formatMessageText(message: CatchupMessage): string {
  const text = typeof message.content === 'string' ? message.content.trim() : '';
  if (message.type === 'text') {
    return text;
  }
  if (message.type === 'image') return text || '[image]';
  if (message.type === 'video') return text || '[video]';
  if (message.type === 'audio') return text || '[audio]';
  if (message.type === 'sticker') return text || '[sticker]';
  if (message.type === 'call_history') {
    const callType = message.callHistory?.callType ?? 'call';
    const status = message.callHistory?.status ?? 'unknown';
    const duration = typeof message.callHistory?.durationSeconds === 'number'
      ? `, ${message.callHistory.durationSeconds}s`
      : '';
    return text || `[call_history: ${callType}, ${status}${duration}]`;
  }
  if (message.type.startsWith('file/')) return text || '[file]';
  return text || `[${message.type}]`;
}

function estimatePromptChars(messages: PromptMessage[]): number {
  return messages.reduce((total, message) => total + message.text.length + message.senderName.length + 80, 0);
}

function extractJson(raw: string): unknown {
  const cleaned = raw
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) {
      throw new Error('AI provider did not return valid JSON');
    }
    return JSON.parse(cleaned.slice(start, end + 1));
  }
}

interface CallAIResult {
  parsed: AiCatchupModelOutput;
  modelId: string;
}

/**
 * Gọi AI provider với retry tối đa MAX_RETRIES lần.
 * Nếu tất cả đều thất bại, ném lỗi và worker sẽ mark digest failed.
 */
async function callAIWithRetry(
  provider: AIProvider,
  prompt: string,
  attempt = 0,
  lastError?: string,
): Promise<CallAIResult> {
  if (attempt > MAX_RETRIES) {
    throw new Error(
      `AI provider failed after ${MAX_RETRIES + 1} attempts. Last error: ${lastError ?? 'unknown'}`,
    );
  }

  const repairRaw = attempt > 0 ? lastError : undefined;

  try {
    const result = await provider.generateJson(prompt, repairRaw);
    const raw = result.text;
    const parsedJson = extractJson(raw);
    const parsed = AiCatchupModelOutputSchema.parse(parsedJson);
    return { parsed, modelId: result.modelId };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.warn(`[AI Catch-up Worker] AI call attempt ${attempt + 1} failed`, {
      attempt,
      error: errorMsg,
    });
    return callAIWithRetry(provider, prompt, attempt + 1, errorMsg.slice(0, 1000));
  }
}

async function loadDigestMessages(digest: IAiCatchupDigest): Promise<CatchupMessage[]> {
  const messages = await MessageModel.find({
    conversationId: digest.conversationId,
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [digest.userId] },
    $or: buildMessageRefsQuery(digest.messageRefs),
  })
    .select('_id conversationId senderId content type mediaUrl idempotencyKey createdAt callHistory')
    .lean<CatchupMessage[]>();

  const byRef = new Map<string, CatchupMessage>();
  messages.forEach((message) => {
    byRef.set(String(message._id), message);
    if (message.idempotencyKey) {
      byRef.set(message.idempotencyKey, message);
    }
  });

  return digest.messageRefs
    .map((ref) => byRef.get(ref))
    .filter((message): message is CatchupMessage => Boolean(message));
}

async function loadContextMessages(digest: IAiCatchupDigest, firstRangeMessage: CatchupMessage): Promise<CatchupMessage[]> {
  const context = await MessageModel.find({
    conversationId: digest.conversationId,
    createdAt: { $lt: firstRangeMessage.createdAt },
    isDeleted: { $ne: true },
    deleteType: { $ne: 'recall' },
    deletedFor: { $nin: [digest.userId] },
  })
    .sort({ createdAt: -1, _id: -1 })
    .limit(CONTEXT_MESSAGE_COUNT)
    .select('_id conversationId senderId content type mediaUrl idempotencyKey createdAt callHistory')
    .lean<CatchupMessage[]>();

  return context.reverse();
}

async function buildPrompt(digest: IAiCatchupDigest): Promise<{
  prompt: string;
  omittedOlderCount: number;
  sourceRefs: string[];
}> {
  const rangeMessages = await loadDigestMessages(digest);
  if (rangeMessages.length === 0) {
    throw new Error('Digest snapshot has no visible messages');
  }

  let selectedRange = rangeMessages.slice(-MAX_RANGE_MESSAGES);
  let omittedOlderCount = Math.max(0, rangeMessages.length - selectedRange.length);
  const contextMessages = await loadContextMessages(digest, rangeMessages[0]);

  const memberRows = await ConversationMemberModel.find({ conversationId: digest.conversationId })
    .select('userId')
    .lean();
  const memberIds = memberRows.map((member) => member.userId);
  const users = await UserModel.find({ _id: { $in: memberIds } }).select('displayName').lean();
  const nameById = new Map(users.map((user) => [String(user._id), user.displayName || 'Nguoi dung']));
  const currentUserName = nameById.get(digest.userId) ?? 'Ban';
  const conversation = await ConversationModel.findById(digest.conversationId).select('name type').lean();

  const toPromptMessage = (message: CatchupMessage, isContext = false): PromptMessage => ({
    messageRef: getMessageRef(message),
    senderId: message.senderId,
    senderName: nameById.get(message.senderId) ?? 'Nguoi dung',
    createdAt: new Date(message.createdAt).toISOString(),
    type: message.type,
    text: formatMessageText(message).slice(0, 3000),
    isContext,
  });

  let promptMessages = [
    ...contextMessages.map((message) => toPromptMessage(message, true)),
    ...selectedRange.map((message) => toPromptMessage(message)),
  ];

  while (estimatePromptChars(promptMessages) > MAX_INPUT_CHARS && selectedRange.length > 1) {
    selectedRange = selectedRange.slice(1);
    omittedOlderCount += 1;
    promptMessages = [
      ...contextMessages.map((message) => toPromptMessage(message, true)),
      ...selectedRange.map((message) => toPromptMessage(message)),
    ];
  }

  const participantNames = memberIds.map((id) => ({
    userId: id,
    displayName: nameById.get(id) ?? 'Nguoi dung',
  }));
  const messagesJson = JSON.stringify(promptMessages, null, 2);
  const sourceRefs = selectedRange.map(getMessageRef);

  const prompt = `You are summarizing unread chat messages for one user in a private chat app.

Current user:
${JSON.stringify({ userId: digest.userId, displayName: currentUserName })}

Conversation:
${JSON.stringify({
  id: digest.conversationId,
  name: conversation?.name ?? '',
  type: conversation?.type ?? 'direct',
  participantNames,
})}

Messages:
Each message has messageRef, senderName, createdAt, type, text, and optional isContext. Context messages are only for understanding; summarize the unread non-context messages.
${messagesJson}

Rules:
- Summarize only what happened in the provided unread non-context messages.
- Do not invent facts, deadlines, decisions, or names.
- Keep the output concise and useful for catching up.
- If information is unclear, omit it.
- Return valid JSON only. No markdown.

JSON schema:
{
  "title": "short Vietnamese title, max 80 chars",
  "overview": "1-2 Vietnamese sentences",
  "bullets": ["3-6 concise Vietnamese bullets"],
  "mentionedUserIds": ["user ids explicitly mentioned or directly relevant"],
  "sourceMessageRefs": ["message refs used for the summary"],
  "futureSignals": {
    "decisions": ["clear decisions only, otherwise empty"],
    "questionsForUser": ["questions directed at current user, otherwise empty"],
    "actionItems": [
      { "text": "task text", "sourceMessageRefs": ["messageRef"] }
    ],
    "suggestedReplies": ["short reply suggestions, otherwise empty"]
  }
}`;

  return { prompt, omittedOlderCount, sourceRefs };
}

async function processCatchupJob(payload: CatchupJobPayload): Promise<void> {
  const digest = await AiCatchupDigestModel.findById(payload.digestId);
  if (!digest) {
    logger.warn('[AI Catch-up Worker] Digest not found', payload);
    return;
  }

  if (digest.status === 'ready' && digest.summary) {
    return;
  }

  let provider: AIProvider | null = null;

  try {
    await AiCatchupService.markDigestProcessing(digest);
    provider = createAIProvider();

    const { prompt, omittedOlderCount, sourceRefs } = await buildPrompt(digest);
    const result = await callAIWithRetry(provider, prompt);
    const { parsed: output, modelId } = result;

    digest.status = 'ready';
    digest.summary = {
      title: output.title,
      overview: output.overview,
      bullets: output.bullets.slice(0, 6),
      mentionedUserIds: output.mentionedUserIds,
      sourceMessageRefs: output.sourceMessageRefs.length > 0 ? output.sourceMessageRefs : sourceRefs,
    };
    digest.futureSignals = output.futureSignals;
    digest.set('model', modelId);
    digest.omittedOlderCount = omittedOlderCount;
    digest.generatedAt = new Date();
    await AiReminderService.syncSuggestedTasksFromDigest(digest);

    await AiCatchupService.markDigestReady(digest);
  } catch (err) {
    logger.error('[AI Catch-up Worker] Failed to process digest', {
      digestId: payload.digestId,
      providerType: provider?.type,
      modelId: provider?.modelId,
      err: String(err),
    });
    await AiCatchupService.markDigestFailed(digest, err instanceof Error ? err.message : 'AI Catch-up failed');
  }
}

export async function startCatchupWorker(): Promise<void> {
  catchupConsumer = createConsumer(CATCHUP_WORKER_GROUP_ID, {
    sessionTimeout: Math.max(30000, WORKER_SESSION_TIMEOUT_MS),
    heartbeatInterval: Math.max(1000, WORKER_HEARTBEAT_INTERVAL_MS),
  });
  await catchupConsumer.connect();
  await catchupConsumer.subscribe({ topic: KAFKA_TOPICS.AI_CATCHUP_JOBS, fromBeginning: false });

  await catchupConsumer.run({
    eachMessage: async ({ message, heartbeat }: EachMessagePayload) => {
      if (!message.value) return;
      const stopHeartbeat = startHeartbeatLoop(heartbeat);

      try {
        const payload = JSON.parse(message.value.toString()) as CatchupJobPayload;
        if (payload.itemId || payload.type === 'catchup_digest') {
          logger.debug('[AI Catch-up Worker] Skipping AI Assistant job', {
            digestId: payload.digestId,
            itemId: payload.itemId,
            type: payload.type,
          });
          return;
        }

        if (!payload.digestId || !payload.userId || !payload.conversationId) {
          logger.warn('[AI Catch-up Worker] Invalid job payload', payload);
          return;
        }
        await processCatchupJob(payload);
      } catch (err) {
        logger.error('[AI Catch-up Worker] Job handling failed', err);
      } finally {
        stopHeartbeat();
      }
    },
  });

  logger.info(`[AI Catch-up Worker] Started (groupId: ${CATCHUP_WORKER_GROUP_ID})`);
}

export async function stopCatchupWorker(): Promise<void> {
  if (!catchupConsumer) return;

  try {
    await catchupConsumer.disconnect();
    catchupConsumer = null;
    logger.info('[AI Catch-up Worker] Stopped');
  } catch (err) {
    logger.error('[AI Catch-up Worker] Error on stop', err);
  }
}
