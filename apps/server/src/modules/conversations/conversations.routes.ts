import { Router } from 'express';
import { authenticate } from '../../shared/middleware/auth.middleware';
import { getOrCreateDirectConversationHandler, listConversationsHandler } from './conversations.controller';

export const conversationsRouter = Router();

conversationsRouter.use(authenticate);

// GET /api/conversations – list conversations (cursor paginated, hiện tại lấy tất cả)
conversationsRouter.get('/', listConversationsHandler);

// POST /api/conversations/direct – find or create direct conversation (body: targetUserId)
conversationsRouter.post('/direct', getOrCreateDirectConversationHandler);

// GET /api/conversations/direct?userId=... – find or create direct conversation (query: userId)
conversationsRouter.get('/direct', getOrCreateDirectConversationHandler);

// GET /api/conversations/:conversationId
conversationsRouter.get('/:conversationId', (_req, res) => {
  res.status(501).json({ success: false, error: 'Not implemented yet' });
});
