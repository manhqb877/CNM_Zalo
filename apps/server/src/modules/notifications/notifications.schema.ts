import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

// C2.1 – Validate mark-as-read request body
export const MarkReadSchema = z.object({
  notificationIds: z
    .array(z.string().regex(objectIdRegex, 'Invalid notification ID format'))
    .min(1, 'At least one notification ID is required'),
});

export type MarkReadDto = z.infer<typeof MarkReadSchema>;

// C2.2 – Validate update preferences request body
export const UpdatePreferencesSchema = z.object({
  enablePush: z.boolean().optional(),
  enableSound: z.boolean().optional(),
  enableBadge: z.boolean().optional(),
});

export type UpdatePreferencesDto = z.infer<typeof UpdatePreferencesSchema>;

// C2.3 – Validate mute conversation request body
export const MuteConversationSchema = z.object({
  until: z
    .string()
    .datetime({ message: 'Must be a valid ISO 8601 datetime' })
    .optional(),
});

export type MuteConversationDto = z.infer<typeof MuteConversationSchema>;

// C2.4 - Validate pin conversation request body
export const PinConversationSchema = z.object({
  pin: z.boolean().optional(),
});

export type PinConversationDto = z.infer<typeof PinConversationSchema>;

// C2.5 – Validate Web Push subscription body
export const WebPushSubscribeSchema = z.object({
  endpoint: z.string().url('Invalid endpoint URL'),
  keys: z.object({
    p256dh: z.string().min(1, 'p256dh key is required'),
    auth: z.string().min(1, 'auth key is required'),
  }),
});

export type WebPushSubscribeDto = z.infer<typeof WebPushSubscribeSchema>;

// C2.6 – Validate get notifications query params
export const GetNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z
    .coerce.number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .default(20),
});

export type GetNotificationsQueryDto = z.infer<typeof GetNotificationsQuerySchema>;
