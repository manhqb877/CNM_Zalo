import { z } from 'zod';

export const CreateCallSessionSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
  conversationId: z.string().min(1).optional(),
  callType: z.enum(['audio', 'video']).default('video'),
});

export const RejectCallSessionSchema = z.object({
  reason: z.enum(['rejected', 'busy']).default('rejected'),
});

export const EndCallSessionSchema = z.object({
  reason: z.string().min(1).max(100).optional(),
});

export type CreateCallSessionDto = z.infer<typeof CreateCallSessionSchema>;
export type RejectCallSessionDto = z.infer<typeof RejectCallSessionSchema>;
export type EndCallSessionDto = z.infer<typeof EndCallSessionSchema>;
