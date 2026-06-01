import { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { type AuthRequest } from '../../shared/middleware/auth.middleware';
import { BadRequestError } from '../../shared/errors';
import {
  GetNotificationsQuerySchema,
  type MarkReadDto,
  type UpdatePreferencesDto,
  type MuteConversationDto,
  type PinConversationDto,
} from './notifications.schema';
import {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  getPreferences,
  updatePreferences,
  muteConversation,
  unmuteConversation,
  pinConversation,
  unpinConversation,
} from './notifications.service';

function parseNotificationsQuery(req: Request): { cursor?: string; limit: number } {
  const parsed = GetNotificationsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    const message = parsed.error instanceof ZodError
      ? parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')
      : 'Validation failed';
    throw new BadRequestError(message);
  }
  return { cursor: parsed.data.cursor, limit: parsed.data.limit };
}

// D1.1 – GET /api/notifications
export async function getNotificationsHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { cursor, limit } = parseNotificationsQuery(req);
    const data = await getNotifications(userId, cursor, limit);
    res.json({ success: true, ...data });
  } catch (err) {
    next(err);
  }
}

// D1.2 – GET /api/notifications/unread-count
export async function getUnreadCountHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const count = await getUnreadCount(userId);
    res.json({ success: true, count });
  } catch (err) {
    next(err);
  }
}

// D1.3 – PATCH /api/notifications/read
export async function markAsReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const { notificationIds } = req.body as MarkReadDto;
    const modified = await markAsRead(userId, notificationIds);
    res.json({ success: true, modified });
  } catch (err) {
    next(err);
  }
}

// D1.4 – PATCH /api/notifications/read-all
export async function markAllAsReadHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const modified = await markAllAsRead(userId);
    res.json({ success: true, modified });
  } catch (err) {
    next(err);
  }
}

// D1.5 – GET /api/notifications/preferences
export async function getPreferencesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const prefs = await getPreferences(userId);
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
}

// D1.6 – PATCH /api/notifications/preferences
export async function updatePreferencesHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const dto = req.body as UpdatePreferencesDto;
    const prefs = await updatePreferences(userId, dto);
    res.json({ success: true, data: prefs });
  } catch (err) {
    next(err);
  }
}

// D1.7 – POST /api/notifications/mute/:conversationId
export async function muteConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const conversationId = req.params['conversationId'] as string;
    const dto = req.body as MuteConversationDto;
    await muteConversation(userId, conversationId, dto.until ? new Date(dto.until) : undefined);
    res.json({ success: true, message: 'Conversation muted' });
  } catch (err) {
    next(err);
  }
}

// D1.8 – DELETE /api/notifications/mute/:conversationId
export async function unmuteConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const conversationId = req.params['conversationId'] as string;
    await unmuteConversation(userId, conversationId);
    res.json({ success: true, message: 'Conversation unmuted' });
  } catch (err) {
    next(err);
  }
}

// D1.9 – POST /api/notifications/pin/:conversationId
export async function pinConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const conversationId = req.params['conversationId'] as string;
    const dto = req.body as PinConversationDto;

    if (dto.pin === false) {
      await unpinConversation(userId, conversationId);
      res.json({ success: true, message: 'Conversation unpinned' });
      return;
    }

    await pinConversation(userId, conversationId);
    res.json({ success: true, message: 'Conversation pinned' });
  } catch (err) {
    next(err);
  }
}

// D1.10 – DELETE /api/notifications/pin/:conversationId
export async function unpinConversationHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { userId } = req as AuthRequest;
    const conversationId = req.params['conversationId'] as string;
    await unpinConversation(userId, conversationId);
    res.json({ success: true, message: 'Conversation unpinned' });
  } catch (err) {
    next(err);
  }
}
