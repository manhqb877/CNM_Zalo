import { z } from 'zod';

export const CatchupTriggerSchema = z.enum(['manual', 'auto_suggested']);

export const CreateCatchupDigestSchema = z.object({
  trigger: CatchupTriggerSchema.optional().default('manual'),
  unreadCountHint: z.coerce.number().int().min(0).max(300).optional(),
  toMessageRef: z.string().trim().min(1).max(200).optional(),
});

export const UpdateCatchupSettingsSchema = z.object({
  catchupEnabled: z.boolean(),
});

export const AiCatchupSummarySchema = z.object({
  title: z.string().trim().min(1).max(160),
  overview: z.string().trim().min(1).max(1200),
  bullets: z.array(z.string().trim().min(1).max(500)).max(8).default([]),
  mentionedUserIds: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
  sourceMessageRefs: z.array(z.string().trim().min(1).max(200)).max(120).default([]),
});

export const AiCatchupFutureSignalsSchema = z.object({
  decisions: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  questionsForUser: z.array(z.string().trim().min(1).max(500)).max(20).default([]),
  actionItems: z
    .array(
      z.object({
        text: z.string().trim().min(1).max(500),
        sourceMessageRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
      }),
    )
    .max(20)
    .default([]),
  suggestedReplies: z.array(z.string().trim().min(1).max(300)).max(10).default([]),
});

export const AiCatchupModelOutputSchema = AiCatchupSummarySchema.extend({
  futureSignals: AiCatchupFutureSignalsSchema.optional().default({
    decisions: [],
    questionsForUser: [],
    actionItems: [],
    suggestedReplies: [],
  }),
});

export type CreateCatchupDigestInput = z.infer<typeof CreateCatchupDigestSchema>;
export type AiCatchupModelOutput = z.infer<typeof AiCatchupModelOutputSchema>;
