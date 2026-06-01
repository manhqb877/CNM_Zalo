import { z } from 'zod';

export const SendFriendRequestSchema = z.object({
  toUserId: z.string().min(1).optional(),
  targetUserId: z.string().min(1).optional(),
  receiverId: z.string().min(1).optional(),
  userId: z.string().min(1).optional(),
}).transform((data, ctx) => {
  const toUserId = data.toUserId ?? data.targetUserId ?? data.receiverId ?? data.userId;
  if (!toUserId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toUserId'],
      message: 'toUserId is required',
    });
    return z.NEVER;
  }

  return { toUserId };
});

export type SendFriendRequestDto = z.infer<typeof SendFriendRequestSchema>;

export const ListFriendsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListFriendsQueryDto = z.infer<typeof ListFriendsQuerySchema>;
