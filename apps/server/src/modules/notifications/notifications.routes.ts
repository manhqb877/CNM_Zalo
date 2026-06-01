import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { validateBody } from '../../shared/middleware/validate.middleware';
import {
  MarkReadSchema,
  UpdatePreferencesSchema,
  MuteConversationSchema,
  PinConversationSchema,
  WebPushSubscribeSchema,
} from './notifications.schema';
import {
  getNotificationsHandler,
  getUnreadCountHandler,
  markAsReadHandler,
  markAllAsReadHandler,
  getPreferencesHandler,
  updatePreferencesHandler,
  muteConversationHandler,
  unmuteConversationHandler,
  pinConversationHandler,
  unpinConversationHandler,
} from './notifications.controller';
import {
  subscribeWebPushHandler,
  unsubscribeWebPushHandler,
  getVapidKeyHandler,
} from './web-push.controller';

export const notificationsRouter = Router();

notificationsRouter.use(authenticate);

// ─── Notification CRUD ───

// GET /api/notifications – list notifications (cursor pagination)
notificationsRouter.get('/', getNotificationsHandler);

// GET /api/notifications/unread-count – badge number
notificationsRouter.get('/unread-count', getUnreadCountHandler);

// PATCH /api/notifications/read – mark specific notifications as read
notificationsRouter.patch('/read', validateBody(MarkReadSchema), markAsReadHandler);

// PATCH /api/notifications/read-all – mark all as read
notificationsRouter.patch('/read-all', markAllAsReadHandler);

// ─── Preferences ───

// GET /api/notifications/preferences
notificationsRouter.get('/preferences', getPreferencesHandler);

// PATCH /api/notifications/preferences
notificationsRouter.patch('/preferences', validateBody(UpdatePreferencesSchema), updatePreferencesHandler);

// ─── Mute / Unmute ───

// POST /api/notifications/mute/:conversationId
notificationsRouter.post('/mute/:conversationId', validateBody(MuteConversationSchema), muteConversationHandler);

// DELETE /api/notifications/mute/:conversationId
notificationsRouter.delete('/mute/:conversationId', unmuteConversationHandler);

// POST /api/notifications/pin/:conversationId
notificationsRouter.post('/pin/:conversationId', validateBody(PinConversationSchema), pinConversationHandler);

// DELETE /api/notifications/pin/:conversationId
notificationsRouter.delete('/pin/:conversationId', unpinConversationHandler);

// ─── Web Push ───

// POST /api/notifications/web-push/subscribe
notificationsRouter.post('/web-push/subscribe', validateBody(WebPushSubscribeSchema), subscribeWebPushHandler);

// DELETE /api/notifications/web-push/unsubscribe
notificationsRouter.delete('/web-push/unsubscribe', unsubscribeWebPushHandler);

// GET /api/notifications/web-push/vapid-key
notificationsRouter.get('/web-push/vapid-key', getVapidKeyHandler);
