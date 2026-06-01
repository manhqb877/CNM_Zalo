import { Router, type Request, type Response } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { isAIEnabled } from '../../infrastructure/gemini';
import { isNeonAvailable } from '../../infrastructure/neon';
import { logger } from '../../shared/logger';
import {
  createCatchupDigestHandler,
  getCatchupDigestHandler,
  getLatestCatchupDigestHandler,
  regenerateCatchupDigestHandler,
  updateCatchupSettingsHandler,
} from './catchup/catchup.controller';
import {
  createReminderHandler,
  listRemindersHandler,
  getReminderHandler,
  updateReminderHandler,
  deleteReminderHandler,
} from './reminders/reminder.controller';
import { assistantRouter } from './assistant/assistant.routes';
import { searchAssistantMessagesHandler } from './assistant/assistant.controller';

export const aiRouter = Router();

aiRouter.get('/health', authenticate, (_req: Request, res: Response) => {
  const aiEnabled = isAIEnabled();
  const neonAvailable = isNeonAvailable();

  logger.debug('[AI] Health check requested');

  res.json({
    success: true,
    data: {
      ai: {
        enabled: aiEnabled,
        gemini: aiEnabled ? 'configured' : 'missing GEMINI_API_KEY',
        neon: neonAvailable ? 'configured' : 'missing NEON_DATABASE_URL',
        assistant: process.env['AI_ASSISTANT_ENABLED'] !== 'false',
        search: process.env['AI_SEARCH_ENABLED'] !== 'false',
        catchup: process.env['AI_CATCHUP_ENABLED'] !== 'false',
      },
    },
  });
});

aiRouter.post(
  '/catchup/conversations/:conversationId/digests',
  authenticate,
  createCatchupDigestHandler,
);

aiRouter.get(
  '/catchup/conversations/:conversationId/digests/latest',
  authenticate,
  getLatestCatchupDigestHandler,
);

aiRouter.get(
  '/catchup/digests/:digestId',
  authenticate,
  getCatchupDigestHandler,
);

aiRouter.post(
  '/catchup/digests/:digestId/regenerate',
  authenticate,
  regenerateCatchupDigestHandler,
);

aiRouter.patch(
  '/catchup/conversations/:conversationId/settings',
  authenticate,
  updateCatchupSettingsHandler,
);

// ─── Reminders ──────────────────────────────────────────────────────────────────
aiRouter.post('/reminders', authenticate, createReminderHandler);

aiRouter.get('/reminders', authenticate, listRemindersHandler);

aiRouter.get('/reminders/:reminderId', authenticate, getReminderHandler);

aiRouter.patch('/reminders/:reminderId', authenticate, updateReminderHandler);

aiRouter.delete('/reminders/:reminderId', authenticate, deleteReminderHandler);

// GET /api/ai/search/messages?q=...
aiRouter.get('/search/messages', authenticate, searchAssistantMessagesHandler);

// ─── AI Assistant Box ────────────────────────────────────────────────────────────
aiRouter.use('/assistant', assistantRouter);
