/**
 * Moderation Service â€“ AI-1 (Content Moderation)
 *
 * Primary:  Gemini Flash text/image classification
 * Fallback: Keyword regex filter (VN + EN)
 * Fail-open: When AI unavailable â†’ keyword filter â†’ pass with logging
 *
 * Scoring thresholds (matches plan spec):
 *   < 0.3  â†’ safe    â†’ pass through
 *   0.3â€“0.7 â†’ warning â†’ flag for admin review
 *   > 0.7  â†’ blocked  â†’ hide message + notify user
 */

import { getModel, AI_MODELS, isAIEnabled } from '../../../infrastructure/gemini';
import { runKeywordFilter } from './keyword-filter';
import { ModerationLogModel, type ModerationLabel, type ModerationAction, type ContentType } from './moderation.model';
import { logger } from '../../../shared/logger';
import { ConversationMemberModel } from '../../conversations/conversation-member.model';
import { UserModel } from '../../users/user.model';
import { MessageModel } from '../../messages/message.model';
import { MessagesService } from '../../messages/messages.service';
import { produceNotificationEvent } from '../../notifications/notifications.service';
import { getIO } from '../../../socket/gateway';
import { BadRequestError, ForbiddenError } from '../../../shared/errors';
import { checkIdempotencyKey } from '../../../infrastructure/redis';
import {
  PENALTY_BLOCK_PERCENT,
  applyPenaltyScore,
} from './penalty-policy';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface ModerationInput {
  messageId: string;
  conversationId: string;
  senderId: string;
  contentType: ContentType;
  content?: string;
  mediaUrl?: string;
}

export interface ModerationResult {
  label: ModerationLabel;
  confidence: number;
  action: ModerationAction;
  reason?: string;
  source: 'gemini' | 'keyword_filter';
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const THRESHOLD_WARNING = 0.3;
const THRESHOLD_BLOCK   = 0.7;
const REPORT_LOOKUP_RETRY_ATTEMPTS = 10;
const REPORT_LOOKUP_RETRY_BASE_DELAY_MS = 200;

// â”€â”€â”€ Core classification â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Classify text content using Gemini Flash.
 * Returns a structured score from Gemini's response.
 */
async function classifyTextWithGemini(text: string): Promise<{ label: ModerationLabel; confidence: number; reason: string }> {
  const model = getModel(AI_MODELS.FALLBACK); // Use Flash for moderation (speed + free tier)

  const prompt = `You are a content moderation assistant. Analyze the following message and classify it.

Message: "${text.slice(0, 1000)}"

Respond ONLY with a JSON object in this exact format (no markdown, no explanation):
{
  "label": "safe" | "warning" | "blocked",
  "confidence": 0.0-1.0,
  "reason": "brief explanation in 1 sentence"
}

Classification rules:
- "safe" (confidence < 0.3): Normal conversation, no issues
- "warning" (0.3-0.7): Mildly offensive, hate speech, potential spam â€” flag for review
- "blocked" (> 0.7): Severe: explicit threats, extreme hate, harassment, NSFW, scam`;

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini timeout')), 8000)),
  ]);

  const raw = result.response.text().trim();

  // Extract JSON from response (handles cases where model adds extra text)
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error('Invalid Gemini response format');

  const parsed = JSON.parse(jsonMatch[0]) as {
    label?: string;
    confidence?: number;
    reason?: string;
  };

  const label = (['safe', 'warning', 'blocked'].includes(parsed.label ?? ''))
    ? (parsed.label as ModerationLabel)
    : 'safe';

  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.1;

  return { label, confidence, reason: parsed.reason ?? 'Classified by Gemini' };
}

/**
 * Classify image content using Gemini Vision.
 * Only runs when mediaUrl is provided and AI is enabled.
 */
async function classifyImageWithGemini(mediaUrl: string): Promise<{ label: ModerationLabel; confidence: number; reason: string }> {
  const model = getModel(AI_MODELS.FALLBACK);

  const prompt = `You are a content moderation assistant. Check if this image URL contains inappropriate content.
URL: ${mediaUrl}

Respond ONLY with JSON:
{
  "label": "safe" | "warning" | "blocked",
  "confidence": 0.0-1.0,
  "reason": "brief explanation"
}`;

  const result = await Promise.race([
    model.generateContent(prompt),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Vision timeout')), 10000)),
  ]);

  const raw = result.response.text().trim();
  const jsonMatch = raw.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error('Invalid Gemini Vision response');

  const parsed = JSON.parse(jsonMatch[0]) as { label?: string; confidence?: number; reason?: string };
  const label = (['safe', 'warning', 'blocked'].includes(parsed.label ?? ''))
    ? (parsed.label as ModerationLabel)
    : 'safe';
  const confidence = typeof parsed.confidence === 'number'
    ? Math.max(0, Math.min(1, parsed.confidence))
    : 0.1;

  return { label, confidence, reason: parsed.reason ?? 'Classified by Gemini Vision' };
}

// â”€â”€â”€ Action escalation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function labelToAction(label: ModerationLabel, confidence: number): ModerationAction {
  if (label === 'blocked' && confidence > THRESHOLD_BLOCK) return 'block';
  if (label === 'warning' && confidence >= THRESHOLD_WARNING) return 'flag';
  return 'pass';
}

function buildMessageReferenceQuery(messageReference: string): Record<string, unknown> {
  if (/^[a-fA-F0-9]{24}$/.test(messageReference)) {
    return {
      $or: [
        { _id: messageReference },
        { idempotencyKey: messageReference },
      ],
    };
  }

  return { idempotencyKey: messageReference };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function findMessageForReport(messageReference: string) {
  for (let attempt = 1; attempt <= REPORT_LOOKUP_RETRY_ATTEMPTS; attempt += 1) {
    const message = await MessageModel.findOne(buildMessageReferenceQuery(messageReference));
    if (message) return message;

    if (attempt < REPORT_LOOKUP_RETRY_ATTEMPTS) {
      await wait(REPORT_LOOKUP_RETRY_BASE_DELAY_MS * attempt);
    }
  }

  if (!/^[a-fA-F0-9]{24}$/.test(messageReference)) {
    const cached = await checkIdempotencyKey(messageReference);
    if (cached) {
      const conversationId = cached['conversationId'];
      const senderId = cached['senderId'];
      const content = cached['content'];
      const type = cached['type'];

      if (
        typeof conversationId === 'string'
        && typeof senderId === 'string'
        && typeof content === 'string'
        && typeof type === 'string'
      ) {
        return {
          idempotencyKey: messageReference,
          conversationId,
          senderId,
          content,
          type,
          isDeleted: false,
        };
      }
    }
  }

  return null;
}

// â”€â”€â”€ Main moderation function â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function applyPenalty(conversationId: string, userId: string, amount: number) {
  try {
    const member = await ConversationMemberModel.findOne({ conversationId, userId });
    if (!member) return;

    const { mutedUntil, becameMuted } = applyPenaltyScore(member, amount);

    if (becameMuted) {
      await UserModel.findByIdAndUpdate(userId, { $inc: { globalViolationCount: 1 } });
    }

    await member.save();

    // Emit event to inform user of their penalty state in this conversation
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit('user_penalty_updated', {
        conversationId,
        penaltyScore: member.penaltyScore,
        mutedUntil: member.mutedUntil,
      });
    }

    if (becameMuted && mutedUntil) {
      await produceNotificationEvent({
        userId,
        type: 'new_message',
        title: 'Thong bao kiem duyet',
        body: `Ban da dat 100% vi pham va bi khoa chat 5 phut den ${mutedUntil.toLocaleTimeString('vi-VN')}.`,
        conversationId,
        fromUserId: userId,
        data: {
          conversationId,
          action: 'moderation_notice',
        },
      });

      logger.warn(`User ${userId} muted in conversation ${conversationId} due to penalty overflow`);
    }
  } catch (err) {
    logger.error('[Moderation] Failed to apply penalty', err);
  }
}

/**
 * Moderate a message: classify â†’ escalate â†’ log to MongoDB.
 *
 * This now purely runs the local keyword regex. Gemini is only used via the Report feature.
 */
export async function moderateMessage(input: ModerationInput): Promise<ModerationResult> {
  const { messageId, conversationId, senderId, contentType, content, mediaUrl } = input;

  let label: ModerationLabel = 'safe';
  let confidence = 0.1;
  let reason = 'No content to analyze';
  let source: ModerationResult['source'] = 'keyword_filter';

  // â”€â”€ 1. Fast Path: Keyword filter (Regex Only) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (content && contentType === 'text') {
    const kwResult = runKeywordFilter(content);
    label = kwResult.label;
    confidence = kwResult.confidence;
    reason = kwResult.reason;
    source = 'keyword_filter';

    if (label === 'blocked') {
      logger.debug('[Moderation] Blocked by keyword filter', { messageId, confidence });
    } else if (label === 'warning') {
      logger.debug('[Moderation] Warned by keyword filter', { messageId, confidence });
    }
  }

  const action = labelToAction(label, confidence);

  // â”€â”€ Log to MongoDB (async, non-blocking) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  void ModerationLogModel.create({
    messageId,
    conversationId,
    senderId,
    contentType,
    contentText: content?.slice(0, 2000),
    mediaUrl,
    label,
    confidence,
    reason,
    action,
    source,
  }).catch((err) => logger.error('[Moderation] Failed to save moderation log', { messageId, err }));

  logger.info('[Moderation] Result', { messageId, label, confidence, action, source });

  return { label, confidence, action, reason, source };
}

/**
 * Report function to be called by a user. Evaluated by Gemini.
 * Heavy penalty applied if Gemini agrees.
 */
export async function reportAndReviewMessage(messageReference: string, reporterId: string): Promise<ModerationAction> {
  const message = await findMessageForReport(messageReference);
  if (!message || message.isDeleted) {
    throw new BadRequestError('Message not found or already deleted');
  }

  const reporterIsMember = await ConversationMemberModel.exists({
    conversationId: message.conversationId,
    userId: reporterId,
  });
  if (!reporterIsMember) {
    throw new ForbiddenError('You are not allowed to report this message');
  }

  if (message.senderId === reporterId) {
    throw new BadRequestError('Cannot report your own message');
  }

  if (message.type !== 'text' || !message.content) {
    return 'pass';
  }

  // 1. Analyze with Gemini, fallback to keyword filter if Gemini fails.
  let result: { label: ModerationLabel; confidence: number; reason: string };
  let source: 'gemini' | 'keyword_filter' = 'gemini';
  try {
    result = await classifyTextWithGemini(message.content);
  } catch (err) {
    const fallback = runKeywordFilter(message.content);
    result = {
      label: fallback.label,
      confidence: fallback.confidence,
      reason: fallback.reason,
    };
    source = 'keyword_filter';
    logger.warn('[Moderation] Report review fallback to keyword filter', {
      messageReference,
      reporterId,
      err: String(err),
    });
  }

  const action = labelToAction(result.label, result.confidence);

  // 2. Apply standard block penalty if blocked.
  if (action === 'block') {
    await applyPenalty(message.conversationId, message.senderId, PENALTY_BLOCK_PERCENT);

    const io = getIO();
    const messageIdForEmit = message.idempotencyKey ?? messageReference;

    if (io) {
      io.to(`user:${message.senderId}`).emit('content_blocked', {
        messageId: messageIdForEmit,
        conversationId: message.conversationId,
        reason: 'Tin nhan cua ban bi nguoi dung khac bao cao va da qua AI kiem duyet.',
        confidence: result.confidence,
      });

      io.to(`conv:${message.conversationId}`).emit('message_recalled', {
        messageId: messageIdForEmit,
        idempotencyKey: messageIdForEmit,
        conversationId: message.conversationId,
        recalledBy: 'system',
        recalledAt: new Date().toISOString(),
      });
    }

    await produceNotificationEvent({
      userId: message.senderId,
      type: 'new_message',
      title: 'Thong bao kiem duyet',
      body: `Tin nhan cua ban da bi thu hoi do vi pham tieu chuan cong dong (+${PENALTY_BLOCK_PERCENT}%).`,
      conversationId: message.conversationId,
      fromUserId: message.senderId,
      data: {
        conversationId: message.conversationId,
        action: 'moderation_notice',
      },
    });

    if (message.idempotencyKey) {
      try {
        await MessagesService.recallMessageWithRetry(message.idempotencyKey, 'system', true);
      } catch (err) {
        logger.warn('[Moderation] Recall after report failed, keep report result and realtime state', {
          messageReference,
          senderId: message.senderId,
          err: String(err),
        });
      }
    }
  }

  // 3. Persist moderation log.
  await ModerationLogModel.create({
    messageId: message.idempotencyKey ?? messageReference,
    conversationId: message.conversationId,
    senderId: message.senderId,
    contentType: message.type,
    contentText: message.content.slice(0, 2000),
    label: result.label,
    confidence: result.confidence,
    reason: result.reason,
    action,
    source,
  });

  return action;
}