import { z } from 'zod';

export const UpdateAccountSettingsSchema = z
  .object({
    toastNotifications: z.boolean().optional(),
    allowSearchProfile: z.boolean().optional(),
    allowFriendRequest: z.boolean().optional(),
    allowMessagesFrom: z.enum(['everyone', 'friends_only']).optional(),
    showOnlineStatus: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one setting must be provided',
  });

export type UpdateAccountSettingsDto = z.infer<typeof UpdateAccountSettingsSchema>;
