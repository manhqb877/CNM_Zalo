import { z } from 'zod';

export const CreateReminderSchema = z.object({
  conversationId: z.string().trim().min(1),
  digestId: z.string().trim().optional(),
  sourceMessageRefs: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime().optional(),
  createdBy: z.enum(['ai_suggestion', 'user']).optional(),
  status: z.enum(['suggested', 'accepted', 'done', 'dismissed']).optional(),
});

export const UpdateReminderSchema = z.object({
  status: z.enum(['suggested', 'accepted', 'done', 'dismissed']).optional(),
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(1000).optional(),
  dueAt: z.string().datetime().nullable().optional(),
});

export type CreateReminderInput = z.infer<typeof CreateReminderSchema>;
export type UpdateReminderInput = z.infer<typeof UpdateReminderSchema>;
